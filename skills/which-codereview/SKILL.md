---
name: which-codereview
description: Choose whether a change needs review, the effort, and the best locally installed review skill or harness command. Use before reviewing a branch, PR, or working diff, or when choosing a reviewer. Discovers candidates across local installations, reports an exact invocation, and stops without running the review.
---

Choose the review route that best fits one specific diff from the skills and commands actually installed on this system. **Report only: do not review the code or invoke the selected route.**

Sibling to `which-framework`, which routes whole tasks. This skill routes reviews only.

## Step 1 — Establish and measure the review target

Establish the target before triage or reviewer discovery. Measure the change and inspect relevant diff content to identify mechanical edits, behavioral effects, and consequential surfaces. For a committed range, run:

```bash
git diff --numstat <fixed-point>...HEAD     # three-dot: against the merge-base
git log <fixed-point>..HEAD --oneline
```

For a committed-range review, resolve the supplied fixed point or ask for one if it cannot be inferred reliably. A bad ref must fail here, before recommending a reviewer. For working-tree or PR targets, use the measurements below instead.

Use `--numstat` for quantitative measurements: sum numeric additions and deletions separately, and use their sum as changed lines when needed. Binary entries report `-` in both columns: count their paths as changed files and report them separately, without treating the dashes as zero or estimating line counts. Deduplicate paths, including renames, rather than counting a rename as two files. For automated parsing or unusual filenames, use `--numstat -z` and parse its NUL-delimited rename records correctly. `--stat` is optional for a human-readable overview. Line counts inform effort; they do not determine risk or complexity by themselves.

Record **unique files changed · lines added/removed · workspaces touched · commits**, and whether the target is a committed range, staged changes, unstaged changes, combined working-tree changes, or a PR. A workspace is a separately configured package/application/build unit identified from repository manifests; for a single-unit repo, count one. Commit count is not applicable to uncommitted targets. Supported targets differ between discovered reviewers.

Establish the exact uncommitted scope from the request before measuring. An unspecified "working-tree review" means the final working-tree state relative to HEAD, including relevant non-ignored untracked source/configuration files. Explicit staged-only or unstaged-only requests retain that scope. If intent is ambiguous and materially changes the review, clarify it.

- Staged-only: use `git diff --cached --numstat` (index versus HEAD).
- Unstaged-only: use `git diff --numstat` (working tree versus index); include untracked files only if requested.
- Combined: use `git diff HEAD --numstat` for tracked files, measuring the final delta once. Do not add staged and unstaged statistics: they can overlap or cancel.
- Identify untracked files with `git ls-files --others --exclude-standard`. Explicitly list which are included and measure text contents as additions and report binary files separately without line counts; exclude unrelated artifacts with a stated reason. Count unique paths across tracked and included untracked files. Report staged/unstaged status separately from aggregate size.

For an unborn branch with no HEAD, use an empty-tree baseline only for staged-only targets (index versus empty tree) and combined targets (final working-tree state versus empty tree), and state that basis. Unstaged-only targets remain working tree versus index, even without HEAD; do not include already staged content in that target. A tracked net-zero combined diff is not empty if relevant included untracked files remain.

For a PR, resolve its actual base/head before measuring. Use the selected target's scope; do not substitute a committed range for a working-tree review. A verified empty target can receive a "no changes to review" verdict; an invalid ref is an error, not a clean review.

**Prerequisites are not automatically disqualifiers.** A clearable state such as needing a commit becomes an explicit first step in the proposed invocation, provided the user is willing and the step preserves the intended diff. Do not commit, stage, push, or activate a plugin yourself. Standing limitations such as an unsupported runtime, missing spec, or unavailable required tool genuinely restrict a candidate. If the user wants to keep the tree uncommitted, select a reviewer that supports that target.

Completion criterion: measurements come from command output, and exclusions distinguish standing limitations from clearable prerequisites.

## Step 2 — Decide whether review is warranted

Use the measured target and inspect relevant changes before applying this gate. A verified empty target receives "no changes to review"; an invalid ref is an error.

Apply the review-required conditions below before the skip test: they prohibit skipping and impose a `medium` floor, even for a demonstrably mechanical change with passing checks. A truly empty target still exits as "no changes to review". For other changes, skip only when the change is demonstrably mechanical, relevant automated checks have passed, and no behavioral or consequential surface changed. Name the evidence and checks supporting that conclusion. Missing or unavailable checks do not satisfy this condition.

