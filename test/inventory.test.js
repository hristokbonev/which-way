import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { inventory } from '../skills/which-framework/scripts/inventory.mjs';

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
    plugin: null, enabled: true, invoke: '/tdd',
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

  assert.deepEqual(result.entries.map((e) => [e.kind, e.name, e.plugin, e.enabled, e.invoke]), [
    ['skill', 'helper', 'kit', true, 'kit:helper'],
    ['command', 'audit', 'kit', true, '/kit:audit'],
    ['agent', 'checker', 'kit', true, 'subagent_type: kit:checker'],
    ['skill', 'dormant', 'off', false, 'off:dormant'],
  ]);
  assert.equal(byName(result, 'audit').description, 'Audit a PR');
  assert.equal(byName(result, 'audit').source, 'plugin');
  assert.deepEqual(result.skipped, [{ path: join(kit, '1.0'), reason: 'stale plugin version' }]);
});

test('project settings override user settings, and shared names are reported as collisions', async () => {
  const w = await world();
  const { home, cwd, write, skill } = w;
  await plugins(w, { 'code-review@market': '1.0' }, { 'code-review@market': true });
  await write(join(home, '.claude/plugins/cache/market/code-review/1.0/commands/code-review.md'), '---\ndescription: PR review\n---\n');
  await write(join(cwd, '.claude/settings.local.json'), JSON.stringify({ enabledPlugins: { 'code-review@market': false } }));
  await skill(join(home, '.claude/skills'), 'code-review');

  const result = await inventory({ home, cwd });

  assert.equal(result.entries.find((e) => e.kind === 'command').enabled, false);
  assert.deepEqual(result.collisions, [{ name: 'code-review', invokes: ['/code-review', '/code-review:code-review'] }]);
});

test('unreadable locations are reported as skipped and the rest is still listed', async () => {
  const { home, cwd, skill } = await world();
  const { chmod } = await import('node:fs/promises');
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
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { runCli } = await import('../src/cli.js');
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
