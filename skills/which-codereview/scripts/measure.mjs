import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
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

async function measureAuto(cwd) {
  const tree = await measureTarget(cwd, { kind: 'working-tree' });
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
export async function measure({ cwd, target, gh, fetch }) {
  const root = (await git(cwd, 'rev-parse', '--show-toplevel')).trim();
  const deps = {
    gh: gh ?? ((args) => defaultGh(root, args)),
    fetch: fetch ?? ((details) => defaultFetch(root, details)),
  };
  const { paths, touched, ...result } = target ? await measureTarget(root, target, deps) : await measureAuto(root);
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
