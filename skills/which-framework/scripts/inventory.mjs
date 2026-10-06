import { existsSync } from 'node:fs';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Reads the leading `---` block of a definition file. Handles the shapes skill
// and agent files use: `key: value`, quoted values, `|` / `>` block scalars and
// plain values continued on indented lines.
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const fields = {};
  const rows = match[1].split(/\r?\n/);
  for (let i = 0; i < rows.length; i += 1) {
    const row = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(rows[i]);
    if (!row) continue;
    let [, key, value] = row;
    if (['', '|', '>', '|-', '>-'].includes(value)) {
      const block = [];
      while (i + 1 < rows.length && /^\s+\S|^\s*$/.test(rows[i + 1])) block.push(rows[++i].trim());
      // `|` keeps line breaks; `>` and a plain value continued on indented lines fold them.
      value = block.join(value.startsWith('|') ? '\n' : ' ').trim();
    } else if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}


const missing = new Set(['ENOENT', 'ENOTDIR']);
const denied = new Set(['EACCES', 'EPERM']);

// Runs a filesystem read. A missing path yields `fallback`; a denied one is
// recorded in `skipped` and also yields `fallback`, so one unreadable location
// never hides the rest of the inventory.
async function readOrSkip(read, path, fallback, skipped) {
  try {
    return await read();
  } catch (error) {
    if (missing.has(error.code)) return fallback;
    if (denied.has(error.code)) {
      skipped.push({ path, reason: 'unreadable' });
      return fallback;
    }
    throw error;
  }
}

