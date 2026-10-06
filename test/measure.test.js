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

  assert.deepEqual(calls, [['pr', 'view', '42', '--json', 'baseRefOid,headRefOid,url']]);
  assert.deepEqual(result.target, {
    kind: 'pr', number: 42, base, head, basis: 'merge-base of PR base and head', unbornBranch: false,
  });
  assert.equal(result.files, 2);
  assert.equal(result.added, 2);
  assert.equal(result.commits, 2);

  const missing = async () => JSON.stringify({ baseRefOid: base, headRefOid: 'f'.repeat(40) });
  await assert.rejects(
    measure({ cwd, target: { kind: 'pr', number: 42 }, gh: missing, fetch: async () => {} }),
    { code: 'BAD_REF' },
  );
});

const script = new URL('../skills/which-codereview/scripts/measure.mjs', import.meta.url).pathname;

async function runScript(cwd, args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [script, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

test('the script prints JSON and exits 2 on a bad ref, 1 on bad usage', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await commit('base');
  await git('switch', '-q', '-c', 'feature');
  await write('a.txt', 'a\nb\n');
  await commit('edit');
  await write('dist/x.js', 'x\n');
  await write('new.txt', 'n\n');

  const range = await runScript(cwd, ['main']);
  assert.equal(range.code, 0, range.stderr);
  assert.equal(JSON.parse(range.stdout).added, 1);

  const tree = await runScript(cwd, ['--working-tree', '--exclude-untracked', 'dist/**']);
  assert.deepEqual(JSON.parse(tree.stdout).untracked, { included: ['new.txt'], excluded: ['dist/x.js'] });

  const bad = await runScript(cwd, ['nope']);
  assert.equal(bad.code, 2);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /Unknown ref: nope/);

  for (const args of [['--staged', '--unstaged'], ['--pr'], ['--bogus'], ['main', '--staged']]) {
    const usage = await runScript(cwd, args);
    assert.equal(usage.code, 1, args.join(' '));
    assert.match(usage.stderr, /measure: /);
  }
});

test('which-way measure gives the same result and exit codes as the script', async () => {
  const { runCli } = await import('../src/cli.js');
  const { cwd, git, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await commit('base');
  await git('switch', '-q', '-c', 'feature');
  await write('a.txt', 'a\nb\n');
  await commit('edit');

  const cli = async (args) => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(args, {
      cwd, home: cwd,
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    });
    return { code, stdout, stderr };
  };

  const viaCli = await cli(['measure', 'main']);
  assert.equal(viaCli.code, 0, viaCli.stderr);
  assert.deepEqual(JSON.parse(viaCli.stdout), JSON.parse((await runScript(cwd, ['main'])).stdout));
  assert.equal((await cli(['measure', 'nope'])).code, 2);
  assert.match((await cli(['--help'])).stdout, /measure/);
});

test('a working-tree target lists staged and unstaged paths beside the aggregate', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await write('b.txt', 'b\n');
  await commit('base');
  await write('a.txt', 'a\nstaged\n');
  await git('add', 'a.txt');
  await write('a.txt', 'a\nstaged\nthen edited\n');
  await write('b.txt', 'b\nunstaged\n');
  await write('c.txt', 'new\n');

  const result = await measure({ cwd, target: { kind: 'working-tree' } });

  assert.deepEqual(result.index, { staged: ['a.txt'], unstaged: ['a.txt', 'b.txt'] });
  assert.equal(result.files, 3);
  assert.equal((await measure({ cwd, target: { kind: 'staged' } })).index, null);
});

