import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { inventory } from '../skills/which-framework/scripts/inventory.mjs';
import { runCli } from '../src/cli.js';

async function world() {
  const root = await mkdtemp(join(tmpdir(), 'which-way-inventory-'));
  const home = join(root, 'home');
  const cwd = join(root, 'project');
  await mkdir(home, { recursive: true });
  await mkdir(cwd, { recursive: true });
  const write = async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  };
  const skill = (dir, name, extra = '') => write(join(dir, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} does things\n${extra}---\n\nBody of ${name}.\n`);
  return { root, home, cwd, write, skill };
}

const byName = (result, name) => result.entries.find((entry) => entry.name === name);

test('user skills are listed with their description and invocation restrictions', async () => {
  const { home, cwd, skill } = await world();
  await skill(join(home, '.claude/skills'), 'tdd');
  await skill(join(home, '.claude/skills'), 'retro', 'disable-model-invocation: true\n');

  const result = await inventory({ home, cwd });

  assert.deepEqual(byName(result, 'tdd'), {
    name: 'tdd', kind: 'skill', description: 'tdd does things', source: 'user',
    path: join(home, '.claude/skills/tdd/SKILL.md'), userOnly: false,
    plugin: null, invoke: '/tdd',
  });
  assert.equal(byName(result, 'retro').userOnly, true);
});

test('every skill root is read, and a symlinked skill is listed once at its real path', async () => {
  const { home, cwd, skill, write } = await world();
  await skill(join(home, '.agents/skills'), 'grilling');
  await mkdir(join(home, '.claude/skills'), { recursive: true });
  await symlink(join(home, '.agents/skills/grilling'), join(home, '.claude/skills/grilling'));
  await skill(join(cwd, '.claude/skills'), 'deploy');
  await skill(join(cwd, '.agents/skills'), 'local-only');
  await write(join(home, '.claude/skills/folded/SKILL.md'),
    '---\nname: folded\ndescription: >\n  Spans two\n  lines.\n---\n');

  const result = await inventory({ home, cwd });

  assert.deepEqual(result.entries.map(({ name, source }) => `${source}:${name}`).sort(), [
    'project:deploy', 'project:local-only', 'user:folded', 'user:grilling',
  ]);
  assert.equal(byName(result, 'grilling').path, join(home, '.agents/skills/grilling/SKILL.md'));
  assert.equal(byName(result, 'folded').description, 'Spans two lines.');
});

async function plugins({ home, write }, records, enabledPlugins) {
  const installed = {};
  for (const [key, version] of Object.entries(records)) {
    const [name, marketplace] = key.split('@');
    installed[key] = [{ scope: 'user', installPath: join(home, '.claude/plugins/cache', marketplace, name, version), version }];
  }
  await write(join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: installed }));
  await write(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins }));
}

test('plugin skills, commands and agents come from the installed version only', async () => {
  const w = await world();
  const { home, cwd, write, skill } = w;
  const kit = join(home, '.claude/plugins/cache/market/kit');
  await plugins(w, { 'kit@market': '2.0', 'off@market': '1.0' }, { 'kit@market': true, 'off@market': false });
  await skill(join(kit, '2.0/skills'), 'helper');
  await write(join(kit, '2.0/commands/audit.md'), '---\ndescription: Audit a PR\nallowed-tools: Bash(gh pr view:*)\n---\nBody\n');
  await write(join(kit, '2.0/agents/checker.md'), '---\nname: checker\ndescription: Checks things\nmodel: opus\n---\nBody\n');
  await skill(join(kit, '1.0/skills'), 'helper-old');
  await skill(join(home, '.claude/plugins/cache/market/off/1.0/skills'), 'dormant');

  const result = await inventory({ home, cwd });

  assert.deepEqual(result.entries.map((e) => [e.kind, e.name, e.plugin, e.invoke]), [
    ['skill', 'helper', 'kit', '/kit:helper'],
    ['command', 'audit', 'kit', '/kit:audit'],
    ['agent', 'checker', 'kit', 'subagent_type: kit:checker'],
  ]);
  assert.equal(byName(result, 'audit').description, 'Audit a PR');
  assert.equal(byName(result, 'audit').source, 'plugin');
  assert.deepEqual(result.skipped, [
    { path: join(kit, '1.0'), reason: 'stale plugin version' },
    { path: join(home, '.claude/plugins/cache/market/off/1.0'), reason: 'plugin not enabled' },
  ]);
});

test('project settings can disable a plugin, and its entries are left out', async () => {
  const w = await world();
  const { home, cwd, write, skill } = w;
  await plugins(w, { 'code-review@market': '1.0' }, { 'code-review@market': true });
  await write(join(home, '.claude/plugins/cache/market/code-review/1.0/commands/code-review.md'), '---\ndescription: PR review\n---\n');
  await write(join(cwd, '.claude/settings.local.json'), JSON.stringify({ enabledPlugins: { 'code-review@market': false } }));
  await skill(join(home, '.claude/skills'), 'code-review');

  const result = await inventory({ home, cwd });

  assert.equal(result.entries.some((e) => e.kind === 'command'), false);
  assert.deepEqual(result.collisions, []);
});

test('unreadable locations are reported as skipped and the rest is still listed', async () => {
  const { home, cwd, skill } = await world();
  await skill(join(home, '.claude/skills'), 'fine');
  await skill(join(home, '.agents/skills'), 'locked');
  await chmod(join(home, '.agents/skills/locked'), 0o000);
  await skill(join(cwd, '.claude/skills'), 'hidden');
  await chmod(join(cwd, '.claude/skills'), 0o000);

  try {
    const result = await inventory({ home, cwd });
    assert.deepEqual(result.entries.map((e) => e.name), ['fine']);
    assert.deepEqual(result.skipped.map((s) => s.reason), ['unreadable', 'unreadable']);
  } finally {
    await chmod(join(home, '.agents/skills/locked'), 0o755);
    await chmod(join(cwd, '.claude/skills'), 0o755);
  }
});

test('the script and which-way inventory print the same JSON', async () => {
  const { home, cwd, skill } = await world();
  await skill(join(home, '.claude/skills'), 'tdd');
  const script = new URL('../skills/which-framework/scripts/inventory.mjs', import.meta.url).pathname;

  const { stdout } = await promisify(execFile)(process.execPath, [script], { cwd, env: { ...process.env, HOME: home } });
  assert.deepEqual(JSON.parse(stdout).entries.map((e) => e.name), ['tdd']);

  let viaCli = '';
  const code = await runCli(['inventory'], {
    cwd, home, stdout: { write: (chunk) => { viaCli += chunk; } }, stderr: { write: () => {} },
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(viaCli), JSON.parse(stdout));

  let errors = '';
  const bad = await runCli(['inventory', '--bogus'], {
    cwd, home, stdout: { write: () => {} }, stderr: { write: (chunk) => { errors += chunk; } },
  });
  assert.equal(bad, 1);
  assert.match(errors, /^inventory: Unknown option: --bogus\n$/);
});

test('a description continued on indented lines is read in full', async () => {
  const { home, cwd, write } = await world();
  await write(join(home, '.claude/skills/plain/SKILL.md'),
    '---\nname: plain\ndescription:\n  React composition patterns that scale. Use when\n  refactoring components.\nlicense: MIT\n---\n');

  const result = await inventory({ home, cwd });
  assert.equal(byName(result, 'plain').description, 'React composition patterns that scale. Use when refactoring components.');
});

test('every router ships an identical copy of the inventory script', async () => {
  const source = new URL('../skills/which-framework/scripts/inventory.mjs', import.meta.url);
  for (const skill of ['which-codereview', 'which-security-review']) {
    const copy = new URL(`../skills/${skill}/scripts/inventory.mjs`, import.meta.url);
    assert.equal(await readFile(copy, 'utf8'), await readFile(source, 'utf8'),
      `skills/${skill}/scripts/inventory.mjs differs; copy it from skills/which-framework/scripts/`);
  }
});

test('a plugin missing from enabledPlugins is left out', async () => {
  const w = await world();
  await plugins(w, { 'quiet@market': '1.0' }, {});
  await w.skill(join(w.home, '.claude/plugins/cache/market/quiet/1.0/skills'), 'hush');

  const result = await inventory({ home: w.home, cwd: w.cwd });
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.skipped.map((s) => s.reason), ['plugin not enabled']);
});

test('project skills are found from a subfolder of the repository', async () => {
  const { home, cwd, skill } = await world();
  await mkdir(join(cwd, '.git'));
  await skill(join(cwd, '.claude/skills'), 'deploy');
  const sub = join(cwd, 'packages/api/src');
  await mkdir(sub, { recursive: true });

  const result = await inventory({ home, cwd: sub });
  assert.deepEqual(result.entries.map((e) => `${e.source}:${e.name}`), ['project:deploy']);
});

test('installs scoped to another project are ignored and every current install is kept', async () => {
  const { home, cwd, write, skill } = await world();
  await mkdir(join(cwd, '.git'));
  const cache = join(home, '.claude/plugins/cache/market/kit');
  const record = (version, scope, projectPath) => ({ scope, installPath: join(cache, version), version, ...(projectPath && { projectPath }) });
  await write(join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: {
    'kit@market': [record('2.0', 'user'), record('3.0', 'project', cwd), record('4.0', 'project', '/elsewhere')],
  } }));
  await write(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'kit@market': true } }));
  for (const version of ['1.0', '2.0', '3.0', '4.0']) await skill(join(cache, version, 'skills'), `helper-${version}`);

  const result = await inventory({ home, cwd });
  assert.deepEqual(result.entries.map((e) => e.name), ['helper-2.0', 'helper-3.0']);
  assert.deepEqual(result.skipped, [{ path: join(cache, '1.0'), reason: 'stale plugin version' }]);
});

test('collisions are invocations that more than one definition answers to', async () => {
  const w = await world();
  await plugins(w, { 'a@market': '1.0', 'b@market': '1.0' }, { 'a@market': true, 'b@market': true });
  await w.write(join(w.home, '.claude/plugins/cache/market/a/1.0/agents/reviewer.md'), '---\nname: reviewer\n---\n');
  await w.write(join(w.home, '.claude/plugins/cache/market/b/1.0/agents/reviewer.md'), '---\nname: reviewer\n---\n');
  await w.skill(join(w.home, '.claude/skills'), 'tdd');
  await w.skill(join(w.cwd, '.claude/skills'), 'tdd');

  const result = await inventory({ home: w.home, cwd: w.cwd });
  assert.deepEqual(result.collisions, [{ invoke: '/tdd', paths: [
    join(w.home, '.claude/skills/tdd/SKILL.md'), join(w.cwd, '.claude/skills/tdd/SKILL.md'),
  ] }]);
});

test('an unreadable settings file is reported, not fatal', async () => {
  const w = await world();
  await plugins(w, { 'kit@market': '1.0' }, { 'kit@market': true });
  await w.skill(join(w.home, '.claude/skills'), 'tdd');
  await chmod(join(w.home, '.claude/settings.json'), 0o000);
  try {
    const result = await inventory({ home: w.home, cwd: w.cwd });
    assert.deepEqual(result.entries.map((e) => e.name), ['tdd']);
    assert.ok(result.skipped.some((s) => s.reason === 'unreadable' && s.path.endsWith('settings.json')));
  } finally {
    await chmod(join(w.home, '.claude/settings.json'), 0o644);
  }
});
