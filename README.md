# which-way

Three agent skills for choosing the next workflow or reviewer:

- **which-framework** recommends an installed skill or workflow for a task.
- **which-codereview** recommends whether and how to review a code change.
- **which-security-review** recommends whether and how to assess a security concern.

Each skill reports a route and stops. Installing these skills does not run any
review or workflow. The library preserves the three supplied skill files as-is.

Requires Node.js 22 or newer.

## Install skills

```sh
npx which-way list
npx which-way install
npx which-way install which-framework --claude
npx which-way install --global
npx which-way install --dir ./custom-skills
```

`npx` downloads the npm package and runs its executable. `npm install
which-way` adds the package to a JavaScript project, but does not copy skills
into an agent's discovery directory; run `which-way install` to do that.

By default, installation copies all three skills into the current project's
`.agents/skills` directory. Pass a skill name to install just one. `--claude`
uses `.claude/skills`; `--global` uses the same location under your home
directory. These two flags can be combined. `--dir <path>` uses a custom skill
root; a relative path is resolved from the current directory and cannot be
combined with `--claude` or `--global`.

Existing skill directories cause the whole installation to stop before any
copying. `--force` replaces only selected skill directories, preserving other
skills. The installer rejects symbolic links at the skill root and selected
skill directories. No install command prompts or uses the network.

## Work from this repository

```sh
node bin/which-way.js list
node bin/which-way.js install --dir ./example-skills
npm test
npm pack --dry-run
```

The npm package includes the CLI and the three `SKILL.md` files. The tests
also install a real tarball in a temporary project and invoke its executable.
