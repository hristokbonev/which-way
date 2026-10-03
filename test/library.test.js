import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listSkills, skillDirectory } from '../src/skills.js';

const names = ['which-codereview', 'which-framework', 'which-security-review'];

test('bundled inventory names, descriptions and source paths', async () => {
  const skills = listSkills();
  assert.deepEqual(skills.map(({ name }) => name), names);
  for (const { name, description } of skills) {
    assert.ok(description.length > 20);
    const body = await readFile(join(skillDirectory(name), 'SKILL.md'), 'utf8');
    assert.match(body, new RegExp(`^---\\nname: ${name}\\n`));
    assert.ok(body.includes(`description: ${description}`));
  }
});

test('rejects unknown or path-like skill names', () => {
  assert.throws(() => skillDirectory('../outside'), /Unknown skill/);
  assert.throws(() => skillDirectory('missing'), /Unknown skill/);
});
