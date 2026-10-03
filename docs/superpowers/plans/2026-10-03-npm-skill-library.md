# npm Skill Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distribute the three existing which-way skills through npm with a safe, explicit installer.

**Architecture:** A dependency-free Node.js executable parses commands and delegates copying to a filesystem module. Bundled skills are resolved relative to the package, while destinations resolve from the invoking project or user's home directory.

**Tech Stack:** Node.js 22+, ESM JavaScript, built-in `node:test`, npm packaging.

**Spec:** `docs/superpowers/specs/2026-10-03-npm-skill-library-design.md`

## Global Constraints

- Package name `which-way`, initial version `0.1.0`, executable `which-way`.
- Node.js 22 or newer; no runtime dependencies or automatic installation hooks.
- Preserve all three source `SKILL.md` files byte for byte; exclude nested Git metadata.
- Default project destination `.agents/skills`; `--claude` selects `.claude/skills`.
- Reject overwrite without `--force`, preflight the entire selection, and reject destination-root and selected-directory symlinks.
- Allowlist packaged files; no registry publication or invented licensing grants.

## Review Focus

- Run from an unrelated directory: use packaged sources, never local lookalikes (Task 3).
- Dangling destination links: reject without modifying their targets (Task 2).
- A regular file occupying a directory destination: fail before any copying (Task 2).
- A flag missing its value or an unknown option: fail before writes (Task 3).
- Forced replacement of a skill with stale files: remove stale selected files, preserve sibling skills (Task 2).

## File Map

- `package.json`: package metadata, executable mapping, allowlist, test script.
- `bin/which-way.js`: executable entry point and exit/error handling.
- `src/cli.js`: parsing, destination selection, help and reporting.
- `src/skills.js`: fixed inventory, packaged-source lookup, preflight and copying.
- `skills/{which-codereview,which-framework,which-security-review}/SKILL.md`: imported skills.
- `test/library.test.js`, `test/install.test.js`, `test/cli.test.js`, `test/package.test.js`: behavioral tests.
- `README.md`, `CHANGELOG.md`, `.gitignore`: usage, release note, artifact exclusions.

### Task 1: Bundle the skill inventory

**Files:** `package.json`, `src/skills.js`, the three skill directories, `test/library.test.js`, `.gitignore`.

**Interfaces:** Export `listSkills(): Array<{name: string, description: string}>` and `skillDirectory(name: string): string` from `src/skills.js`. Unknown names throw. The fixed inventory contains exactly the three approved names; descriptions match source frontmatter.

- [ ] Write `library.test.js`: assert the exact three names in stable alphabetical order, nonempty source descriptions, existing `SKILL.md` paths, and rejection of `../outside` and unknown names.
- [ ] Run `node --test test/library.test.js`; confirm failure due to missing implementation.
- [ ] Add ESM package metadata with `engines.node` set to `>=22`, `scripts.test` set to `node --test`, and `files` set to `["bin/", "src/", "skills/", "README.md", "CHANGELOG.md"]`. Copy only the three source files and implement the inventory exports using package-relative paths. Ignore `node_modules/` and `*.tgz`.
- [ ] Run the library test and compare each copied source with its original using `cmp`; all must pass.
- [ ] Review the staged diff and commit as `feat: bundle the three workflow routing skills`.

### Task 2: Implement installation with preflight

**Files:** `src/skills.js`, `test/install.test.js`.

**Interfaces:** Consume Task 1 exports. Add `installSkills({names, destination, force = false}): Promise<string[]>`, where `names` is an array of exact inventory names, `destination` is the absolute skill-root path, and results are installed absolute skill-directory paths. Errors propagate with affected paths.

