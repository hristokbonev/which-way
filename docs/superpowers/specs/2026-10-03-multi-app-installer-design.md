# Install the which-way skills with `skills@latest`

## Goal

Use the existing `hristokbonev/which-way` GitHub repository as the skill
source. Users install its three skills directly with the upstream `skills`
CLI. This project does not add an installer, guided wrapper, app picker, or
app-specific destination logic.

The primary install command is:

```sh
npx skills@latest add hristokbonev/which-way
```

The upstream CLI already discovers all three `skills/<name>/SKILL.md` files
from this repository. Its `--list` mode was verified against both the local
checkout and the public GitHub source. `skills@latest` owns prompts, app
support, destination paths, project/global scope, and installation behavior.

## Choices and examples

Document the upstream flags for explicit choices, using its agent IDs:

```sh
# See available skills without installing.
npx skills@latest add hristokbonev/which-way --list

# Choose several apps and two of this library's skills.
npx skills@latest add hristokbonev/which-way \
  --agent codex --agent claude-code \
  --skill which-framework --skill which-codereview

# Install for the user account rather than the current project.
npx skills@latest add hristokbonev/which-way --global
```

The upstream agent catalog includes Codex, Claude Code, Cursor, Gemini CLI,
GitHub Copilot, Windsurf, Antigravity, OpenCode, Cline, and Roo Code. Users
may select any supported combination with repeated `--agent` flags. Scope is
project by default; `--global` selects user scope. Upstream may auto-detect
an agent during an interactive run, so the documentation must show explicit
flags for reproducible choices. Do not claim that the default run always
prompts for all three choices.

## Repository changes and release

Update the README so the upstream command is the recommended installation
path and remove the npm CLI installation examples from its primary flow.
Keep the three `SKILL.md` files byte-identical. No new app installer code or
npm dependency is needed. The already published npm package is named
`@hristobonev/which-way`; the correct spelling is `hristokbonev`. Correct
npm package metadata and examples to `@hristokbonev/which-way` if the npm
package is maintained, but do not suggest the npm package as the skill
installation command. Publishing or deprecating either npm package is a
separate release action and is not required for `skills@latest` installation.

Verify the public `--list` command continues to find exactly the three
intended skills. Check README examples against the current upstream CLI
documentation and test the repository's existing suite after any edits.
