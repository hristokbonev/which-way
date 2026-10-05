import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

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

async function diffSpec(cwd, target) {
  if (target.kind === 'range') {
    const base = await resolveCommit(cwd, target.base);
    const commits = Number((await git(cwd, 'rev-list', '--count', `${base}..HEAD`)).trim());
    return { args: [`${base}...HEAD`], commits, target: { kind: 'range', base } };
  }
  if (target.kind === 'staged') return { args: ['--cached'], commits: null, target: { kind: 'staged' } };
  if (target.kind === 'unstaged') return { args: [], commits: null, target: { kind: 'unstaged' } };
  if (target.kind === 'working-tree') {
    const untracked = await untrackedFiles(cwd, target.excludeUntracked);
    return { args: ['HEAD'], commits: null, untracked, target: { kind: 'working-tree' } };
  }
  throw new MeasureError('BAD_TARGET', `Unknown target: ${target.kind}`);
}

export async function measure({ cwd, target }) {
  const spec = await diffSpec(cwd, target);
  const entries = parseNumstat(await git(cwd, 'diff', '--numstat', '-z', '-M', ...spec.args));
  for (const path of spec.untracked?.included ?? []) entries.push(await measureUntracked(cwd, path));
  const added = entries.reduce((sum, entry) => sum + entry.added, 0);
  const removed = entries.reduce((sum, entry) => sum + entry.removed, 0);
  return {
    target: spec.target,
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