- [ ] Write temporary-directory tests for all-skill and single-skill installation with byte-equal content. Assert a conflict on the last selected skill leaves the earlier destinations absent. Assert `force` replaces stale contents only in selected directories and preserves a sentinel sibling directory.
- [ ] Add tests for existing and dangling links at both the skill root and selected skill directory, a regular file occupying the root or a selected directory, and missing bundled sources. Assert rejection precedes copying and external sentinels remain unchanged. Inject missing-source behavior through a temporary package fixture rather than editing real bundled files.
- [ ] Run `node --test test/install.test.js`; confirm failures identify missing installer behavior.
- [ ] Implement name validation and `lstat` preflight for all selected sources and destinations, then create the destination and copy selected directories. Forced replacement removes only the exact selected existing directories after preflight; never follow selected destination symlinks. Treat a regular file as an invalid directory even with `force`.
- [ ] Run `node --test test/library.test.js test/install.test.js`; require all tests passing.
- [ ] Review and commit as `feat: install skills with conflict and symlink safeguards`.

### Task 3: Expose the npm executable

**Files:** `bin/which-way.js`, `src/cli.js`, `package.json`, `test/cli.test.js`.

**Interfaces:** Export `runCli(args: string[], {cwd: string, home: string, stdout: {write}, stderr: {write}}): Promise<number>`. Consume Task 1 inventory and Task 2 installer. Entry point supplies real process streams, working directory and `os.homedir()`, and assigns returned code to `process.exitCode`.

- [ ] Write tests for `list`, `--help`, `--version`, no-argument help, installation of all skills and one exact skill, and stable success reporting. Assert version `0.1.0` and all three names.
- [ ] Test destination choices: default `<cwd>/.agents/skills`, Claude `<cwd>/.claude/skills`, global `<home>/.agents/skills`, global Claude `<home>/.claude/skills`, absolute custom root, and relative custom root resolved against `cwd`.
- [ ] Test unknown commands/names/options, extra positionals, missing `--dir` value (including a following option), install flags supplied to `list`, and `--dir` combined with `--global` or `--claude`. Assert nonzero status, actionable stderr and no writes.
- [ ] Run `node --test test/cli.test.js`; confirm missing CLI causes failure.
- [ ] Implement the parser and command dispatcher, help with the approved examples, destination resolution and caught-error reporting. Add the Node shebang and executable permission on `bin/which-way.js`; map `bin.which-way` to it in `package.json`. Read version from package metadata.
- [ ] Run all tests, then invoke `node bin/which-way.js list` from `/tmp` using its absolute path; require the bundled inventory to work independently of current directory.
- [ ] Review and commit as `feat: expose skill listing and installation through the CLI`.

### Task 4: Document and verify the distributable

**Files:** `README.md`, `CHANGELOG.md`, `test/package.test.js`.

**Interfaces:** Test the public executable from the actual npm tarball produced by Tasks 1–3; no additional runtime API.

- [ ] Write an integration test that runs `npm pack --json --pack-destination <temp>`, inspects tarball members, installs the tarball in a temporary project with lifecycle scripts disabled, and invokes the installed executable to list and install skills. Use a temporary npm cache to keep writes within writable paths. Assert exactly the expected three installed files with matching bytes; require no tests, specs, Git metadata or source-machine paths in the archive.
- [ ] Run `node --test test/package.test.js`; if the artifact already meets the contract, record that result rather than manufacturing a failure.
- [ ] Update README with router descriptions, Node requirement, `npx` examples, npm package installation versus agent skill installation, destinations, overwrite and symlink behavior, local testing and packaging commands, and the fact that registry publication is pending. Add a `0.1.0` changelog entry describing the library and explicit CLI.
- [ ] Run `npm test`, `npm pack --dry-run --json` with a temporary cache, `git diff --check`, and original-to-bundled comparisons. Confirm the package integration test invoked the installed executable and all assertions passed. Do not publish.
- [ ] Review and commit as `docs: document and verify npm skill distribution`.

## Completion Review

- [ ] Review the whole implementation against the approved spec, especially path resolution, preflight before writes, package contents and CLI errors. Use the execution method selected by the user and its required review workflow.
- [ ] Report test results, local usage, package version and any actual limitations. State registry publication remains pending; do not imply the npx registry command is live.