Lockfiles, generated or vendored output, docs/copy, version/config changes, and reviewer-requested fixups are not automatic exemptions. Check what they affect: dependency resolution, generated behavior, permissions, deployment, public contracts, and meaning can change without edits to handwritten code. For low-risk changes that do not meet the skip conditions, recommend a focused review of the relevant delta. Requested fixups receive a focused re-review and the single effort reduction defined in Step 5.

**Review-required conditions — these override the skip test:** review at no less than `medium` when the diff touches auth, permissions, payments, privacy/visibility gates, database migrations, or shared contracts; when unattended agent work has not been read by anyone; or when merging automatically publishes to users. Check deployment configuration and rollback practicality in the target repository rather than assuming a particular branch or release process.

Legally consequential copy needs the appropriate human/domain reviewer. Report that requirement and stop rather than treating deeper code review as a substitute.

Completion criterion: a skip names the mechanical-change evidence, passed checks, and absence of behavioral/consequential impact; otherwise name the review scope and any minimum-effort condition.

## Step 3 — Discover the installed routes

Use a current candidate inventory before choosing a route. No library, publisher, namespace, or fixed skill name is an allowlist.

Cache discovery, never the selection verdict. Store a reusable inventory in an available writable local cache, including canonical source paths, discovery time, definition format, file modification time or content fingerprint, and searched, excluded, unreadable, and unsearched roots. Record the cache path in the report. If no cache is available, perform discovery and disclose that limitation.

On each use, validate the inventory as follows:

- Re-enumerate definition paths recursively within known skill-bearing roots, including existing descendants. Compare the path set to the cache to detect additions, removals, and renamed definitions; checking only a root directory's modification time is insufficient. Record these roots explicitly so validation has a defined scope. Include the supported alternate definition formats from the inventory.
- Compare cached definition files' modification time and size, using content fingerprints when metadata is unchanged or unreliable. Re-read changed definitions' names/descriptions and reclassify their capabilities; remove missing paths. Cache discovery metadata for non-review skills too, so a changed description can become a new review candidate.
- Check recorded registries, manifests, and installation records for changed paths or versions. Refresh affected roots and add newly identified roots to the recursive checks. Update the cache only from successful checks and retain explicit coverage limits for failed checks.

Perform filesystem-wide discovery on explicit refresh, when the last full scan is older than seven days, or when no inventory exists. Incremental validation does not reset the last-full-scan timestamp. A skill added in an arbitrary directory outside recursively checked roots may remain undiscovered until that full scan; disclose this limitation and inventory age rather than claiming exhaustive current discovery. Known-root validation may itself be expensive, so report incomplete checks instead of silently treating them as fresh.

A cache must never narrow filesystem-wide eligibility to previously discovered directories. Re-read every serious contender's current body and relevant references, and verify availability and prerequisites before ranking; cached capability summaries are only discovery hints.

1. Discover reviewing skills independently of any application. Live skill lists, configuration, manifests, environment variables, and installation records provide useful starting points, but do not define eligibility or search boundaries. A standalone skill outside an application's directories is an equal candidate.
2. When a full scan is due under the cache rules above, search the readable local filesystem for skill definitions, including arbitrary directories, other users' readable directories, repositories, shared installation locations, and locally mounted volumes. Start with known locations for speed, then expand to all remaining readable local filesystem roots; do not stop at the current home, workspace, or application directories. On Unix-like systems, start the expanded search at `/`; on other systems, enumerate local drives and mount roots. Use `rg --files --hidden --no-ignore -g SKILL.md` where appropriate, with a filesystem traversal fallback for roots it cannot enumerate. Also inspect alternate skill definition formats identified by local manifests or registries: `SKILL.md` is a discovery convention, not an eligibility requirement. Follow directory symlinks with cycle protection and deduplicate resolved paths. Exclude virtual kernel/process filesystems and remote mounts; do not exclude real directories merely because they are hidden, dependency/vendor trees, caches, or associated with an unfamiliar application. Respect filesystem permissions and report unreadable or unsearched locations.
3. Inspect frontmatter names and descriptions for review capabilities, including correctness, spec compliance, coding standards, security audits, architecture, performance, and language-specific reviews. Do not filter solely by directory name or the word `review`: an `audit` skill may be the best reviewer. Separate actual reviewers from routers, finding-response skills, simplifiers, and launch checklists.
4. Read the full bodies of relevant candidates and their required references before ranking them. Record each candidate's canonical path, declared name, runtime/namespace if any, supported targets, review dimensions, prerequisites, isolation/delegation model, effort controls, invocation restrictions, and side effects such as posting PR comments or editing files.
5. Deduplicate symlink aliases by resolved path. Keep distinct versions or implementations separate. Keep discovery separate from invocation: a standalone skill can be usable by reading its instructions even without registration in the current application. Verify required tools and execution compatibility. For cached, archived, or application-bound copies, report whether their instructions can be used directly or require activation in a particular runtime. Never claim a filesystem match establishes an available slash command, and never discard a compatible reviewer solely because no application registered it.

