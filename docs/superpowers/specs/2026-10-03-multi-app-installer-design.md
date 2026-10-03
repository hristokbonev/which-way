# Guided multi-app skill installation with `skills@latest`

## Goal and package identity

People can choose several AI coding apps, any subset of the three bundled
skills, and project or user scope in one guided run. The guided entry point is
`npx @hristokbonev/which-way` with no arguments. The package's correct npm
name is `@hristokbonev/which-way`; the GitHub repository remains
`hristokbonev/which-way`. The already published
`@hristobonev/which-way@0.1.0` is a different npm package and is not the
target of this release.

Use the upstream [`skills` CLI](https://github.com/vercel-labs/skills) for
discovery and installation rather than maintaining destination mappings and
copy logic for each app. Its published agent catalog, installation methods,
and destination choices are the source of truth for this flow. The upstream
CLI was checked in read-only `--list` mode against both this checkout and
`hristokbonev/which-way`; both yielded exactly the three intended skills.

## Guided flow

When stdin and stdout are terminals, `which-way` with no arguments presents a
line-oriented picker. It first lets the user choose one or more apps from
Codex, Claude Code, Cursor, Gemini CLI, GitHub Copilot, Windsurf, Google
Antigravity, OpenCode, Cline, and Roo Code. Show the corresponding upstream
agent IDs: `codex`, `claude-code`, `cursor`, `gemini-cli`,
`github-copilot`, `windsurf`, `antigravity`, `opencode`, `cline`, and `roo`.
Users can enter multiple menu numbers or `all`. Do not silently narrow the
choice to installed or detected apps.

The picker then presents the three bundled skill names and descriptions and
accepts one or more numbers or `all`. It asks for one scope, `project` or
`user`, shared by all selected apps. It shows the selected apps, skills,
scope, and source package before a final confirmation that defaults to no.
Cancellation or end-of-input exits without installing. Invalid or empty
selections are re-prompted. With no arguments and no terminal, print
actionable usage and exit nonzero without installing.

After confirmation, spawn `npx --yes skills@latest add <bundled-package-root>`
in the invoking project directory with one `--agent` per app, one `--skill`
per skill, `--global` for user scope, `--copy`, and `--yes`. Pass an absolute
path to the packaged root so installation uses the same skill bytes as the
npm package version the user launched. Use argument arrays, not a shell
command string. Propagate upstream output and exit status. The upstream
command may need network access to fetch `skills@latest`; show a useful
error if it cannot start. `--copy` retains the existing package's independent
copy behavior. The wrapper does not itself write app skill directories.

## Scripted and existing commands

`which-way install --app <id> [--app <id> ...] [--skill <name> ...]
[--scope project|user]` uses the same upstream path without prompts. If no
`--skill` is supplied, select all three; if no `--scope` is supplied, use
project scope. The app and skill flags can be repeated. Reject unknown IDs,
names, malformed values, and unsupported combinations before invoking
upstream. An explicit app is required for this new scripted path so there is
no hidden agent auto-detection.

Keep `which-way list`, `--help`, and `--version` read-only. Preserve the
existing `which-way install`, `install <skill>`, `--claude`, `--global`,
`--dir`, and `--force` copier behavior for current users when `--app` is
absent. Do not mix the legacy `--dir`, `--claude`, or `--force` options with
the upstream `--app` path. For the upstream path, `--global` may alias
`--scope user`, but conflicting scope choices are errors. The legacy custom
directory option remains available through `install --dir`; the guided
multi-app picker only offers named apps because upstream does not expose an
arbitrary destination flag.

## Upstream boundary and release

The upstream CLI owns destination paths, shared-path handling, existing-skill
behavior, and writes. The wrapper must not promise all-destination preflight
or rollback, because upstream does not document those guarantees. Its
behavior may change with `skills@latest`; document this trade-off and keep
the selected package's skill contents fixed by using the local package root.
Do not infer app choice from files in the current directory.

Rename npm metadata and public examples to `@hristokbonev/which-way`.
Keep the three `SKILL.md` files byte-identical to their sources. Test picker
validation, cancellation, non-TTY behavior, argument construction and exit
propagation with a stubbed subprocess; retain tests for the legacy copier.
Pack the npm artifact and verify its executable and bundled skills from an
isolated project. Publish the new scope only after verifying its availability
and authenticated npm access. Leave the old published scope untouched unless
the user separately asks to deprecate it.
