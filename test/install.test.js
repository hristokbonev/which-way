import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, lstat, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installSkills, listSkills, skillDirectory } from '../src/skills.js';

async function fixture() {
  return mkdtemp(join(tmpdir(), 'which-way-install-'));
}

test('installs every skill with unchanged content', async () => {
  const destination = join(await fixture(), 'skills');
  const paths = await installSkills({ names: listSkills().map((skill) => skill.name), destination });
  assert.equal(paths.length, 3);
  for (const { name } of listSkills()) {
    assert.deepEqual(
      await readFile(join(destination, name, 'SKILL.md')),
      await readFile(join(skillDirectory(name), 'SKILL.md')),
    );
  }
});

test('preflights all names and conflicts before copying', async () => {
  const destination = join(await fixture(), 'skills');
  await mkdir(join(destination, 'which-security-review'), { recursive: true });
  await assert.rejects(
    installSkills({ names: ['which-codereview', 'which-security-review'], destination }),
    /already exists/,
  );
  await assert.rejects(lstat(join(destination, 'which-codereview')), /ENOENT/);
  await assert.rejects(
    installSkills({ names: ['which-codereview', '../outside'], destination }),
    /Unknown skill/,
  );
  await assert.rejects(lstat(join(destination, 'which-codereview')), /ENOENT/);
});

test('force replaces only the selected skill directory', async () => {
  const destination = join(await fixture(), 'skills');
  await mkdir(join(destination, 'which-framework'), { recursive: true });
  await writeFile(join(destination, 'which-framework', 'stale.txt'), 'stale');
  await mkdir(join(destination, 'other-skill'));
  await writeFile(join(destination, 'other-skill', 'sentinel'), 'keep');
  await installSkills({ names: ['which-framework'], destination, force: true });
  await assert.rejects(lstat(join(destination, 'which-framework', 'stale.txt')), /ENOENT/);
  assert.equal(await readFile(join(destination, 'other-skill', 'sentinel'), 'utf8'), 'keep');
});

test('rejects symlink skill roots, including dangling links', async () => {
  const parent = await fixture();
  const outside = join(parent, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'sentinel'), 'keep');
  const destination = join(parent, 'skills');
  await symlink(outside, destination);
  await assert.rejects(installSkills({ names: ['which-framework'], destination, force: true }), /symlink/);
  assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'keep');
  const dangling = join(parent, 'dangling');
  await symlink(join(parent, 'missing'), dangling);
  await assert.rejects(installSkills({ names: ['which-framework'], destination: dangling }), /symlink/);
});

test('rejects absolute symlink skill root with a trailing slash', async () => {
  const parent = await fixture();
  const outside = join(parent, 'outside');
  const destination = join(parent, 'skills');
  await mkdir(outside);
  await writeFile(join(outside, 'sentinel'), 'keep');
  await symlink(outside, destination);
  await assert.rejects(
    installSkills({ names: ['which-framework'], destination: `${destination}/`, force: true }),
    /symlink/,
  );
  assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'keep');
  await assert.rejects(lstat(join(outside, 'which-framework')), /ENOENT/);
});

test('rejects symlink skill directories and regular files', async () => {
  const parent = await fixture();
  const destination = join(parent, 'skills');
  const outside = join(parent, 'outside');
  await mkdir(destination);
  await mkdir(outside);
  await symlink(outside, join(destination, 'which-framework'));
  await assert.rejects(installSkills({ names: ['which-framework'], destination, force: true }), /symlink/);
  const dangling = join(destination, 'which-codereview');
  await symlink(join(parent, 'missing'), dangling);
  await assert.rejects(installSkills({ names: ['which-codereview'], destination }), /symlink/);
  await writeFile(join(destination, 'which-security-review'), 'file');
  await assert.rejects(installSkills({ names: ['which-security-review'], destination, force: true }), /directory/);
  const fileRoot = join(parent, 'file-root');
  await writeFile(fileRoot, 'file');
  await assert.rejects(installSkills({ names: ['which-framework'], destination: fileRoot }), /directory/);
});

test('rejects missing bundled skill before creating the destination', async () => {
  const root = await fixture();
  const source = fileURLToPath(new URL('../src/skills.js', import.meta.url));
  await mkdir(join(root, 'src'));
  await cp(source, join(root, 'src', 'skills.js'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  const fixtureModule = await import(pathToFileURL(join(root, 'src', 'skills.js')).href);
  const destination = join(root, 'destination');
  await assert.rejects(
    fixtureModule.installSkills({ names: ['which-framework'], destination }),
    /Bundled skill is missing or invalid/,
  );
  await assert.rejects(lstat(destination), /ENOENT/);
});
