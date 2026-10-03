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

List this library's skills without installing:

```sh
npx skills@latest add hristokbonev/which-way --list
```

The CLI offers symlink or copy installation. Add `--copy` for independent
copies and `--yes` to skip confirmation prompts when scripting an explicit
selection.
