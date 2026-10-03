# Changelog

## Unreleased

### Changed

- Rewrote `which-framework` to be shorter and cheaper to run: it starts from the
  live skill registry plus a frontmatter scan of skill roots (so user-only skills
  are still found), shortlists two or three finalists per phase, reads invocation
  restrictions from frontmatter, and no longer recommends itself as a next step.

## 0.1.0 — 2026-10-03

### Added

- Bundled `which-framework`, `which-codereview`, and `which-security-review`.
- Added explicit skill listing and installation through the `which-way` CLI.
- Added project, Claude, global, and custom destination options with conflict
  and symbolic-link safeguards.
