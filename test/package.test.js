import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['which-codereview', 'which-framework', 'which-security-review'];

test('npm tarball installs and runs without repository files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'which-way-pack-'));
  const cache = join(root, 'npm-cache');
  const { stdout } = await run('npm', [
    'pack', '--json', '--pack-destination', root, '--cache', cache,
  ], { cwd: project });
  const [metadata] = JSON.parse(stdout);
  assert.equal(metadata.name, '@hristobonev/which-way');
  const entries = metadata.files.map((file) => file.path);
  assert.ok(entries.includes('bin/which-way.js'));
  assert.ok(entries.includes('src/cli.js'));
  assert.ok(entries.includes('README.md'));
  for (const name of names) assert.ok(entries.includes(`skills/${name}/SKILL.md`));
  assert.ok(entries.includes('skills/which-codereview/scripts/measure.mjs'));
  assert.ok(entries.includes('skills/which-codereview/references/manual-measure.md'));
  assert.ok(entries.every((entry) => !entry.startsWith('test/') && !entry.startsWith('docs/') && !entry.includes('.git/')));

  const tarball = join(root, metadata.filename);
  const installRoot = join(root, 'consumer');
  await run('npm', [
    'install', '--prefix', installRoot, tarball, '--ignore-scripts', '--offline',
    '--no-audit', '--no-fund', '--cache', cache,
  ]);
  const executable = join(installRoot, 'node_modules', '@hristobonev', 'which-way', 'bin', 'which-way.js');
  const listed = await run(process.execPath, [executable, 'list'], { cwd: root });
  for (const name of names) assert.match(listed.stdout, new RegExp(name));

  const target = join(root, 'installed-skills');
  await run(process.execPath, [executable, 'install', '--dir', target], { cwd: root });
  assert.deepEqual((await readdir(target)).sort(), names);
  for (const name of names) {
    assert.deepEqual(
      await readFile(join(target, name, 'SKILL.md')),
      await readFile(join(project, 'skills', name, 'SKILL.md')),
    );
  }
});
