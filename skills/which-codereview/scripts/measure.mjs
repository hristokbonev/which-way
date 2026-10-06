import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
// Files that steer an agent, a reviewer or a check. A change to one of these must
// not configure its own review (which-codereview Step 3.6).
const reviewerInputPatterns = [
  /(^|\/)\.(claude|agents)\/(skills|agents|commands|hooks)\//,
  /(^|\/)SKILL\.md$/,
  /(^|\/)(commands|agents)\/[^/]+\.md$/,
  /(^|\/)\.claude\/settings(\.local)?\.json$/,
  /(^|\/)(CLAUDE|AGENTS|CODING_STANDARDS)\.md$/,
  /(^|\/)\.mcp\.json$/,
  /^\.github\/workflows\//,
  /^\.gitlab-ci\.yml$/,
  /^\.(circleci|buildkite)\//,
  /^(Jenkinsfile|azure-pipelines\.yml)$/,
  /^\.husky\//,
  /^\.pre-commit-config\.yaml$/,
];
const manifests = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'composer.json'];

async function git(cwd, ...args) {
  const { stdout } = await run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export class MeasureError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function resolveCommit(cwd, ref) {
  try {
    return (await git(cwd, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`)).trim();
  } catch {
    throw new MeasureError('BAD_REF', `Unknown ref: ${ref}`);
  }
}

// Parses `git diff --numstat -z`: "<added>\t<removed>\t<path>\0", or for a
// rename "<added>\t<removed>\t\0<from>\0<to>\0". Binary files report "-".
function parseNumstat(output) {
  const fields = output.split('\0');
  const entries = [];
  for (let i = 0; i < fields.length; i += 1) {
    if (!fields[i]) continue;
    const [added, removed, path] = fields[i].split('\t');
    const entry = { path, binary: added === '-', added: Number(added) || 0, removed: Number(removed) || 0 };
    if (path === '') {
      entry.from = fields[++i];
      entry.path = fields[++i];
    }
    entries.push(entry);
  }
  return entries;
}

function splitNul(output) {
  return output.split('\0').filter(Boolean);
}

async function untrackedFiles(cwd, exclude = []) {
  const list = (...pathspec) => git(cwd, 'ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspec);
  const all = splitNul(await list());
  if (exclude.length === 0) return { included: all, excluded: [] };
  const kept = new Set(splitNul(await list('.', ...exclude.map((pattern) => `:(exclude,glob)${pattern}`))));
  return { included: all.filter((path) => kept.has(path)), excluded: all.filter((path) => !kept.has(path)) };
}

// `git diff --no-index` exits 1 when the files differ, which is always the case here.
async function measureUntracked(cwd, path) {
  let output;
  try {
    output = await git(cwd, 'diff', '--no-index', '--numstat', '-z', '--', '/dev/null', path);
  } catch (error) {
    if (error.code !== 1) throw error;
    output = error.stdout;
  }
  const [entry] = parseNumstat(output);
  return { path, binary: entry.binary, added: entry.added, removed: entry.removed };
}

async function defaultGh(cwd, args) {
  const { stdout } = await run('gh', args, { cwd });
  return stdout;
}

// The remote whose URL names the PR's repository (owner/name), else origin.
async function prRemote(cwd, url) {
  const slug = /github\.com\/([^/]+\/[^/]+)\/pull\//.exec(url ?? '')?.[1];
  if (slug) {
    for (const row of (await git(cwd, 'remote', '-v')).split('\n')) {
      const [name, remoteUrl] = row.split(/\s+/);
      if (remoteUrl && remoteUrl.replace(/\.git$/, '').endsWith(slug)) return name;
    }
  }
  return 'origin';
}

// A fork's PR head is not on any local branch; GitHub serves it as pull/<n>/head.
async function defaultFetch(cwd, { number, oid, side, url }) {
  const remote = await prRemote(cwd, url);
  await git(cwd, 'fetch', '--quiet', remote, side === 'head' ? `pull/${number}/head` : oid);
}

async function resolvePrCommit(cwd, oid, fetch, details) {
  try {
    return await resolveCommit(cwd, oid);
  } catch {
    try {
      await fetch(details);
    } catch (error) {
      const reason = (error.stderr || error.message).trim();
      throw new MeasureError('FETCH_FAILED', `Could not fetch PR #${details.number} ${details.side} ${oid}: ${reason}`);
    }
    return resolveCommit(cwd, oid);
  }
}

async function countCommits(cwd, base, head) {
  return Number((await git(cwd, 'rev-list', '--count', `${base}..${head}`)).trim());
}

async function hasHead(cwd) {
  try {
    await git(cwd, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}');
    return true;
  } catch {
    return false;
  }
}

// How each target kind is diffed. `io` holds the injectable gh and fetch calls.
const targetSpecs = {
  async range(cwd, target, { unbornBranch }) {
    const base = await resolveCommit(cwd, target.base);
    const commits = await countCommits(cwd, base, 'HEAD');
    const head = (await git(cwd, 'rev-parse', 'HEAD')).trim();
    const basis = `merge-base of ${target.base} and HEAD`;
    return { args: [`${base}...HEAD`], commits, target: { kind: 'range', base, head, basis, unbornBranch } };
  },
  async pr(cwd, { number }, { unbornBranch, io }) {
    const { baseRefOid, headRefOid, url } = JSON.parse(await io.gh(['pr', 'view', String(number), '--json', 'baseRefOid,headRefOid,url']));
    const base = await resolvePrCommit(cwd, baseRefOid, io.fetch, { number, oid: baseRefOid, side: 'base', url });
    const head = await resolvePrCommit(cwd, headRefOid, io.fetch, { number, oid: headRefOid, side: 'head', url });
    const commits = await countCommits(cwd, base, head);
    const basis = 'merge-base of PR base and head';
    return { args: [`${base}...${head}`], commits, target: { kind: 'pr', number, base, head, basis, unbornBranch } };
  },
  async staged(cwd, target, { unbornBranch }) {
    const basis = unbornBranch ? 'index vs empty tree' : 'index vs HEAD';
    return { args: ['--cached'], commits: null, target: { kind: 'staged', basis, unbornBranch } };
  },
  async unstaged(cwd, target, { unbornBranch }) {
    return { args: [], commits: null, target: { kind: 'unstaged', basis: 'working tree vs index', unbornBranch } };
  },
  async 'working-tree'(cwd, target, { unbornBranch }) {
    const untracked = await untrackedFiles(cwd, target.excludeUntracked);
    const base = unbornBranch ? (await git(cwd, 'hash-object', '-t', 'tree', '/dev/null')).trim() : 'HEAD';
    const basis = unbornBranch ? 'empty tree' : 'HEAD';
    const sides = {
      staged: splitNul(await git(cwd, 'diff', '--cached', '--name-only', '-z')),
      unstaged: splitNul(await git(cwd, 'diff', '--name-only', '-z')),
    };
    return { args: [base], commits: null, untracked, index: sides, target: { kind: 'working-tree', basis, unbornBranch } };
  },
};

async function diffSpec(cwd, target, io) {
  const build = targetSpecs[target.kind];
  if (!build) throw new MeasureError('BAD_TARGET', `Unknown target: ${target.kind}`);
  return build(cwd, target, { unbornBranch: !(await hasHead(cwd)), io });
}

async function tryRef(cwd, args) {
  try {
    return (await git(cwd, ...args)).trim();
  } catch {
    return null;
  }
}

// Branches an unpushed range can be measured against, in order: upstream, then
// the remote's default branch, then a local main or master. A pushed branch
// matches its upstream, so the caller moves on to the next candidate.
async function comparisonBranches(cwd) {
  const candidates = [
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
    ['rev-parse', '--verify', '--quiet', '--abbrev-ref', 'main'],
    ['rev-parse', '--verify', '--quiet', '--abbrev-ref', 'master'],
  ];
  const branches = [];
  for (const args of candidates) {
    const branch = await tryRef(cwd, args);
    if (branch && !branches.includes(branch)) branches.push(branch);
  }
  return branches;
}

async function measureAuto(cwd, { excludeUntracked }) {
  const tree = await measureTarget(cwd, { kind: 'working-tree', excludeUntracked });
  tree.target.basis = `auto: uncommitted changes vs ${tree.target.basis}`;
  if (!tree.empty || tree.target.unbornBranch) return tree;
  for (const branch of await comparisonBranches(cwd)) {
    const range = await measureTarget(cwd, { kind: 'range', base: branch });
    if (range.commits === 0) continue;
    range.target.basis = `auto: clean working tree; merge-base with ${branch}`;
    return range;
  }
  return tree;
}

// Manifest paths as of `head` when the measured commits may not be checked out,
// else as they are on disk.
async function manifestPaths(root, head) {
  if (head) {
    return new Set(splitNul(await git(root, 'ls-tree', '-r', '--name-only', '-z', head))
      .filter((path) => manifests.includes(posix.basename(path))));
  }
  return { has: (path) => existsSync(posix.join(root, path)) };
}

function nearestManifest(present, path) {
  for (let directory = posix.dirname(path); ; directory = posix.dirname(directory)) {
    const prefix = directory === '.' ? '' : `${directory}/`;
    const found = manifests.find((name) => present.has(prefix + name));
    if (found) return prefix + found;
    if (directory === '.') return null;
  }
}

function groupWorkspaces(present, paths) {
  const counts = new Map();
  for (const path of paths) {
    const manifest = nearestManifest(present, path);
    counts.set(manifest, (counts.get(manifest) ?? 0) + 1);
  }
  return [...counts]
    .map(([manifest, files]) => ({ manifest, files }))
    .sort((a, b) => String(a.manifest).localeCompare(String(b.manifest)));
}

// Paths from git are relative to the repository root, so every command runs there.
// `target` defaults to auto: uncommitted changes, else the branch's unpushed commits.
export async function measure({ cwd, target = { kind: 'auto' }, gh, fetch }) {
  const root = (await git(cwd, 'rev-parse', '--show-toplevel')).trim();
  const io = {
    gh: gh ?? ((args) => defaultGh(root, args)),
    fetch: fetch ?? ((details) => defaultFetch(root, details)),
  };
  const { paths, touched, ...result } = target.kind === 'auto'
    ? await measureAuto(root, target)
    : await measureTarget(root, target, io);
  const reviewerInputs = [...new Set(touched)]
    .filter((path) => reviewerInputPatterns.some((pattern) => pattern.test(path)))
    .sort();
  const present = await manifestPaths(root, result.target.head);
  return { ...result, workspaces: groupWorkspaces(present, paths), reviewerInputs };
}

async function measureTarget(cwd, target, io = {}) {
  const spec = await diffSpec(cwd, target, io);
  const entries = parseNumstat(await git(cwd, 'diff', '--numstat', '-z', '-M', ...spec.args));
  for (const path of spec.untracked?.included ?? []) entries.push(await measureUntracked(cwd, path));
  const added = entries.reduce((sum, entry) => sum + entry.added, 0);
  const removed = entries.reduce((sum, entry) => sum + entry.removed, 0);
  return {
    target: spec.target,
    paths: entries.map((entry) => entry.path),
    touched: entries.flatMap((entry) => (entry.from ? [entry.from, entry.path] : [entry.path])),
    files: entries.length,
    added,
    removed,
    changed: added + removed,
    binary: entries.filter((entry) => entry.binary).map((entry) => entry.path),
    renames: entries.filter((entry) => entry.from).map(({ from, path }) => ({ from, to: path })),
    untracked: spec.untracked ?? null,
    index: spec.index ?? null,
    commits: spec.commits,
    empty: entries.length === 0,
  };
}

export const usage = `Usage: measure [<fixed-point> | --staged | --unstaged | --working-tree | --pr <n>] [options]

Measures a review target and prints JSON. With no target, measures uncommitted
changes, or the branch's unpushed commits when the working tree is clean.

Targets:
  <fixed-point>                Commits since the merge-base with this ref
  --staged                     Index vs HEAD
  --unstaged                   Working tree vs index
  --working-tree               Working tree vs HEAD, plus untracked files
  --pr <n>                     A GitHub PR's base...head (uses gh)

Options:
  --exclude-untracked <glob>   Leave matching untracked files out (repeatable)
  --cwd <path>                 Measure the repository at this path

Exit status: 0 measured, 1 usage error, 2 unknown ref, 3 PR commit could not be fetched.
`;

function optionValue(args, i, name, what) {
  const value = args[i];
  if (!value || value.startsWith('--')) throw new MeasureError('USAGE', `${name} requires ${what}`);
  return value;
}

function parseArgs(args) {
  const flags = { '--staged': 'staged', '--unstaged': 'unstaged', '--working-tree': 'working-tree' };
  let target;
  let cwd;
  const excludeUntracked = [];
  const setTarget = (value) => {
    if (target) throw new MeasureError('USAGE', 'Only one target may be given');
    target = value;
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (flags[arg]) setTarget({ kind: flags[arg] });
    else if (arg === '--pr') {
      const number = Number(optionValue(args, ++i, '--pr', 'a PR number'));
      if (!Number.isInteger(number) || number < 1) throw new MeasureError('USAGE', '--pr requires a PR number');
      setTarget({ kind: 'pr', number });
    } else if (arg === '--cwd') {
      cwd = optionValue(args, ++i, '--cwd', 'a path');
    } else if (arg === '--exclude-untracked') {
      excludeUntracked.push(optionValue(args, ++i, '--exclude-untracked', 'a glob'));
    } else if (arg.startsWith('-')) throw new MeasureError('USAGE', `Unknown option: ${arg}`);
    else setTarget({ kind: 'range', base: arg });
  }
  target ??= { kind: 'auto' };
  if (excludeUntracked.length && !['auto', 'working-tree'].includes(target.kind)) {
    throw new MeasureError('USAGE', '--exclude-untracked applies only to the working tree');
  }
  if (excludeUntracked.length) target.excludeUntracked = excludeUntracked;
  return { target, cwd };
}

export async function runMeasure(args, { cwd, stdout, stderr }) {
  if (args.length === 1 && args[0] === '--help') {
    stdout.write(usage);
    return 0;
  }
  try {
    const options = parseArgs(args);
    const result = await measure({
      cwd: options.cwd ? resolve(cwd, options.cwd) : cwd,
      target: options.target,
    });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`measure: ${error.message}\n`);
    return { BAD_REF: 2, FETCH_FAILED: 3 }[error.code] ?? 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runMeasure(process.argv.slice(2), {
    cwd: process.cwd(), stdout: process.stdout, stderr: process.stderr,
  });
}
