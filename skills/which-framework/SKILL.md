---
name: which-framework
description: Use when the user asks to choose or compare skills or workflows, resolve overlapping options, or assess whether a skill is needed. Reports a recommendation without invoking selected skills or starting execution. Ordinary requests to perform work do not trigger this router merely because skills overlap. For choosing a code reviewer or security reviewer specifically, use which-codereview or which-security-review instead.
---

Choose a route for the specific task: one skill, a minimal chain, a per-workspace chain, "split first", "no suitable local route found", or "none — just do it". **Report only: do not invoke selected skills or begin the requested work.** Judge every candidate by its installed instructions; no publisher, collection, namespace, or directory gets preference.

## Step 0 — Triage gate

Classify the ask before discovering candidates.

### Exit 1 — "none — just do it"

Use when the task is routine, low consequence, understood, and has no unresolved decision or specialist verification need: a typo, a mechanical edit, an explanation answerable from available evidence.

Judge consequence and uncertainty, not size. A one-line config change, version bump, or rename can affect security, compatibility, data, or deployment. An explanatory question can need research. A formatter, linter, or typechecker covers only what it checks.

Report the verdict and stop.

### Exit 2 — "split first"

Routing a mixed bundle imposes one part's workflow on the rest: the open part gets planned before anything is decided, and the settled part gets an interview it doesn't need.

Split signals:

- **Mixed decision state.** Some choices are open while other parts are fully specified.
- **Blocked sub-item.** A mechanical-looking part depends on an unresolved decision, as shown by the repo or docs.
- **Different reviewer.** Parts need different expertise or approvals.
- **Different definition of done.** Parts need different verification or acceptance evidence.

These are signals, not a vote or a threshold: different reviewers or verification methods can belong to one coherent deliverable. Split only when keeping the parts together would cause incompatible assumptions, premature work on a blocked part, or independent deliverables forced through one workflow. Parts that serve one outcome are phased work: continue to discovery and route them as an ordered or per-workspace chain in Step 4.

Report the parts, their dependencies, and the capability each needs. Name capabilities, not skills. Check for a blocked part in the named workspace only; don't run skill discovery or search the wider filesystem for a split. Recommend an order in the same report, so the user doesn't have to re-ask just because the work has several parts; ask them to pick only when an unresolved priority decision blocks routing. Route nothing and stop.

Completion criterion: the task takes an exit, or proceeds to Step 1 with its consequential uncertainties stated.

## Step 1 — Discover candidates

Start from what is already known and widen only to fill a gap. A **phase** is a distinct capability the task needs, such as diagnosis, testing, review, or a requirements interview.

1. **Registry first, plus one frontmatter scan.** Begin with the live skill list in context and any paths the user gave. The registry omits user-only skills (`disable-model-invocation: true`) and unregistered ones, so always list the names and descriptions in the configured skill roots too — frontmatter only, not bodies (for example `rg -l -g SKILL.md "disable-model-invocation: true" <root>` alongside the root listing). If the two together hold a plausible candidate for every phase, go to item 3. Never discard a compatible skill because no application registered it.
2. **Widen on a gap.** Search the filesystem only when the registry lacks a compatible candidate, a source points to another location, an unresolved fact could change the winner, or the user asks for exhaustive discovery. Search skill roots named in local configuration or install records first: `rg --files --hidden --no-ignore -g SKILL.md <root>`, or `find <root> -name SKILL.md` without `rg`. Also check plugin command files (`commands/*.md`) and any other definition format a manifest names, and the harness's built-in commands. Name each wider scope before searching it. Search the whole filesystem only on explicit request; skip `/proc`, `/sys`, and remote mounts, respect permissions, and guard against symlink cycles.
3. **Screen** names and descriptions for the capabilities the task needs. Don't filter on directory name or a familiar keyword. Mark routers separately from execution skills.
4. **Shortlist two or three finalists per phase and read their full bodies.** A single-phase task gets two or three in total. Skills the user named form the shortlist for their phase; if one of them later fails a Step 2 gate, return here and add a replacement. A skill that covers several phases counts once and is compared in each. Read a reference only when it could change compatibility or ranking, but before calling a selected route verified, read every reference its body makes mandatory. Stop reading once more reading could not change the recommendation, and list what stayed uninspected.
5. **Read the frontmatter** of each finalist for invocation restrictions (`disable-model-invocation`, `user-invocable`, allowed tools) and runtime or effort controls. These set the `[user]`/`[agent]` markers in Step 5; never guess them. Verify built-in command syntax and effort levels against the local harness.
6. **Resolve identity.** Deduplicate symlinks by resolved path; keep distinct versions separate. A file on disk is not a slash command: an unregistered standalone skill is usable by its path. For a cached, archived, or app-bound copy, report whether its instructions can be used directly or need activation in a particular runtime. Check name collisions against the registry (a custom `code-review` can shadow a built-in harness command) and resolve the actual target.

