import { readFileSync } from 'node:fs';
import { cp, lstat, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['which-codereview', 'which-framework', 'which-security-review'];

export function skillDirectory(name) {
  if (!names.includes(name)) throw new Error(`Unknown skill: ${name}`);
  return resolve(packageRoot, 'skills', name);
}

export function listSkills() {
  return names.map((name) => {
    const body = readFileSync(resolve(skillDirectory(name), 'SKILL.md'), 'utf8');
    const description = /^description: (.+)$/m.exec(body)?.[1];
    if (!description) throw new Error(`Missing description in ${name}/SKILL.md`);
    return { name, description };
  });
}

async function statIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function installSkills({ names: selected, destination, force = false }) {
  if (!isAbsolute(destination)) throw new Error(`Destination must be absolute: ${destination}`);
  const namesToInstall = [...new Set(selected)];
  const sources = namesToInstall.map((name) => ({ name, source: skillDirectory(name) }));
  const rootInfo = await statIfPresent(destination);
  if (rootInfo?.isSymbolicLink()) throw new Error(`Destination is a symlink: ${destination}`);
  if (rootInfo && !rootInfo.isDirectory()) throw new Error(`Destination is not a directory: ${destination}`);

  for (const { name, source } of sources) {
    const sourceInfo = await statIfPresent(source);
    const manifestInfo = await statIfPresent(join(source, 'SKILL.md'));
    if (!sourceInfo?.isDirectory() || !manifestInfo?.isFile()) {
      throw new Error(`Bundled skill is missing or invalid: ${source}`);
    }
    const target = join(destination, name);
    const targetInfo = await statIfPresent(target);
    if (targetInfo?.isSymbolicLink()) throw new Error(`Skill destination is a symlink: ${target}`);
    if (targetInfo && !targetInfo.isDirectory()) throw new Error(`Skill destination is not a directory: ${target}`);
    if (targetInfo && !force) throw new Error(`Skill destination already exists: ${target}`);
  }

  await mkdir(destination, { recursive: true });
  const installed = [];
  for (const { name, source } of sources) {
    const target = join(destination, name);
    if (force) await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true, errorOnExist: true, force: false });
    installed.push(target);
  }
  return installed;
}
