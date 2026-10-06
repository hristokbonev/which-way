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

// Runs a filesystem read; a missing path yields `fallback`, a denied one is
// recorded in `skipped` and also yields `fallback`.
async function attempt(read, path, fallback, skipped) {
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

async function directories(path, skipped) {
  return attempt(async () => {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort();
  }, path, [], skipped);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function files(path, extension, skipped) {
  return attempt(async () => (await readdir(path)).filter((name) => name.endsWith(extension)).sort(), path, [], skipped);
}

async function readDefinition(path, skipped) {
  return attempt(async () => parseFrontmatter(await readFile(path, 'utf8')), dirname(path), null, skipped);
}

function entry(kind, name, fields, source, path, plugin = null) {
  const invoke = {
    skill: plugin ? `${plugin.name}:${name}` : `/${name}`,
    command: `/${plugin?.name}:${name}`,
    agent: `subagent_type: ${plugin?.name}:${name}`,
  }[kind];
  return {
    name,
    kind,
    description: fields.description ?? '',
    source,
    path,
    userOnly: fields['disable-model-invocation'] === 'true',
    plugin: plugin?.name ?? null,
    enabled: plugin ? plugin.enabled : true,
    invoke,
  };
}

async function skillRoot(root, source, skipped, plugin) {
  const entries = [];
  for (const folder of await directories(root, skipped)) {
    const fields = await readDefinition(join(root, folder, 'SKILL.md'), skipped);
    if (!fields) continue;
    const path = await realpath(join(root, folder, 'SKILL.md'));
    entries.push(entry('skill', fields.name || folder, fields, source, path, plugin));
  }
  return entries;
}

// Plugin commands are named by their file; agents by frontmatter, falling back to the file.
async function definitionFiles(root, kind, skipped, plugin) {
  const entries = [];
  for (const file of await files(root, '.md', skipped)) {
    const path = join(root, file);
    const fields = await readDefinition(path, skipped);
    if (!fields) continue;
    const name = (kind === 'agent' && fields.name) || basename(file, '.md');
    entries.push(entry(kind, name, fields, 'plugin', await realpath(path), plugin));
  }
  return entries;
}

// enabledPlugins from user settings, overridden by the project's shared and local settings.
async function enabledPlugins(home, cwd) {
  const merged = {};
  for (const path of [
    join(home, '.claude/settings.json'),
    join(cwd, '.claude/settings.json'),
    join(cwd, '.claude/settings.local.json'),
  ]) Object.assign(merged, (await readJson(path))?.enabledPlugins);
  return merged;
}

// Only each record's installPath is current; sibling version folders are stale caches.
async function pluginEntries(home, cwd, skipped) {
  const records = (await readJson(join(home, '.claude/plugins/installed_plugins.json')))?.plugins ?? {};
  const enabled = await enabledPlugins(home, cwd);
  const entries = [];
  for (const [key, installs] of Object.entries(records)) {
    const plugin = { name: key.split('@')[0], enabled: enabled[key] ?? null };
    for (const { installPath } of installs) {
      entries.push(
        ...await skillRoot(join(installPath, 'skills'), 'plugin', skipped, plugin),
        ...await definitionFiles(join(installPath, 'commands'), 'command', skipped, plugin),
        ...await definitionFiles(join(installPath, 'agents'), 'agent', skipped, plugin),
      );
      for (const version of await directories(dirname(installPath), skipped)) {
        const path = join(dirname(installPath), version);
        if (path !== installPath) skipped.push({ path, reason: 'stale plugin version' });
      }
    }
  }
  return entries;
}

// Symlinked roots (e.g. ~/.claude/skills/x -> ~/.agents/skills/x) point at one
// file; keep the first listing of each real path.
function dedupe(entries) {
  const seen = new Set();
  return entries.filter((entry) => !seen.has(entry.path) && seen.add(entry.path));
}

function collisions(entries) {
  const byName = new Map();
  for (const { name, invoke } of entries) byName.set(name, [...(byName.get(name) ?? []), invoke]);
  return [...byName]
    .filter(([, invokes]) => invokes.length > 1)
    .map(([name, invokes]) => ({ name, invokes }));
}

export async function inventory({ home, cwd }) {
  const roots = [
    [join(home, '.claude/skills'), 'user'],
    [join(home, '.agents/skills'), 'user'],
    [join(cwd, '.claude/skills'), 'project'],
    [join(cwd, '.agents/skills'), 'project'],
  ];
  const entries = [];
  const skipped = [];
  for (const [root, source] of roots) entries.push(...await skillRoot(root, source, skipped));
  entries.push(...await pluginEntries(home, cwd, skipped));
  const unique = dedupe(entries);
  return { entries: unique, collisions: collisions(unique), skipped };
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
