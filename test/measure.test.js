import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { measure } from '../skills/which-codereview/scripts/measure.mjs';

const run = promisify(execFile);

async function repo() {
  const cwd = await mkdtemp(join(tmpdir(), 'which-way-measure-'));
  const git = async (...args) => (await run('git', args, { cwd })).stdout.trim();
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
  await git('config', 'commit.gpgsign', 'false');
  const write = async (path, content) => {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), content);
  };
  const commit = async (message) => {
    await git('add', '-A');
    await git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return { cwd, git, write, commit };
}

test('committed range counts files, lines and commits against the merge-base', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('a.txt', 'one\ntwo\n');
  await commit('base');
  await git('switch', '-q', '-c', 'feature');
  await write('a.txt', 'one\nTWO\nthree\n');
  await commit('edit a');
  await write('b.txt', 'new\n');
  await commit('add b');

  const result = await measure({ cwd, target: { kind: 'range', base: 'main' } });

  assert.equal(result.target.kind, 'range');
  assert.equal(result.files, 2);
  assert.equal(result.added, 3);
  assert.equal(result.removed, 1);
  assert.equal(result.changed, 4);
  assert.equal(result.commits, 2);
  assert.equal(result.empty, false);
});

test('renames count as one file and binary files are listed without line counts', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('old name.txt', 'a\nb\nc\nd\ne\n');
  await commit('base');
  await git('switch', '-q', '-c', 'feature');
  await git('mv', 'old name.txt', 'new name.txt');
  await write('new name.txt', 'a\nb\nc\nd\nE\n');
  await write('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 0, 3]));
  await commit('rename and add binary');

  const result = await measure({ cwd, target: { kind: 'range', base: 'main' } });

  assert.equal(result.files, 2);
  assert.deepEqual(result.renames, [{ from: 'old name.txt', to: 'new name.txt' }]);
  assert.deepEqual(result.binary, ['logo.png']);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
});

test('an unknown fixed point is an error, not an empty diff', async () => {
  const { cwd, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await commit('base');

  for (const base of ['no-such-branch', '--output=/tmp/x']) {
    await assert.rejects(
      measure({ cwd, target: { kind: 'range', base } }),
      { code: 'BAD_REF', message: new RegExp(`Unknown ref: ${base}`) },
    );
  }
});

test('staged and unstaged targets measure only their own side of the index', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await write('b.txt', 'b\n');
  await commit('base');
  await write('a.txt', 'a\nstaged\n');
  await git('add', 'a.txt');
  await write('b.txt', 'b\nunstaged\nunstaged\n');

  const staged = await measure({ cwd, target: { kind: 'staged' } });
  assert.equal(staged.target.kind, 'staged');
  assert.equal(staged.files, 1);
  assert.equal(staged.added, 1);
  assert.equal(staged.commits, null);

  const unstaged = await measure({ cwd, target: { kind: 'unstaged' } });
  assert.equal(unstaged.target.kind, 'unstaged');
  assert.equal(unstaged.files, 1);
  assert.equal(unstaged.added, 2);
  assert.equal(unstaged.commits, null);
});

test('working tree measures the final delta once and adds untracked files', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('.gitignore', 'ignored.log\n');
  await write('a.txt', 'a\n');
  await write('b.txt', 'b\n');
  await commit('base');
  await write('a.txt', 'a\nreverted\n');
  await git('add', 'a.txt');
  await write('a.txt', 'a\n');
  await write('b.txt', 'b\nmore\n');
  await write('c.txt', 'one\ntwo\n');
  await write('dist/bundle.js', 'x\n');
  await write('ignored.log', 'noise\n');

  const result = await measure({
    cwd,
    target: { kind: 'working-tree', excludeUntracked: ['dist/**'] },
  });

  assert.equal(result.target.kind, 'working-tree');
  assert.equal(result.files, 2);
  assert.equal(result.added, 3);
  assert.deepEqual(result.untracked, { included: ['c.txt'], excluded: ['dist/bundle.js'] });
  assert.equal(result.commits, null);
});
