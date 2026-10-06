import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSkills, listSkills } from './skills.js';

const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const { version } = JSON.parse(readFileSync(packagePath, 'utf8'));

const usage = `Usage: which-way <command> [options]

Commands:
  list                   List bundled skills
  install [skill]        Install all skills or one named skill
  measure [target]       Measure a review target as JSON (see: measure --help)
  inventory              List installed skills, plugin commands and agents as JSON

Install options:
  --claude               Use .claude/skills (default: .agents/skills)
  --global               Install under your home directory
  --dir <path>           Use a custom skill root
  --force                Replace selected installed skills

Other options:
  --help                 Show this help
  --version              Show the package version

Examples:
  which-way list
  which-way install
  which-way install which-framework --claude
  which-way install --global
  which-way install --dir ./custom-skills
  which-way measure main
`;

function parseInstall(args) {
  let name;
  let claude = false;
  let global = false;
  let directory;
  let force = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--claude') claude = true;
    else if (arg === '--global') global = true;
    else if (arg === '--force') force = true;
    else if (arg === '--dir') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('--dir requires a path');
      if (directory !== undefined) throw new Error('--dir may be given only once');
      directory = value;
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (name !== undefined) throw new Error(`Unexpected argument: ${arg}`);
    else name = arg;
  }
  if (directory !== undefined && (claude || global)) {
    throw new Error('--dir cannot be combined with --claude or --global');
  }
  return { name, claude, global, directory, force };
}

export async function runCli(args, { cwd, home, stdout, stderr }) {
  try {
    if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
      stdout.write(usage);
      return 0;
    }
    if (args.length === 1 && args[0] === '--version') {
      stdout.write(`${version}\n`);
      return 0;
    }
    const [command, ...rest] = args;
    if (command === 'list') {
      if (rest.length) throw new Error('list accepts no arguments or options');
      for (const { name, description } of listSkills()) stdout.write(`${name}\t${description}\n`);
      return 0;
    }
    if (command === 'inventory') {
      const { runInventory } = await import('../skills/which-framework/scripts/inventory.mjs');
      return runInventory(rest, { cwd, home, stdout, stderr });
    }
    if (command === 'measure') {
      // Loaded on demand so a problem in the skill's script cannot break list or install.
      const { runMeasure } = await import('../skills/which-codereview/scripts/measure.mjs');
      return runMeasure(rest, { cwd, stdout, stderr });
    }
    if (command !== 'install') throw new Error(`Unknown command: ${command}`);

    const options = parseInstall(rest);
    const names = options.name ? [options.name] : listSkills().map((skill) => skill.name);
    const destination = options.directory !== undefined
      ? (isAbsolute(options.directory) ? options.directory : resolve(cwd, options.directory))
      : resolve(options.global ? home : cwd, options.claude ? '.claude' : '.agents', 'skills');
    const installed = await installSkills({ names, destination, force: options.force });
    for (const path of installed) stdout.write(`Installed ${path}\n`);
    return 0;
  } catch (error) {
    stderr.write(`which-way: ${error.message}\n`);
    return 1;
  }
}
