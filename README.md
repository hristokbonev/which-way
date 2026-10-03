# which-way

Three agent skills for choosing the next workflow or reviewer:

- **which-framework** recommends an installed skill or workflow for a task.
- **which-codereview** recommends whether and how to review a code change.
- **which-security-review** recommends whether and how to assess a security concern.

Each skill reports a route and stops. Installing these skills does not run any
review or workflow. The library preserves the three supplied skill files as-is.

## Install skills

```sh
npx skills@latest add hristokbonev/which-way
```

The [skills CLI](https://github.com/vercel-labs/skills) installs directly from
this repository and handles agent selection, destination paths, and installation
scope. It can detect installed agents; use the flags below to choose explicitly.

### Choose apps and skills

Repeat `--agent` to select several apps and `--skill` to select several skills:

```sh
npx skills@latest add hristokbonev/which-way \
  --agent codex --agent claude-code \
  --skill which-framework --skill which-codereview
```

| App | Agent ID |
| --- | --- |
| Codex | `codex` |
| Claude Code | `claude-code` |
| Cursor | `cursor` |
| Gemini CLI | `gemini-cli` |
| GitHub Copilot | `github-copilot` |
| Windsurf | `windsurf` |
| Google Antigravity | `antigravity` |
| OpenCode | `opencode` |
| Cline | `cline` |
| Roo Code | `roo` |

See the upstream [supported agents](https://github.com/vercel-labs/skills#supported-agents)
for the full list. List this library's skills without installing:

```sh
npx skills@latest add hristokbonev/which-way --list
```

### Choose scope

Installation defaults to the current project. Add `--global` to install for
your user account across projects:

```sh
npx skills@latest add hristokbonev/which-way \
  --agent codex --skill which-framework --global
```

The CLI offers symlink or copy installation. Add `--copy` for independent
copies and `--yes` to skip confirmation prompts when scripting an explicit
selection.

## Work from this repository

Local development requires Node.js 22 or newer.

```sh
npx skills@latest add . --list
npm test
npm pack --dry-run
```

The npm package includes the CLI and the three `SKILL.md` files. The tests
also install a real tarball in a temporary project and invoke its executable.