Use a compact inventory:

| Candidate and source path | Capabilities | Targets and prerequisites | Invocation and availability |
|---|---|---|---|
| Actual installed name | What its body says it checks | Working tree, commits, PR, required docs/tools | Verified command or skill path; active, inactive, or uncertain |

Check name collisions against the live registry and runtime precedence. For example, a custom `code-review` skill can shadow a built-in command. Resolve the actual target before recommending an invocation; use a qualified name or explicit path when supported. Verify built-in command syntax and effort levels against the local harness rather than retaining version-specific assumptions here.

If a directory is unreadable or discovery is incomplete, state the coverage limit. If no suitable installed reviewer is found, say so; do not invent one or install anything.

Completion criterion: discovery extends beyond application directories across the readable local filesystem; every candidate has a source path or live registry entry, and any search coverage limits are explicit.

## Step 4 — Match capabilities to the question

### Probe A — What is being asked?

Match the requested question to capabilities verified in the discovered skill bodies:

| Question | Required capability |
|---|---|
| Is this correct / will it break? | Bug and correctness review |
| Does this do what the issue asked? | Explicit spec/issue compliance review |
| Does this match our conventions? | Standards review using the repo's documented conventions |
| Is this a security problem? | Security review appropriate to the runtime and threat surface |
| Can this be simpler? | Simplification or maintainability review; distinguish this from bug finding |
| Is this ready to ship? | Launch readiness checks; distinguish this from diff review |

A newly discovered reviewer can win any category. Do not infer exclusive capabilities from a publisher or assume a familiar general reviewer lacks spec checks: read its installed body.

### Probe B — What does each relevant candidate need?

Check prerequisites for every serious contender using its actual instructions. Locate required specs, issues, standards, bootstrap files, tools, and supported targets. Pass explicit paths when conventions live outside the candidate's defaults. Record documented fallbacks and skipped dimensions; a standards fallback does not establish spec coverage. Report reduced coverage in the verdict.

### Probe C — Who wrote it, and was anyone watching?

- **Agent-written, unattended, long run:** prefer a discovered route that provides an independent reviewer without the author's session history. Verify isolation from the body rather than assuming that all subagents are independent.
- **Human-written, or agent-written with the user reading each step:** a suitable single-pass reviewer can be enough.
- **Second pass after findings were fixed:** scope the target to the fixup range; apply any effort reduction only in Step 5.

### Probe D — What catches a miss?

- Tests exist and run headless: normal tier.
- No test suite in this workspace: identify what CI actually checks and record the verification gap for Step 5.
- Verification requires a human on a device: name the manual verification step and record the verification gap for Step 5.
- A candidate targets a different runtime: explain any adaptation or choose a better-fitting installed reviewer.

Completion criterion: all four probes answered; the contenders' required file/tool checks actually run. Rank by fit, coverage, isolation, and cost, not library membership.

## Step 5 — Set bounded effort and review structure

Use the ordered planning ladder `low → medium → high → xhigh → max`. It is not a universal command argument. Map the final label to the selected reviewer's verified controls; if it has no tiers, express effort through scope, dimensions, verification depth, and independent passes.

Choose one starting tier from scope and complexity. Line counts are supporting evidence, not mandatory thresholds:

| Change shape | Starting tier |
|---|---|
| One concern, one workspace, straightforward local logic; often under 100 changed lines | `low` |
| Several related paths or two workspaces; moderate interactions; often 100–300 changed lines | `medium` |
| Multiple interacting concerns/workspaces or substantial logic; often over 300 changed lines | `high` |

Do not raise the starting tier merely because the change touches a shared package; account for downstream contract risk once below. Generated volume and repeated mechanical patterns should not inflate complexity.

Apply each distinct risk modifier once, raising one rung:

- Auth, permissions, payments, or privacy boundary risk: one combined modifier, regardless of how many labels apply.
- Migration or downstream/shared-contract compatibility risk: one combined modifier.
- Automatic publication on merge or impractical rollback: one combined delivery-risk modifier; verify the actual deployment and rollback conditions.
- A verification gap: absent tests or a device/manual-only loop count together as one modifier.
- Unattended agent authorship.
- Evidence that a previous review of this change missed a problem.

