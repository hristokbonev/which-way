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

test('an unborn branch measures against the empty tree and says so', async () => {
  const { cwd, git, write } = await repo();
  await write('a.txt', 'a\nb\n');
  await git('add', 'a.txt');
  await write('b.txt', 'c\n');

  const staged = await measure({ cwd, target: { kind: 'staged' } });
  assert.equal(staged.files, 1);
  assert.equal(staged.added, 2);
  assert.equal(staged.target.unbornBranch, true);

  const combined = await measure({ cwd, target: { kind: 'working-tree' } });
  assert.equal(combined.files, 2);
  assert.equal(combined.added, 3);
  assert.equal(combined.target.basis, 'empty tree');
  assert.deepEqual(combined.untracked.included, ['b.txt']);
});

test('auto uses the working tree, or unpushed branch commits when the tree is clean', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('a.txt', 'a\n');
  const main = await commit('base');
  await git('switch', '-q', '-c', 'feature');
  await write('a.txt', 'a\nb\n');
  await commit('feature work');

  const clean = await measure({ cwd });
  assert.equal(clean.target.kind, 'range');
  assert.equal(clean.target.base, main);
  assert.match(clean.target.basis, /auto: clean working tree; merge-base with main/);
  assert.equal(clean.commits, 1);

  await write('a.txt', 'a\nb\nc\n');
  const dirty = await measure({ cwd });
  assert.equal(dirty.target.kind, 'working-tree');
  assert.match(dirty.target.basis, /^auto: /);
  assert.equal(dirty.added, 1);
});

test('auto reports an empty target when nothing is uncommitted or unpushed', async () => {
  const { cwd, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await commit('base');

  const result = await measure({ cwd });
  assert.equal(result.empty, true);
  assert.equal(result.files, 0);
});

test('changed files are grouped under their nearest workspace manifest', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('package.json', '{}\n');
  await write('apps/api/package.json', '{}\n');
  await write('apps/web/pyproject.toml', '[project]\n');
  await write('README.md', 'x\n');
  await commit('base');
  await git('switch', '-q', '-c', 'feature');
  await write('apps/api/src/deep/x.js', 'x\n');
  await write('apps/api/y.js', 'y\n');
  await write('apps/web/z.py', 'z\n');
  await write('README.md', 'x\ny\n');
  await commit('touch three workspaces');

  const result = await measure({ cwd, target: { kind: 'range', base: 'main' } });

  assert.deepEqual(result.workspaces, [
    { manifest: 'apps/api/package.json', files: 2 },
    { manifest: 'apps/web/pyproject.toml', files: 1 },
    { manifest: 'package.json', files: 1 },
  ]);
});

test('a repository without manifests is one workspace', async () => {
  const { cwd, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await commit('base');
  await write('a.txt', 'b\n');

  const result = await measure({ cwd, target: { kind: 'unstaged' } });
  assert.deepEqual(result.workspaces, [{ manifest: null, files: 1 }]);
});

test('files that configure agents, reviewers or checks are flagged as reviewer inputs', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('src/app.js', 'x\n');
  await write('docs/CLAUDE.md', 'old\n');
  await commit('base');
  await git('switch', '-q', '-c', 'feature');
  for (const path of [
    '.claude/skills/review/SKILL.md', '.claude/settings.json', '.agents/skills/x/SKILL.md',
    'AGENTS.md', 'packages/ui/CLAUDE.md', 'CODING_STANDARDS.md', '.mcp.json',
    '.github/workflows/ci.yml', '.husky/pre-commit', 'src/app.js',
  ]) await write(path, 'new\n');
  await git('mv', 'docs/CLAUDE.md', 'docs/NOTES.md');
  await commit('change reviewer inputs');

  const result = await measure({ cwd, target: { kind: 'range', base: 'main' } });

  assert.deepEqual(result.reviewerInputs, [
    '.agents/skills/x/SKILL.md', '.claude/settings.json', '.claude/skills/review/SKILL.md',
    '.github/workflows/ci.yml', '.husky/pre-commit', '.mcp.json', 'AGENTS.md',
    'CODING_STANDARDS.md', 'docs/CLAUDE.md', 'packages/ui/CLAUDE.md',
  ]);
});

test('a PR is measured between its base and head, not against local HEAD', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('a.txt', 'a\n');
  const base = await commit('base');
  await git('switch', '-q', '-c', 'pr-branch');
  await write('a.txt', 'a\nb\n');
  await commit('pr one');
  await write('c.txt', 'c\n');
  const head = await commit('pr two');
  await git('switch', '-q', 'main');
  await write('local.txt', 'unrelated\n');
  await commit('local work');

  const calls = [];
  const gh = async (args) => {
    calls.push(args);
    return JSON.stringify({ baseRefOid: base, headRefOid: head });
  };
  const result = await measure({ cwd, target: { kind: 'pr', number: 42 }, gh });

  assert.deepEqual(calls, [['pr', 'view', '42', '--json', 'baseRefOid,headRefOid']]);
  assert.deepEqual(result.target, { kind: 'pr', number: 42, base, head, unbornBranch: false });
  assert.equal(result.files, 2);
  assert.equal(result.added, 2);
  assert.equal(result.commits, 2);

  const missing = async () => JSON.stringify({ baseRefOid: base, headRefOid: 'f'.repeat(40) });
  await assert.rejects(
    measure({ cwd, target: { kind: 'pr', number: 42 }, gh: missing, fetch: async () => {} }),
    { code: 'BAD_REF' },
  );
});
