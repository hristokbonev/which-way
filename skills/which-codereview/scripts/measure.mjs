import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
// Files that steer an agent, a reviewer or a check. A change to one of these must
// not configure its own review (which-codereview Step 3.6).
const reviewerInputPatterns = [
  /(^|\/)\.(claude|agents)\/(skills|agents|commands|hooks)\//,
  /(^|\/)\.claude\/settings(\.local)?\.json$/,
  /(^|\/)(CLAUDE|AGENTS|CODING_STANDARDS)\.md$/,
  /(^|\/)\.mcp\.json$/,
  /^\.github\/workflows\//,
  /^\.gitlab-ci\.yml$/,
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

function lines(output) {
  return output.split('\0').filter(Boolean);
}

async function untrackedFiles(cwd, exclude = []) {
  const list = (...pathspec) => git(cwd, 'ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspec);
  const all = lines(await list());
  if (exclude.length === 0) return { included: all, excluded: [] };
  const kept = new Set(lines(await list('.', ...exclude.map((pattern) => `:(exclude,glob)${pattern}`))));
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

// A fork's PR head is not on any local branch; GitHub serves it as pull/<n>/head.
async function defaultFetch(cwd, { number, oid, side }) {
  await git(cwd, 'fetch', '--quiet', 'origin', side === 'head' ? `pull/${number}/head` : oid);
}

async function resolvePrCommit(cwd, oid, fetch, details) {
  try {
    return await resolveCommit(cwd, oid);
  } catch {
    await fetch(details).catch(() => {});
    return resolveCommit(cwd, oid);
  }
}

async function hasHead(cwd) {
  try {
    await git(cwd, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}');
    return true;
  } catch {
    return false;
  }
}

async function diffSpec(cwd, target, { gh, fetch }) {
  const unbornBranch = !(await hasHead(cwd));
  if (target.kind === 'range') {
    const base = await resolveCommit(cwd, target.base);
    const commits = Number((await git(cwd, 'rev-list', '--count', `${base}..HEAD`)).trim());
    return { args: [`${base}...HEAD`], commits, target: { kind: 'range', base, unbornBranch } };
  }
  if (target.kind === 'pr') {
    const number = target.number;
    const { baseRefOid, headRefOid } = JSON.parse(await gh(['pr', 'view', String(number), '--json', 'baseRefOid,headRefOid']));
    const base = await resolvePrCommit(cwd, baseRefOid, fetch, { number, oid: baseRefOid, side: 'base' });
    const head = await resolvePrCommit(cwd, headRefOid, fetch, { number, oid: headRefOid, side: 'head' });
    const commits = Number((await git(cwd, 'rev-list', '--count', `${base}..${head}`)).trim());
    return { args: [`${base}...${head}`], commits, target: { kind: 'pr', number, base, head, unbornBranch } };
  }
  if (target.kind === 'staged') return { args: ['--cached'], commits: null, target: { kind: 'staged', unbornBranch } };
  if (target.kind === 'unstaged') return { args: [], commits: null, target: { kind: 'unstaged', unbornBranch } };
  if (target.kind === 'working-tree') {
    const untracked = await untrackedFiles(cwd, target.excludeUntracked);
    const base = unbornBranch ? (await git(cwd, 'hash-object', '-t', 'tree', '/dev/null')).trim() : 'HEAD';
    const basis = unbornBranch ? 'empty tree' : 'HEAD';
    return { args: [base], commits: null, untracked, target: { kind: 'working-tree', basis, unbornBranch } };
  }
  throw new MeasureError('BAD_TARGET', `Unknown target: ${target.kind}`);
}

async function firstRef(cwd, candidates) {
  for (const candidate of candidates) {
    try {
      return (await git(cwd, ...candidate)).trim();
    } catch {
      // try the next way of naming the comparison branch
    }
  }
  return null;
}

// The branch an unpushed range is measured against: upstream, then the remote's
// default branch, then a local main or master.
function comparisonBranch(cwd) {
  return firstRef(cwd, [
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
    ['rev-parse', '--verify', '--quiet', '--abbrev-ref', 'main'],
    ['rev-parse', '--verify', '--quiet', '--abbrev-ref', 'master'],
  ]);
}

async function measureAuto(cwd, excludeUntracked) {
  const tree = await measureTarget(cwd, { kind: 'working-tree', excludeUntracked });
  tree.target.basis = `auto: uncommitted changes vs ${tree.target.basis}`;
  if (!tree.empty || tree.target.unbornBranch) return tree;
  const branch = await comparisonBranch(cwd);
  if (!branch) return tree;
  const range = await measureTarget(cwd, { kind: 'range', base: branch });
  if (range.commits === 0) return tree;
  range.target.basis = `auto: clean working tree; merge-base with ${branch}`;
  return range;
}

function nearestManifest(root, path) {
  for (let directory = posix.dirname(path); ; directory = posix.dirname(directory)) {
    const prefix = directory === '.' ? '' : `${directory}/`;
    const found = manifests.find((name) => existsSync(posix.join(root, prefix + name)));
    if (found) return prefix + found;
    if (directory === '.') return null;
  }
}

function groupWorkspaces(root, paths) {
  const counts = new Map();
  for (const path of paths) {
    const manifest = nearestManifest(root, path);
    counts.set(manifest, (counts.get(manifest) ?? 0) + 1);
  }
  return [...counts]
    .map(([manifest, files]) => ({ manifest, files }))
    .sort((a, b) => String(a.manifest).localeCompare(String(b.manifest)));
}

// Paths from git are relative to the repository root, so every command runs there.
export async function measure({ cwd, target, excludeUntracked, gh, fetch }) {
  const root = (await git(cwd, 'rev-parse', '--show-toplevel')).trim();
  const deps = {
    gh: gh ?? ((args) => defaultGh(root, args)),
    fetch: fetch ?? ((details) => defaultFetch(root, details)),
  };
  const { paths, touched, ...result } = target ? await measureTarget(root, target, deps) : await measureAuto(root, excludeUntracked);
  const reviewerInputs = [...new Set(touched)]
    .filter((path) => reviewerInputPatterns.some((pattern) => pattern.test(path)))
    .sort();
  return { ...result, workspaces: groupWorkspaces(root, paths), reviewerInputs };
}

async function measureTarget(cwd, target, deps = {}) {
  const spec = await diffSpec(cwd, target, deps);
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

Exit status: 0 measured, 1 usage error, 2 unknown ref.
`;

function parseArgs(args) {
  const flags = { '--staged': 'staged', '--unstaged': 'unstaged', '--working-tree': 'working-tree' };
  let target;
  const excludeUntracked = [];
  const setTarget = (value) => {
    if (target) throw new MeasureError('USAGE', 'only one target may be given');
    target = value;
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (flags[arg]) setTarget({ kind: flags[arg] });
    else if (arg === '--pr') {
      const number = Number(args[++i]);
      if (!Number.isInteger(number) || number < 1) throw new MeasureError('USAGE', '--pr requires a PR number');
      setTarget({ kind: 'pr', number });
    } else if (arg === '--exclude-untracked') {
      const pattern = args[++i];
      if (!pattern) throw new MeasureError('USAGE', '--exclude-untracked requires a glob');
      excludeUntracked.push(pattern);
    } else if (arg.startsWith('-')) throw new MeasureError('USAGE', `unknown option: ${arg}`);
    else setTarget({ kind: 'range', base: arg });
  }
  if (excludeUntracked.length && target && target.kind !== 'working-tree') {
    throw new MeasureError('USAGE', '--exclude-untracked applies only to the working tree');
  }
  if (target?.kind === 'working-tree') target.excludeUntracked = excludeUntracked;
  return { target, excludeUntracked };
}

export async function runMeasure(args, { cwd, stdout, stderr }) {
  if (args.length === 1 && args[0] === '--help') {
    stdout.write(usage);
    return 0;
  }
  try {
    const { target, excludeUntracked } = parseArgs(args);
    const result = await measure({ cwd, target, excludeUntracked });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`measure: ${error.message}\n`);
    return error.code === 'BAD_REF' ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runMeasure(process.argv.slice(2), {
    cwd: process.cwd(), stdout: process.stdout, stderr: process.stderr,
  });
}