Apply each justified reduction once, lowering one rung: a repeated mechanical pattern; a tool demonstrably proves the relevant risky property; a re-review restricted to requested fixups. Do not count the same evidence twice—for example, a mechanically repeated pattern that already reduced the starting scope is not another reduction. Fixups receive their reduction here only, not in the probes.

Calculate from the starting rung, add unique risks, subtract unique reductions, then clamp to `low`–`max` and enforce any `medium` floor from Step 2. `xhigh` and `max` require a concrete costly-miss reason, such as a security boundary, hard-to-reverse migration/release, or a verification gap in consequential work. If arithmetic reaches those levels without such a reason, cap at `high`. State the starting tier, counted modifiers, floors/caps, final tier, and mapping once.

Use billed cloud review only when available and the user has expressed willingness to pay; label user-only invocations `[user]`. This router does not launch them.

### Large changes: assess reviewability

Above roughly 1,000 changed lines, assess cohesion, generated/mechanical volume, independent concerns, and cross-area interactions. Size alone does not require splitting the change.

- A coherent change can receive one suitably scoped review.
- Separable areas can receive staged reviews with explicit scopes.
- Recommend splitting the change itself when independent concerns or tangled scope materially impair understanding, and explain why.

For staged or split reviews, preserve a final integration pass when interactions between areas create risk. Each stage must have a defined target and purpose; avoid gaps and duplicate general review. Respect any actual size limits in the chosen reviewer and choose another route or staging when necessary.

Completion criterion: effort is bounded, each factor is counted once, and the chosen review structure follows cohesion and interaction evidence rather than a hard line-count cutoff.

## Step 6 — Pair only for complementary coverage

Pair routes only when the second answers a requested question the first structurally cannot answer. Determine overlap from the discovered bodies, not fixed library pairings. Examples include a general correctness review plus a spec compliance pass, or a standards review plus a specialist security audit.

Keep distinct reports side by side when their instructions require separate dimensions. Do not add another general reviewer merely because a different library supplies it. If a selected route already delegates multiple independent checks, account for that coverage before recommending another pass.

A finding-response skill may be recommended as a follow-up when an agent will act on findings, but label it as a follow-up rather than a reviewer. Simplification follows correctness fixes when both are requested.

Completion criterion: every proposed pass has a question or follow-up role the others do not cover.

## Step 7 — Report

**Terminal exits:** an invalid or unresolvable target, a verified empty target, a supported skip verdict, or a requirement for a human/domain reviewer ends routing at the step that establishes it. Report only the verdict, supporting evidence (or the target error), and any necessary next action. Use "no changes to review" for an empty target and "none — don't review" for a supported skip. These exits are exempt from reviewer discovery, effort calculation, alternative comparison, and invocation/discovery fields below; do not invent those fields or continue searching to fill them.

For cases that require reviewer selection, output in this order:

1. **Verdict** — a discovered route plus effort, a complementary pair, "none — don't review", "staged review" or "split first" when justified, or "not a code review — use X".
2. **Effort** — starting tier, applied modifiers, final tier, and how it maps to the route's supported controls.
3. **Why** — two sentences naming the decisive probes and any missing dimensions.
4. **What you're giving up** — the strongest relevant losing candidate and its actual advantage. If none exists, say so. A clearable prerequisite alone does not make a better reviewer lose only when willingness to perform it is established and the preparation demonstrably preserves the selected target. Then include it in the proposed invocation. Without that evidence, recommend the compatible route and present the other reviewer as a conditional alternative. Never presume willingness to commit, stage, push, or activate a plugin.
5. **Invocation** — verified command strings or a supported explicit skill invocation, in order. Include required target, documentation paths, and clearable prerequisites. Mark each `[user]` if user-only, billed, or requiring user action; otherwise `[agent]` if callable once authorized. If syntax or availability cannot be verified, report that limitation instead of inventing a command.
6. **Discovery** — selected skill's source path, other serious candidates considered, inventory/cache path and age, whether it was refreshed, and any unreadable/unsearched roots or inactive installations that limit the recommendation.

**Do not review. Do not invoke. Stop after the report.**

## Keeping this honest

Maintain discovery using Step 3’s cache and refresh rules; derive each recommendation from current contender bodies and verified availability. Reviewers from any application, library, or arbitrary local directory participate on equal terms; application registration is not required for compatible instruction-based skills. Cached copies, example commands, and remembered version behavior are not proof of an active installation or supported invocation.
