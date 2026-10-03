# Changelog

## Unreleased

### Changed

- Rewrote `which-framework` to be shorter and cheaper to run: it starts from the
  live skill registry plus a frontmatter scan of skill roots (so user-only skills
  are still found), shortlists two or three finalists per phase, reads invocation
  restrictions from frontmatter, and no longer recommends itself as a next step.
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
