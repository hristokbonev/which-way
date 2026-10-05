# which-way

> Lost among your agent skills? Which way is the way to go? which-way is the way to go!

You have dozens of skills installed and a task in front of you. Several skills
overlap, a few would pull in opposite directions, and you're not sure whether
the change needs a review at all. which-way gives you the route: which skills to
run, in what order, and how deep to go. Sometimes the answer is "none, just do
it."

Agent skills for choosing the next workflow or reviewer:

- **which-framework** recommends an installed skill or workflow for a task.
- **which-codereview** recommends whether and how to review a code change.
- **which-security-review** recommends whether and how to assess a security concern.

Each skill reports a route and stops. Installing these skills does not run any
review or workflow.

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

## Measure a review target

`which-codereview` measures the change it routes with a bundled script. The
same measurement is available from the command line:

```sh
npx @hristobonev/which-way measure main          # commits since the merge-base with main
npx @hristobonev/which-way measure --working-tree
npx @hristobonev/which-way measure --help
```

It prints JSON and needs Node.js 22 or later.
