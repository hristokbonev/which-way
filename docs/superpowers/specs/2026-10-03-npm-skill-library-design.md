# which-way npm skill library

## Purpose and scope

Turn this repository into an npm-distributed library containing the user's
existing `which-codereview`, `which-framework`, and `which-security-review`
agent skills. Users must be able to discover and copy these skills into an
agent's skill directory using a small command-line program.

The user approved this package shape in conversation. This written spec is
the review artifact before implementation planning.

## Library contents

Copy each supplied `SKILL.md` unchanged into `skills/<name>/SKILL.md`.
The source directories are under
`/home/hristo/claudeolduser/claude2/.claude/skills/`.
They contain no supporting skill assets; nested Git metadata is excluded.
The library routes tasks and reviews to installed workflows. Installing a
skill never runs its instructions or the workflows it recommends.

## Package architecture

Use package name `which-way`, initial version `0.1.0`, and a `which-way`
executable. Implement a dependency-free Node.js CLI using built-in filesystem
and path APIs. Set Node.js 22 or newer as the supported runtime.

Keep CLI argument handling separate from the installation operation so that
filesystem behavior can be exercised independently. Resolve bundled skills
relative to the package location, never the invoking project's directory.

An explicit npm `files` allowlist includes the executable, its implementation,
the skills, and user documentation. Specs, tests, source Git metadata, and
local artifacts must not enter the package. No npm lifecycle hook installs
skills automatically. Registry publication is a separate action from preparing
and testing the package; registry name availability remains unverified.

## Command contract

- `which-way list`: print the three skill names and descriptions; write nothing.
- `which-way install`: install all three bundled skills.
- `which-way install <skill>`: install only the exact known skill name.
- `--claude`: use `.claude/skills` instead of `.agents/skills`.
- `--global`: resolve the selected agent directory under the user's home
  instead of the current working directory.
- `--dir <path>`: use this exact skill-root directory; relative paths resolve
  from the current working directory. Reject combinations with `--claude`
  or `--global` rather than silently overriding them.
- `--force`: permit replacing the selected existing skill directories.
- `--help` and `--version`: report usage and package version without writes.

Installation flags apply only to `install`. Unknown commands, unknown skills,
extra positional arguments, unsupported flag combinations, and missing flag
values produce an actionable error and a nonzero exit status before writes.
Successful commands exit zero. Installation reports the installed names and
destination. There are no interactive prompts or network requests.

Examples after publication:

```sh
npx which-way list
npx which-way install
npx which-way install which-framework --claude
npx which-way install --global
npx which-way install --dir ./custom-skills
```

## Installation safeguards

Validate skill names against the bundled inventory rather than constructing
source paths from arbitrary input. Preflight every selected skill before
installation: bundled files must exist and destinations must not conflict
unless `--force` is present. An ordinary conflict aborts the whole selection
without installing any of it.

Copy only the selected skill directories. Forced replacement affects only
those directories and leaves sibling skills alone. Reject symlinks at the
destination skill root or selected skill directories, including dangling
links, to avoid unintentionally writing through them. Explicit parent paths
may use normal operating-system path resolution.

Filesystem failures report the affected path and return nonzero. Preflight
prevents predictable partial installation; unexpected I/O failures may leave
some selected skills installed. Do not promise transactional rollback.

## Documentation

README explains what each router does, the supported Node.js version,
npm/npx usage, project and global destinations, custom directories,
overwrite behavior, and local development/verification. Clearly distinguish
installing the npm package from copying skills into agent discovery locations.
Add a short initial changelog. Do not invent authorship, licensing grants,
repository URLs, or claims that this package is already published.

## Verification criteria

Use Node's built-in test runner and temporary directories to verify listing,
default and individual installation, Claude and global path selection,
custom directories, argument errors, conflict preflight, forced replacement,
preservation of unrelated skills, and rejection of destination symlinks.
Compare installed file contents with bundled source files.

Verify imported skills match all three supplied originals byte for byte.
Inspect `npm pack --dry-run` output, build a real tarball, install that tarball
in an isolated temporary project, and invoke its executable to list and install
skills. This must establish that the published artifact contains everything
needed at runtime and excludes development files.

## Out of scope

No skill rewrites, review execution, external skill downloads, automatic agent
configuration edits, registry publication, or additional agent-specific adapters
in this first version.
