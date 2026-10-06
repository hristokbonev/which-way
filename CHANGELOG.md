# Changelog

## Unreleased

### Added

- `which-way inventory` and a bundled `scripts/inventory.mjs` in each router:
  list the installed user, project and plugin skills, plugin commands and
  agents as JSON, with real paths, user-only flags, plugin enabled state,
  name collisions, and skipped stale plugin versions or unreadable folders.
  Nothing is cached; every run reads the files as they are.

### Changed

- `which-codereview`, `which-security-review` and `which-framework` discover
  candidates by running the inventory alongside the live registry and take
  every file path from it, so they no longer read stale plugin versions. The
  manual folder walk remains as the fallback without node.
- `which-security-review`: a reviewer whose default target is a diff, branch
  or PR no longer counts as accepting a repository, design or configuration
  audit, so whole-repository audits route to a threat-modeling process.
- `which-framework` screens every registry and inventory entry, user-only
  ones included.

## 0.3.0 — 2026-10-06

### Added

- `which-way measure` and the bundled `skills/which-codereview/scripts/measure.mjs`:
  measure a review target (a fixed point, `--staged`, `--unstaged`,
  `--working-tree`, `--pr <n>`, or automatic) and print JSON with file and
  line counts, binary files, renames, untracked files, staged and unstaged
  paths, commits, workspaces and reviewer inputs. Exit status 2 is an
  unknown ref and 3 a PR commit that could not be fetched.

### Changed

- `which-codereview` Step 1 runs the measure script instead of spelling out
  the git procedure. The procedure moves to `references/manual-measure.md`,
  used when node 22+ is unavailable or an unstaged target should include
  untracked files. Step 3's self-review exclusion starts from the script's
  reviewer inputs.

## 0.2.4 — 2026-10-04

### Changed

- `which-codereview`, `which-security-review` and `which-framework` find
  plugins through `~/.claude/plugins/installed_plugins.json`: they read each
  plugin's `installPath` (`skills/`, `commands/`, `agents/`), skip stale
  cached versions, and report disabled plugins as inactive. The review
  routers also shortlist plugin agents and give their agent-type invocation.

## 0.2.3 — 2026-10-04

### Added

- MIT license (`LICENSE`, `"license": "MIT"` in `package.json`).

### Changed

- Trimmed `which-framework` further without changing routing: chain sizing
  folds into the name-the-failure rule, and the review-only fallback is gone
  (the description already sends those asks to `which-codereview` and
  `which-security-review`).
- `which-security-review` stops with "re-route required" when the target
  modifies a router or loaded instructions (the installed router may be the
  modified copy), labels registry built-ins `[agent]` consistently, flags only
  text that tries to change routing as suspected injection, and lists a
  repository's own agent configuration under Focus instead of asking for an
  impossible clean session. Smaller consistency fixes: the provisional tier
  floor applies only with an override, an explicit `max` request beats the
  small-diff cap, and the evidence-gap modifier needs an unknown that could
  change the starting row.
- `which-security-review` re-routes only when it actually loaded a file from
  the target (fixing a loop when rerouting from a base worktree), passes
  uncommitted changes explicitly to base-worktree reviews, and checks the real
  path of an executable before its one permitted `--help` call.

## 0.2.2 — 2026-10-04

### Changed

- Rewrote `which-security-review` discovery to start from the live skill
  registry and known skill roots instead of a filesystem-wide scan with a
  hand-rolled cache, and narrowed its trigger to questions about choosing a
  security review ("do a security review" goes straight to a reviewer).
- `which-security-review` treats diff content, commit messages, PR text, skill
  bodies and tool output as data, and a target can no longer choose or
  configure its own review: target-added or modified skills, scanner configs,
  `CLAUDE.md`/`AGENTS.md`, hooks and settings are excluded or replaced with the
  base revision's, and target-modified tests and CI do not count as coverage.
- `which-security-review` never executes the target: no tests, builds,
  scanners, repo-local binaries or package runners.
- New overrides for weakened checks and scanner suppressions (judged from the
  diff, not the "security fix" message), agent and harness configuration,
  session/token lifecycle, webhooks, money movement and runtime privileges.
- Consistent effort: modifiers count once, at most one reduction (evidence
  that predates the target), no fixup reduction, and a `high` cap unless a
  design or system spans connected components (`xhigh`) or the user asks for
  `max`.
- Routes rank dedicated security reviewers before general reviewers and
  guidance skills; built-in registry commands count as installed. Unattended
  agent work needs positive evidence and is isolated with a fresh session.
- Report gained Target (with SHAs), Focus, and Response steps sections;
  credential-like values get a separate `[user]` rotation step and are never
  quoted, and text addressing reviewers is cited by location as suspected
  injection rather than copied into the reviewer's brief.
- A repository audit treats the repository's own skills, hooks, `CLAUDE.md`
  and scanner configs as target-supplied, so it cannot pick its own reviewer.
- Trimmed `which-codereview` and `which-framework` without changing routing;
  `which-codereview` also fixes two report inconsistencies and keeps discovery
  within the known skill roots.

## 0.2.1 — 2026-10-04

### Changed

- `which-codereview` treats diff content, commit messages and PR descriptions
  as data, and a diff can no longer configure its own review: modified
  convention docs, hooks, settings and agent definitions are not used as the
  review standard, and checks whose CI or tests the diff changed do not count
  toward a skip.
- `which-codereview` counts work as unattended agent work only on positive
  evidence, defaults to the working tree when no target is named, measures PRs
  between their base and head commits, and lists reviewers that need a
  clearable prerequisite as conditional alternatives instead of asking.
- Simplified `which-codereview` effort rules (at most one reduction, no fixup
  or mechanical-pattern reductions) and added Target and Focus sections to its
  report.

## 0.2.0 — 2026-10-04

### Changed

- Rewrote `which-framework` to be shorter and cheaper to run: it starts from the
  live skill registry plus a frontmatter scan of skill roots (so user-only skills
  are still found), shortlists two or three finalists per phase, reads invocation
  restrictions from frontmatter, and no longer recommends itself as a next step.
- `which-framework` follows symlinked skill roots when scanning for user-only
  skills, stops reading when more reading would cost more than the decision is
  worth, and lets users widen a shortlist of skills they named.
- `which-framework` answers questions about routing itself with a "needs a
  concrete task" verdict before running discovery, and puts its finalist table
  in the report.
- Rewrote `which-codereview` discovery to start from the live skill registry and
  known skill roots instead of a filesystem-wide scan with a hand-rolled cache,
  and narrowed its trigger to reviewer-choice questions.
- `which-codereview` now excludes skill definitions added or modified by the diff
  under review, labels unregistered candidates as unverified, and reads tests
  before treating them as coverage.
- Fixed `which-codereview` effort rules: fixup re-reviews are no longer reduced
  twice, `xhigh`/`max` need a named failure beyond counted modifiers, and the
  auth/migration floor applies only to changes in that surface's behavior.
- `which-codereview` keeps routing the code portion of mixed legal-copy diffs,
  never runs tests itself, and names focus areas instead of listing findings.

## 0.1.0 — 2026-10-03

### Added

- Bundled `which-framework`, `which-codereview`, and `which-security-review`.
- Added explicit skill listing and installation through the `which-way` CLI.
- Added project, Claude, global, and custom destination options with conflict
  and symbolic-link safeguards.