Never invent or install a skill. If a location was unreadable or discovery stopped early, say so.

Record finalists in one table:

| Candidate | Source path | Does and produces | Requires and side effects | Invocation restrictions | Invocation and status |
|---|---|---|---|---|---|
| Installed name | Resolved path | Capabilities and artifacts from its body | Files, tools, services, live user; edits files, posts comments | From frontmatter: user-only, agent-invocable, tool limits | Verified command or path; active, inactive, or uncertain |

Completion criterion: every finalist has a source path or registry entry, and the searched scope and its limits are recorded. If nothing suitable exists in scope, report that without implying exhaustive absence.

## Step 2 — Run the four probes

Evaluate the finalists' recorded facts against this task and environment.

**A — Prerequisites and artifacts.** Separate mandatory prerequisites from examples and fallbacks. A clearable state (missing config, uncommitted work) becomes a proposed prerequisite step — don't perform it. A standing constraint (no interactive user, unavailable tool, incompatible target) gates the route. A missing requirement can remove one dimension of a skill or make the whole skill unusable; state which. Match the produced artifact to the user's intent and its expected lifetime. Mark uninspected requirements as unknown. Never infer prerequisites or superiority from skill length, publisher, or a remembered comparison.

**B — Drift and shortcuts.** For long, unattended, unfamiliar, or consequential work, prefer verified checkpoints, real verification, independent review, or recovery limits. For short supervised work, skip artifacts and handoffs that prevent no concrete failure.

**C — Domain coverage.** Check whether the task needs specialist coverage: security, performance, accessibility, native UI, observability, CI/CD, release, migrations, architecture, research, or visual design. Prefer direct domain fit over adapting a general skill. Claim unique coverage only after comparing the relevant bodies.

**D — Workspace, runtime, feedback loop.** Resolve each target workspace independently; mixed decision states go back to Step 0's split test. When the route depends on verification, inspect the actual tests and commands — headless tests, infrastructure-dependent tests, device checks, and manual visual checks are different loops. Don't add a test suite just to satisfy a candidate; if establishing tests is part of the user's request, report it as a prerequisite step. A candidate's required unavailable runtime rules it out; a portable subset can fit if you name the adaptation. A compiling build is not verification.

Completion criterion: each probe has local evidence or an explicit unknown or not-applicable finding. If a missing fact could change the winner, give a conditional route and name the fact.

## Step 3 — Rank

Apply in order:

1. **Gate** on prerequisite and runtime compatibility (Probes A and D).
2. **Coverage** of the user's intended outcome, including domain fit (Probe C).
3. **Verification strength** proportional to the task's risk (Probe B).
4. **Effort.** Fewer links and lighter artifacts win ties. If still tied, recommend one and name the other as the alternative.

Match capability to need: interviews to real unresolved decisions; research to lookup-able facts; executable plans to imminent implementation; tickets or specs to backlog work; debugging to reproduction and diagnosis; testing to the actual feedback loop. Check handoff rules — a skill that mandates implementation fits poorly when the user wants tickets for later.

