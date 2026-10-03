# Multi-app skill installer

## Goal

Let people install any combination of the three bundled skills for one or more
AI coding apps at either project or user scope. Running the npm executable
without arguments opens a guided terminal picker. Existing scripted commands
remain usable.

The user chose a curated set of ten apps, app-specific discovery directories,
multi-app selection, one common skill selection, and one common scope per run.
The first release remains a local `SKILL.md` copier; it does not configure an
app, run a selected skill, or download other skills.

## Destination catalog

The app IDs used by `--app` and the picker are `codex`, `claude`, `cursor`,
`gemini`, `copilot`, `windsurf`, `antigravity`, `opencode`, `cline`, and `roo`.
Each project's base is the invoking current directory; each user's base is
the home directory returned by the OS. Append the path below to that base.
Use app-specific paths where documented. The Codex and Antigravity project
paths deliberately coincide; deduplicate their resolved absolute roots.

| App | Project skill root | User skill root | Documentation |
| --- | --- | --- | --- |
| Codex | `.agents/skills` | `.agents/skills` | https://learn.chatgpt.com/docs/build-skills |
| Claude Code | `.claude/skills` | `.claude/skills` | https://code.claude.com/docs/en/skills |
| Cursor | `.cursor/skills` | `.cursor/skills` | https://prod.cursor.com/docs/skills |
| Gemini CLI | `.gemini/skills` | `.gemini/skills` | https://geminicli.com/docs/cli/creating-skills/ |
| GitHub Copilot | `.github/skills` | `.copilot/skills` | https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills |
| Windsurf / Devin Cascade | `.devin/skills` | `.codeium/windsurf/skills` | https://docs.devin.ai/desktop/cascade/skills |
| Google Antigravity | `.agents/skills` | `.gemini/config/skills` | https://antigravity.google/docs/skills |
| OpenCode | `.opencode/skills` | `.config/opencode/skills` | https://opencode.ai/docs/skills |
| Cline | `.cline/skills` | `.cline/skills` | https://docs.cline.bot/customization/skills |
| Roo Code | `.roo/skills` | `.roo/skills` | https://roocodeinc.github.io/Roo-Code/features/skills/ |

A custom directory choice remains available for apps outside the catalog.
It is an explicit skill-root path, resolved from the current directory when
relative, and is not transformed by project/user scope.

## Guided terminal flow

`which-way` with no arguments opens a built-in, dependency-free line-oriented
picker only when stdin and stdout are terminals. It shows the app names and
accepts one or more menu numbers separated by commas or `all` for the ten
named apps; it also offers a custom directory option. Duplicate selections
are collapsed. A custom directory can
be combined with named apps and prompts for a path.

The picker then lists the three bundled skill names and descriptions and
accepts one or more numbers or `all`. It asks for `project` or `user` scope
for named apps, computes unique destination roots, and shows a final summary
of selected apps, skills, scope, and exact absolute paths. The default answer
to the final confirmation is no. Cancellation or end-of-input exits without
writing. Invalid or empty selections are re-prompted with a clear message.
The picker never asks for an overwrite decision; an existing selected skill
requires a new run with `--force` in scripted mode or an explicit force choice
in the picker before the final summary.

With no arguments and no terminal, the CLI prints actionable usage and exits
nonzero without writing. `--help` and `--version` remain read-only.

## Scripted command contract

`which-way install` keeps its current behavior: all bundled skills into the
current project's `.agents/skills` directory. `install <skill>` still selects
one exact bundled name. `--claude` remains an alias for `--app claude`, and
`--global` remains an alias for `--scope user`.

- Repeat `--app <id>` to select multiple apps. Without `--app`, use the
  existing generic `.agents/skills` root.
- Repeat `--skill <name>` to select multiple skills. Without `--skill` or the
  positional skill, select all three. Reject mixing positional and `--skill`.
- `--scope project|user` selects one scope for all named apps; default is
  `project`. Reject conflicting duplicate scopes or contradictory `--global`.
- `--dir <path>` adds a custom root to named app roots; with no `--app`, it
  remains the sole root as before. It may be combined with `--scope` when
  named apps are selected, but that scope affects only named app roots.
  `--dir` with the legacy `--claude` or `--global` aliases is rejected for
  compatibility with current validation.
- `--force` allows replacing selected existing skill directories, subject
  to the same symlink and regular-file safeguards as today.

Unknown app IDs, skill names, options, extra positionals, empty flag values,
and unsupported combinations fail before writes. List output should include
the new app catalog through a separate `apps` command; `list` remains the
skill list.

## Installation safety

Compute all unique destination roots before mutation. Preflight every
selected skill at every root, including source availability, existing
directories, regular files, and symlinks. Any predictable conflict aborts the
entire selection without copying to an earlier root. Preserve the current
`--force` behavior: only selected skill directories are replaced and sibling
skills remain untouched. Normalize absolute roots before symlink checks so a
trailing slash cannot bypass the check. Unexpected I/O errors may leave a
partial installation; report the failed path and do not claim rollback.

The wizard and scripted mode call the same destination resolver and installer.
No code path should infer an app from files in the current directory or change
an existing app's configuration files.

## Package and verification

Keep the existing three `SKILL.md` files byte-identical to their sources and
retain the npm package's dependency-free Node.js 22+ runtime. Add tests for
every app/scope mapping, alias and flag interaction, multi-skill selection,
deduplicated roots, all-root preflight, TTY prompts, cancellation, invalid
selections, and non-TTY no-argument behavior. Test the packed npm artifact in
an isolated project, including its `.bin/which-way` launcher. Update README
with guided and scripted examples and the catalog; add a `0.2.0` changelog
entry. Verify the exact package before publishing the new minor release.