test('auto falls back to the default branch when a pushed branch matches its upstream', async () => {
  const origin = await mkdtemp(join(tmpdir(), 'which-way-origin-'));
  await run('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const { cwd, git, write, commit } = await repo();
  await git('remote', 'add', 'origin', origin);
  await write('a.txt', 'a\n');
  const main = await commit('base');
  await git('push', '-q', 'origin', 'main');
  await git('remote', 'set-head', 'origin', 'main');
  await git('switch', '-q', '-c', 'feat');
  await write('a.txt', 'a\nb\n');
  await commit('work');
  await git('push', '-q', '-u', 'origin', 'feat');

  const result = await measure({ cwd });

  assert.equal(result.empty, false);
  assert.equal(result.target.kind, 'range');
  assert.equal(result.target.base, main);
  assert.match(result.target.basis, /merge-base with origin\/main/);
  assert.equal(result.commits, 1);
});

test('--cwd measures another repository', async () => {
  const { cwd, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await commit('base');
  await write('a.txt', 'a\nb\n');
  const elsewhere = await mkdtemp(join(tmpdir(), 'which-way-elsewhere-'));

  const result = await runScript(elsewhere, ['--unstaged', '--cwd', cwd]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).added, 1);
  assert.equal((await runScript(elsewhere, ['--cwd'])).code, 1);
});

test('option values cannot be another flag, and errors read like the rest of the CLI', async () => {
  const { cwd, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await commit('base');

  const swallowed = await runScript(cwd, ['--exclude-untracked', '--staged']);
  assert.equal(swallowed.code, 1);
  assert.match(swallowed.stderr, /^measure: --exclude-untracked requires a glob\n$/);
  assert.match((await runScript(cwd, ['--bogus'])).stderr, /^measure: Unknown option: --bogus\n$/);
  assert.match((await runScript(cwd, ['--staged', '--unstaged'])).stderr, /^measure: Only one target may be given\n$/);
});

test('skill, plugin command and agent definitions and other CI systems are reviewer inputs', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('src/app.js', 'x\n');
  await commit('base');
  await git('switch', '-q', '-c', 'feature');
  for (const path of [
    'skills/review/SKILL.md', 'plugins/kit/commands/audit.md', 'plugins/kit/agents/checker.md',
    '.circleci/config.yml', 'Jenkinsfile', 'azure-pipelines.yml', '.buildkite/pipeline.yml',
    'docs/agents/notes.txt', 'src/app.js',
  ]) await write(path, 'new\n');
  await commit('more reviewer inputs');

  const result = await measure({ cwd, target: { kind: 'range', base: 'main' } });

  assert.deepEqual(result.reviewerInputs, [
    '.buildkite/pipeline.yml', '.circleci/config.yml', 'Jenkinsfile', 'azure-pipelines.yml',
    'plugins/kit/agents/checker.md', 'plugins/kit/commands/audit.md', 'skills/review/SKILL.md',
  ]);
});

test('a PR commit that cannot be fetched is a fetch failure, not an unknown ref', async () => {
  const { cwd, write, commit } = await repo();
  await write('a.txt', 'a\n');
  const base = await commit('base');
  const gh = async () => JSON.stringify({ baseRefOid: base, headRefOid: 'e'.repeat(40) });
  const fetch = async () => { throw new Error('could not read from remote repository'); };

  await assert.rejects(
    measure({ cwd, target: { kind: 'pr', number: 7 }, gh, fetch }),
    { code: 'FETCH_FAILED', message: /PR #7 head .*could not read from remote repository/ },
  );
});

test('every target states what it was measured against', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('a.txt', 'a\n');
  await git('add', 'a.txt');
  assert.equal((await measure({ cwd, target: { kind: 'staged' } })).target.basis, 'index vs empty tree');
  await commit('base');
  await git('switch', '-q', '-c', 'feature');
  await write('a.txt', 'a\nb\n');
  const head = await commit('work');

  const range = await measure({ cwd, target: { kind: 'range', base: 'main' } });
  assert.equal(range.target.head, head);
  assert.equal(range.target.basis, 'merge-base of main and HEAD');
  assert.equal((await measure({ cwd, target: { kind: 'staged' } })).target.basis, 'index vs HEAD');
  assert.equal((await measure({ cwd, target: { kind: 'unstaged' } })).target.basis, 'working tree vs index');
});

test('workspaces for a PR come from the measured head, not the checkout', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('package.json', '{}\n');
  await write('a.txt', 'a\n');
  const base = await commit('base');
  await git('switch', '-q', '-c', 'pr');
  await write('apps/new/package.json', '{}\n');
  await write('apps/new/index.js', 'x\n');
  const head = await commit('new workspace');
  await git('switch', '-q', 'main');

  const gh = async () => JSON.stringify({ baseRefOid: base, headRefOid: head, url: 'https://github.com/acme/api/pull/3' });
  const result = await measure({ cwd, target: { kind: 'pr', number: 3 }, gh });
  assert.deepEqual(result.workspaces, [{ manifest: 'apps/new/package.json', files: 2 }]);
});

async function fakeGh(dir, json) {
  const bin = join(dir, 'bin');
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'gh'), `#!/bin/sh\necho '${JSON.stringify(json)}'\n`, { mode: 0o755 });
  return { ...process.env, PATH: `${bin}:${process.env.PATH}` };
}

async function runScriptEnv(cwd, args, env) {
  try {
    const { stdout, stderr } = await run(process.execPath, [script, ...args], { cwd, env });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

test('a PR head is fetched from the remote that matches the PR repository', async () => {
  const upstream = await repo();
  await upstream.write('a.txt', 'a\n');
  const base = await upstream.commit('base');
  await upstream.git('switch', '-q', '-c', 'contrib');
  await upstream.write('b.txt', 'b\n');
  const head = await upstream.commit('contribution');
  await upstream.git('update-ref', 'refs/pull/9/head', head);
  const home = await mkdtemp(join(tmpdir(), 'which-way-remote-'));
  const mirror = join(home, 'acme', 'api.git');
  await mkdir(join(home, 'acme'), { recursive: true });
  await run('git', ['clone', '-q', '--bare', '--mirror', upstream.cwd, mirror]);

  const local = await repo();
  await local.git('remote', 'add', 'origin', join(home, 'nowhere', 'fork.git'));
  await local.git('remote', 'add', 'upstream', mirror);
  await local.git('fetch', '-q', 'upstream', 'main');
  await local.git('switch', '-q', '-c', 'main', 'upstream/main');

  const env = await fakeGh(home, { baseRefOid: base, headRefOid: head, url: 'https://github.com/acme/api/pull/9' });
  const result = await runScriptEnv(local.cwd, ['--pr', '9'], env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).files, 1);
});

test('a PR commit that no remote can supply exits 3 from the command line', async () => {
  const { cwd, git, write, commit } = await repo();
  await write('a.txt', 'a\n');
  const base = await commit('base');
  const home = await mkdtemp(join(tmpdir(), 'which-way-nofetch-'));
  await git('remote', 'add', 'origin', join(home, 'missing.git'));

  const env = await fakeGh(home, { baseRefOid: base, headRefOid: 'd'.repeat(40), url: 'https://github.com/acme/api/pull/4' });
  const result = await runScriptEnv(cwd, ['--pr', '4'], env);
  assert.equal(result.code, 3);
  assert.match(result.stderr, /^measure: Could not fetch PR #4 head/);
});