const listDirectories = (path, skipped) => readOrSkip(async () => (await readdir(path, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
  .map((entry) => entry.name)
  .sort(), path, [], skipped);

const listMarkdown = (path, skipped) => readOrSkip(async () => (await readdir(path))
  .filter((name) => name.endsWith('.md'))
  .sort(), path, [], skipped);

const readDefinition = (path, skipped) => readOrSkip(
  async () => parseFrontmatter(await readFile(path, 'utf8')), dirname(path), null, skipped);

const readJson = (path, skipped) => readOrSkip(
  async () => JSON.parse(await readFile(path, 'utf8')), path, null, skipped);

// How each kind of definition is named and invoked. Plugin definitions are
// namespaced by the plugin; only skills can live outside a plugin.
const kinds = {
  skill: { invoke: (name, plugin) => (plugin ? `/${plugin}:${name}` : `/${name}`) },
  command: { invoke: (name, plugin) => `/${plugin}:${name}` },
  agent: { invoke: (name, plugin) => `subagent_type: ${plugin}:${name}`, namedByFrontmatter: true },
};

function entry({ kind, name, fields, source, path, plugin = null }) {
  return {
    name,
    kind,
    description: fields.description ?? '',
    source,
    path,
    userOnly: fields['disable-model-invocation'] === 'true',
    plugin,
    invoke: kinds[kind].invoke(name, plugin),
  };
}

async function skillRoot(root, source, skipped, plugin) {
  const entries = [];
  for (const folder of await listDirectories(root, skipped)) {
    const file = join(root, folder, 'SKILL.md');
    const fields = await readDefinition(file, skipped);
    if (!fields) continue;
    entries.push(entry({ kind: 'skill', name: fields.name || folder, fields, source, path: await realpath(file), plugin }));
  }
  return entries;
}

async function definitionFiles(root, kind, skipped, plugin) {
  const entries = [];
  for (const file of await listMarkdown(root, skipped)) {
    const path = join(root, file);
    const fields = await readDefinition(path, skipped);
    if (!fields) continue;
    const name = (kinds[kind].namedByFrontmatter && fields.name) || basename(file, '.md');
    entries.push(entry({ kind, name, fields, source: 'plugin', path: await realpath(path), plugin }));
  }
  return entries;
}

// The repository root: the nearest folder holding `.git`, else the folder itself.
function projectRoot(cwd) {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (dirname(dir) === dir) return cwd;
  }
}

// enabledPlugins from user settings, overridden by the project's shared and local settings.
async function enabledPlugins({ home, project, skipped }) {
  const merged = {};
  for (const path of [
    join(home, '.claude/settings.json'),
    join(project, '.claude/settings.json'),
    join(project, '.claude/settings.local.json'),
  ]) Object.assign(merged, (await readJson(path, skipped))?.enabledPlugins);
  return merged;
}

// An install applies here when it is user-wide or scoped to this project.
const appliesHere = (install, project) => !install.projectPath || install.projectPath === project;

// Only plugins set to `true` in enabledPlugins count. Of an enabled plugin's
// cached versions, those no applicable install points at are stale.
async function pluginEntries(context) {
  const { home, project, skipped } = context;
  const records = (await readJson(join(home, '.claude/plugins/installed_plugins.json'), skipped))?.plugins ?? {};
  const enabled = await enabledPlugins(context);
  const entries = [];
  for (const [key, installs] of Object.entries(records)) {
    const plugin = key.split('@')[0];
    const current = installs.filter((install) => appliesHere(install, project)).map((install) => install.installPath);
    if (enabled[key] !== true) {
      for (const path of current) skipped.push({ path, reason: 'plugin not enabled' });
      continue;
    }
    for (const installPath of current) {
      entries.push(
        ...await skillRoot(join(installPath, 'skills'), 'plugin', skipped, plugin),
        ...await definitionFiles(join(installPath, 'commands'), 'command', skipped, plugin),
        ...await definitionFiles(join(installPath, 'agents'), 'agent', skipped, plugin),
      );
    }
    const allInstalls = new Set(installs.map((install) => install.installPath));
    for (const cacheDir of new Set(current.map((path) => dirname(path)))) {
      for (const version of await listDirectories(cacheDir, skipped)) {
        const path = join(cacheDir, version);
        if (!allInstalls.has(path)) skipped.push({ path, reason: 'stale plugin version' });
      }
    }
  }
  return entries;
}

// Symlinked roots (e.g. ~/.claude/skills/x -> ~/.agents/skills/x) point at one
// file; keep the first listing of each real path.
function dedupe(entries) {
  const seen = new Set();
  return entries.filter((item) => !seen.has(item.path) && seen.add(item.path));
}

// Invocations that more than one definition answers to.
function collisions(entries) {
  const byInvoke = new Map();
  for (const { invoke, path } of entries) byInvoke.set(invoke, [...(byInvoke.get(invoke) ?? []), path]);
  return [...byInvoke]
    .filter(([, paths]) => paths.length > 1)
    .map(([invoke, paths]) => ({ invoke, paths }));
}

export async function inventory({ home, cwd }) {
  const context = { home, project: projectRoot(cwd), skipped: [] };
  const roots = [
    [join(home, '.claude/skills'), 'user'],
    [join(home, '.agents/skills'), 'user'],
    [join(context.project, '.claude/skills'), 'project'],
    [join(context.project, '.agents/skills'), 'project'],
  ];
  const entries = [];
  for (const [root, source] of roots) entries.push(...await skillRoot(root, source, context.skipped));
  entries.push(...await pluginEntries(context));
  const unique = dedupe(entries);
  return { entries: unique, collisions: collisions(unique), skipped: context.skipped };
}

export const usage = `Usage: inventory [--help]

Lists the skills, plugin commands and agents installed for the current user and
project as JSON: user and project skill folders (.claude/skills, .agents/skills)
and each installed plugin's current version. Nothing is cached; every run reads
the files as they are now.
`;

export async function runInventory(args, { cwd, home, stdout, stderr }) {
  if (args.length === 1 && args[0] === '--help') {
    stdout.write(usage);
    return 0;
  }
  try {
    if (args.length) throw new Error(`Unknown option: ${args[0]}`);
    stdout.write(`${JSON.stringify(await inventory({ home, cwd }), null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`inventory: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runInventory(process.argv.slice(2), {
    cwd: process.cwd(), home: homedir(), stdout: process.stdout, stderr: process.stderr,
  });
}
