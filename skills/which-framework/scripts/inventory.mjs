import { readdir, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// Reads the leading `---` block of a definition file. Handles the shapes skill
// and agent files use: `key: value`, quoted values, and `|` / `>` block scalars.
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const fields = {};
  const rows = match[1].split(/\r?\n/);
  for (let i = 0; i < rows.length; i += 1) {
    const row = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(rows[i]);
    if (!row) continue;
    let [, key, value] = row;
    if (value === '|' || value === '>' || value === '|-' || value === '>-') {
      const block = [];
      while (i + 1 < rows.length && /^\s+\S|^\s*$/.test(rows[i + 1])) block.push(rows[++i].trim());
      value = block.join(value.startsWith('|') ? '\n' : ' ').trim();
    } else if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}

async function directories(path) {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function files(path, extension) {
  try {
    return (await readdir(path)).filter((name) => name.endsWith(extension)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readSkill(path) {
  try {
    return parseFrontmatter(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
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

async function skillRoot(root, source, plugin) {
  const entries = [];
  for (const folder of await directories(root)) {
    const fields = await readSkill(join(root, folder, 'SKILL.md'));
    if (!fields) continue;
    const path = await realpath(join(root, folder, 'SKILL.md'));
    entries.push(entry('skill', fields.name || folder, fields, source, path, plugin));
  }
  return entries;
}

// Plugin commands are named by their file; agents by frontmatter, falling back to the file.
async function definitionFiles(root, kind, plugin) {
  const entries = [];
  for (const file of await files(root, '.md')) {
    const path = join(root, file);
    const fields = await readSkill(path);
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
        ...await skillRoot(join(installPath, 'skills'), 'plugin', plugin),
        ...await definitionFiles(join(installPath, 'commands'), 'command', plugin),
        ...await definitionFiles(join(installPath, 'agents'), 'agent', plugin),
      );
      for (const version of await directories(dirname(installPath))) {
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

export async function inventory({ home, cwd }) {
  const roots = [
    [join(home, '.claude/skills'), 'user'],
    [join(home, '.agents/skills'), 'user'],
    [join(cwd, '.claude/skills'), 'project'],
    [join(cwd, '.agents/skills'), 'project'],
  ];
  const entries = [];
  const skipped = [];
  for (const [root, source] of roots) entries.push(...await skillRoot(root, source));
  entries.push(...await pluginEntries(home, cwd, skipped));
  return { entries: dedupe(entries), skipped };
}