Routers are ordinary candidates. Recommend one only when its narrower selection prevents a named failure that direct comparison does not. Track every router visited or proposed in this routing session, and never route back to this skill or repeat one of them. If the answer to the user's question is this skill itself (for example, "which skill picks skills?"), say so and ask for the concrete task in the same report; don't list this skill as an invocation.

Reviews: if this skill is triggered for a review-only ask, compare `which-codereview`, `which-security-review`, and direct reviewers as ordinary candidates. For a review link inside a broader chain, choose from verified reviewer capabilities at an effort sized to risk; don't assume a built-in command or a particular publisher's reviewer.

Completion criterion: each recommended candidate and the named alternative have inspected bodies, and every exclusion traces to a body or an observed constraint. Mark a conditional recommendation as conditional.

## Step 4 — Chain only when phases need different capabilities

The default is one link. Each extra link must name the failure it prevents.

1. **Name the failure.** Write the concrete outcome that happens without the link ("ships an untested gate", "picks the seam by accident"), not "less rigor". No nameable failure, no link.
2. **Keep contributions distinct.** Drop a link that duplicates another's safeguard. Two links may target the same failure only through different mechanisms, such as implementation tests and an independent security review. Preserve mandatory handoffs; if the chain can't satisfy them, pick another route.
3. **Size to risk, not topic.** A consequential one-line change may need substantial verification; a broad topic alone justifies nothing.
4. **Look up facts instead of asking.** If the repo answers the open questions, drop the interview link.

Calibration — the failure test overrides it:

| Work size | Expected links |
|---|---|
| One sitting, one workspace | **1** — usually an implementation skill |
| One sitting with a real design choice | **2** — design, then implementation |
| Multi-session, or workspaces with different loops | **3–4**; Probe D usually splits the back half |
| Backlog-bound epic | interview → tickets; route each ticket later |

Before pairing links, check each body's terminal state and handoffs. Avoid duplicate planning, contradictory test loops, and repeated general reviews. Keep reviewer outputs separate when their instructions require it. Recommending ceremony is the same failure Step 0 exists to prevent, one step later.

Completion criterion: every link has a named failure and a distinct contribution, and the chain satisfies mandatory handoffs.

## Step 5 — Report

Output in this order:

1. **Verdict** — one skill, a minimal chain, a per-workspace chain, "split first", "no suitable local route found", or "none — just do it".
2. **Why** — at most two sentences naming the decisive probes and coverage limits.
3. **What you're giving up** — the strongest alternative and its verified advantage, or "no suitable alternative found".
4. **Invocation** — verified commands or instruction-file paths, in order, with prerequisites and each link's named failure. Mark `[user]` for user-only commands or human action and `[agent]` for agent-invocable steps once authorized, based on the frontmatter read in Step 1. State uncertain syntax or missing activation; never invent a slash command.
5. **Discovery** — selected paths, serious alternatives, searched scope, and unreadable or unsearched locations within it.

For "none — just do it", report the verdict only. For "split first", report parts, dependencies, likely capabilities, a recommended order, and any blocking decision — no invocations. For "no suitable local route found", report the missing capability, searched scope, and remaining uncertainty — no invocations.

Example (illustrative names):

> **Verdict:** chain — `repro-debug` → `test-first`
>
> **Why:** The failure isn't reproduced yet (Probe B), and `api/` has a headless vitest suite that `test-first`'s loop needs (Probe D).
>
> **What you're giving up:** `fix-and-verify` does both phases in one skill, but its body has no reproduction step before the fix.
>
> **Invocation:**
> 1. `[user]` Prerequisite: share the failing request's logs from staging.
> 2. `[agent]` `/repro-debug` — prevents fixing a guessed cause.
> 3. `[agent]` `/test-first` — prevents the fix landing without a regression test.
>
> **Discovery:** live registry plus `~/.claude/skills`; `repro-debug` at `~/.claude/skills/repro-debug/SKILL.md`. `~/.cache` not searched.

**Do not invoke. Do not begin the work. Stop after the report.**
