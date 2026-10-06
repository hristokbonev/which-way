import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli.js';

async function invoke(args) {
  const root = await mkdtemp(join(tmpdir(), 'which-way-cli-'));
  const cwd = join(root, 'project');
  const home = join(root, 'home');
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    cwd,
    home,
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  return { code, stdout, stderr, cwd, home, root };
}

test('list and informational commands report bundled skills without writes', async () => {
  const listed = await invoke(['list']);
  assert.equal(listed.code, 0);
  for (const name of ['which-codereview', 'which-framework', 'which-security-review']) {
    assert.match(listed.stdout, new RegExp(name));
  }
  assert.equal((await invoke(['--version'])).stdout, '0.4.0\n');
  assert.match((await invoke(['--help'])).stdout, /install/);
  assert.match((await invoke([])).stdout, /Usage:/);
  await assert.rejects(lstat(listed.cwd), /ENOENT/);
});

test('installs all by default and one selected skill', async () => {
  const all = await invoke(['install']);
  assert.equal(all.code, 0, all.stderr);
  assert.match(all.stdout, /which-security-review/);
  assert.match(await readFile(join(all.cwd, '.agents/skills/which-framework/SKILL.md'), 'utf8'), /name: which-framework/);
  const one = await invoke(['install', 'which-framework']);
  assert.equal(one.code, 0, one.stderr);
  await assert.rejects(lstat(join(one.cwd, '.agents/skills/which-codereview')), /ENOENT/);
});

test('selects project, home, Claude and custom roots', async () => {
  for (const [args, location] of [
    [['--claude'], (r) => join(r.cwd, '.claude/skills')],
    [['--global'], (r) => join(r.home, '.agents/skills')],
    [['--global', '--claude'], (r) => join(r.home, '.claude/skills')],
    [['--dir', 'custom'], (r) => join(r.cwd, 'custom')],
    [['--dir', '/tmp/which-way-absolute-test'], () => '/tmp/which-way-absolute-test'],
  ]) {
    const localArgs = args[0] === '--dir' && args[1].startsWith('/tmp/')
      ? ['--dir', join(await mkdtemp(join(tmpdir(), 'which-way-custom-')), 'skills')]
      : args;
    const result = await invoke(['install', 'which-framework', ...localArgs]);
    assert.equal(result.code, 0, result.stderr);
    const root = localArgs[1] && localArgs[1].startsWith('/tmp/') ? localArgs[1] : location(result);
    assert.match(await readFile(join(root, 'which-framework/SKILL.md'), 'utf8'), /name: which-framework/);
  }
});

test('invalid commands and flags fail before writes', async () => {
  const cases = [
    ['wrong'], ['install', 'missing'], ['install', 'which-framework', 'extra'],
    ['install', '--dir'], ['install', '--dir', '--force'], ['install', '--unknown'],
    ['list', '--force'], ['install', '--dir', 'custom', '--global'],
    ['install', '--dir', 'custom', '--claude'],
  ];
  for (const args of cases) {
    const result = await invoke(args);
    assert.notEqual(result.code, 0, args.join(' '));
    assert.ok(result.stderr.length > 0);
    await assert.rejects(lstat(result.cwd), /ENOENT/);
  }
});
