# Measuring a review target by hand

Use this when `scripts/measure.mjs` cannot run (no node 22+), or for an unstaged-only target that should include untracked files. Record the same fields the script reports: unique files · lines added/removed · workspaces · commits, binary files, and included/excluded untracked files.

For a committed range:

```bash
git diff --numstat <fixed-point>...HEAD     # three-dot: against the merge-base
git log <fixed-point>..HEAD --oneline
```

A bad ref must fail here, before recommending a reviewer. If the request names no target at all ("does this need review?"), default to the combined working tree relative to HEAD; if that is empty and the branch has commits not on its upstream or default branch, use that committed range instead, and state the choice.

Take measurements from `--numstat` command output: sum additions and deletions separately; their sum is changed lines. Binary entries report `-` in both columns: count their paths as changed files and report them separately, without treating the dashes as zero. Deduplicate paths, counting a rename as one file (use `--numstat -z` for unusual filenames and parse its NUL-delimited rename records). Record **unique files changed · lines added/removed · workspaces touched · commits**, and whether the target is a committed range, staged changes, unstaged changes, combined working-tree changes, or a PR. A workspace is a separately configured package/application/build unit identified from repository manifests; for a single-unit repo, count one. Commit count is not applicable to uncommitted targets.

Establish the exact uncommitted scope from the request before measuring. An unspecified "working-tree review" means the final working-tree state relative to HEAD, including relevant non-ignored untracked source/configuration files. Explicit staged-only or unstaged-only requests retain that scope. If intent is ambiguous and materially changes the review, clarify it.

- Staged-only: use `git diff --cached --numstat` (index versus HEAD).
- Unstaged-only: use `git diff --numstat` (working tree versus index); include untracked files only if requested.
- Combined: use `git diff HEAD --numstat` for tracked files, measuring the final delta once. Do not add staged and unstaged statistics: they can overlap or cancel.
- Identify untracked files with `git ls-files --others --exclude-standard`. Explicitly list which are included and measure each with `git diff --no-index --numstat /dev/null <file>` (exit status 1 is normal), reporting binary files separately without line counts; exclude unrelated artifacts with a stated reason. Count unique paths across tracked and included untracked files. Report staged/unstaged status separately from aggregate size.

On an unborn branch (no HEAD), measure staged-only targets with `git diff --cached --numstat` and combined targets against the empty tree (`git diff --numstat $(git hash-object -t tree /dev/null)`), stating that basis; unstaged-only targets stay working tree versus index, excluding staged content. A tracked net-zero combined diff is not empty if included untracked files remain.

For a PR, get its base and head with `gh pr view <n> --json baseRefOid,headRefOid`, verify each with `git rev-parse --verify <oid>^{commit}`, fetch any that is missing (a fork head: `git fetch <remote> pull/<n>/head`), and measure `git diff --numstat <baseRefOid>...<headRefOid>`, not against the local `HEAD`. Use the selected target's scope; do not substitute a committed range for a working-tree review. A verified empty target receives "no changes to review"; an invalid ref is an error, not a clean review.
