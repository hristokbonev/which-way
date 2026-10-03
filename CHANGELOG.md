# Changelog

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
