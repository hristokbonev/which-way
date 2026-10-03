---
name: which-framework
description: Use when the user asks to choose or compare skills or workflows, resolve overlapping options, or assess whether a skill is needed. Reports a recommendation without invoking selected skills or starting execution. Ordinary requests to perform work do not trigger this router merely because skills overlap.
---

Choose a locally available skill, a minimal chain, a per-workspace route, "split first", "no suitable local route found", or "none — just do it" for the specific task. **Report only: do not invoke selected skills or begin the requested work.** No application, collection, publisher, namespace, or directory owns a task category by default.

## Step 0 — Triage gate

Classify the ask before discovering candidates. Use **"none — just do it"** when the task is routine, low consequence, sufficiently understood, and has no unresolved decision or specialist verification need. Examples include a harmless typo, a mechanical edit, or a simple explanation answerable from available evidence.

Assess consequences and uncertainty rather than edit size. A config value, version bump, rename, or single line can affect security, compatibility, data, or deployment. An explanatory question can require research. A formatter, linter, or typechecker covers only the properties it checks; its presence does not establish that the whole task is routine.

For a qualifying task, report the verdict only and stop before discovery.

### The second exit — "split it first"

A task can be too *mixed* to route rather than too small. Routing a bundle picks one member's shape and imposes it on the rest: the open-ended part gets a plan before anyone decided anything, and the settled part gets an interrogation it doesn't need. **Verdict: "split first" — name the split, route nothing, stop.**

Assess whether the parts need separate routes using these signals:

- **Mixed decision state.** Some behavior or vendor choices remain open while other parts are fully specified.
- **A blocked sub-item.** A seemingly mechanical part depends on an unresolved decision, as shown by the repo or docs.
- **Different reviewer.** Parts require different expertise or approvals.
- **Different definition of done.** Parts require different verification or acceptance evidence.

These are signals, not a vote or automatic split threshold. Different reviewers or verification methods can belong to one coherent deliverable. Treat work as phased when the parts serve a shared outcome and can be handled by an ordered or per-workspace route. Choose **"split first"** only when separate scopes are necessary to avoid incompatible assumptions, premature work on a blocked part, or independently deliverable work being forced through one workflow.

Report the parts, dependencies, and likely capability for each. Require the user to choose a part only when an unresolved priority or scope decision actually prevents routing. Otherwise recommend the decomposition in the same report; the user need not re-ask merely because the work has multiple parts. Do not begin execution.

Completion criterion: the task qualifies for a routine exit, requires a justified split, or can proceed to discovery. State consequential uncertainties rather than assuming a single route.

## Step 1 — Discover the installed routes

Build a task-relevant candidate inventory within an explicit search scope. No library, publisher, namespace, or fixed skill name has preferential eligibility.

1. Discover task skills independently of any application. Live skill lists, configuration, manifests, environment variables, and installation records provide useful starting points, but do not define eligibility; use Step 1's bounded expansion rules to set search scope. A standalone skill outside an application's directories is an equal candidate.
2. Start with the live registry, user-provided paths, and known skill roots identified by local configuration or installation records. Search these roots with `rg --files --hidden --no-ignore -g SKILL.md` where appropriate; inspect alternate definition formats when a manifest identifies them. Expand to additional readable locations when the initial inventory lacks a compatible candidate, a source points to another location, a specific unresolved capability or compatibility fact could change the recommendation, or the user requests exhaustive discovery. Choose and report the next bounded scope before searching it. Whole-filesystem traversal is reserved for explicitly requested exhaustive discovery; exclude virtual kernel/process filesystems and remote mounts, respect permissions, and use cycle protection when following directory symlinks. Caches, vendor trees, and unfamiliar application directories are eligible when relevant, but need not be scanned indiscriminately.
3. Inspect frontmatter names and descriptions for capabilities relevant to the task, including requirements, planning, implementation, testing, debugging, review, design, research, and specialist domain work. Do not filter solely by directory name or a familiar task keyword: a differently named skill may be the best fit. Distinguish execution skills from routers and adjacent capabilities.
4. Shortlist a few plausible contenders from descriptions by task coverage and known compatibility. Read their full bodies, expanding the shortlist only when a contender fails or a specific unresolved capability or compatibility fact could change the recommendation. Read references that could change compatibility or ranking; before claiming a selected route is verified, inspect all mandatory references applicable to that route. Record each inspected contender's canonical path, declared name, runtime/namespace if any, supported targets, task coverage and output artifacts, prerequisites, isolation/delegation model, effort controls, invocation restrictions, and side effects such as posting PR comments or editing files. Bound total inspection effort, including reference depth, by whether more reading could materially change the recommendation. If that effort would exceed its value, stop and report a conditional recommendation with uninspected requirements and comparison limits explicit.
5. Deduplicate symlink aliases by resolved path. Keep distinct versions or implementations separate. Keep discovery separate from invocation: a standalone skill can be usable by reading its instructions even without registration in the current application. Verify required tools and execution compatibility. For cached, archived, or application-bound copies, report whether their instructions can be used directly or require activation in a particular runtime. Never claim a filesystem match establishes an available slash command, and never discard a compatible skill solely because no application registered it.

Use a compact inventory:

| Candidate and source path | Capabilities | Targets and prerequisites | Invocation and availability |
|---|---|---|---|
| Actual installed name | What its body says it does | Supported tasks, required docs/tools | Verified command or skill path; active, inactive, or uncertain |

Check name collisions against the live registry and runtime precedence. For example, a custom `code-review` skill can shadow a built-in command. Resolve the actual target before recommending an invocation; use a qualified name or explicit path when supported. Verify built-in command syntax and effort levels against the local harness rather than retaining version-specific assumptions here.

If a directory is unreadable or discovery is incomplete, state the coverage limit. If no suitable local skill is found, say so; do not invent one or install anything.

Completion criterion: every shortlisted candidate has a source path or live registry entry, and the searched scope and meaningful coverage limits are recorded. Stop when the scoped inventory supports comparison of suitable candidates with no known relevant gap, or when further discovery would exceed proportional effort for the task. If no candidate is suitable within that scope, report that finding and the remaining uncertainty; do not imply exhaustive absence.

## Step 2 — Run the four probes

Evaluate discovered candidates by their installed instructions. These probes select capabilities, not collections.

### Probe A — Prerequisites and artifacts

Apply Step 1's staged inspection to shortlisted contenders. Check their actual required files, tools, repository conventions, services, live-user interaction, and permissions from inspected sources; mark uninspected requirements as unknown. Record the artifacts it produces: executable plans, backlog tickets, specs, code, reports, or published changes. Match the artifact to the user's intent and expected lifetime.

Distinguish mandatory prerequisites from examples and documented fallbacks. Pass explicit documentation paths where supported. A missing requirement can remove a dimension or make the whole skill unusable; state which. Do not infer prerequisites or automatic superiority from skill length, publisher, or a remembered comparison.

A clearable state becomes a proposed prerequisite step rather than an automatic loss. Do not perform that step here. Standing constraints such as no interactive user, unavailable tools, or an incompatible target genuinely gate a route.

### Probe B — Risk of drift or shortcuts

For long, unattended, unfamiliar, or consequential work, prefer candidates with verified checkpoints, meaningful verification, independent review, or recovery limits. Compare the discipline offered against its cost. Do not assume only one library provides these controls. For short supervised work, avoid imposing artifacts and handoffs that do not prevent a concrete failure.

### Probe C — Domain coverage

Check whether the task needs specialist coverage such as security, performance, accessibility, native UI, observability, CI/CD, release, migrations, architecture, research, or visual design. Screen discovered candidates by description, including standalone and unfamiliar skills, and inspect plausible specialist contenders under Step 1's effort bound. Claims of unique coverage require inspected evidence; otherwise state the comparison limit. Prefer direct domain fit over adapting a familiar skill with mismatched assumptions.

### Probe D — Workspace, runtime, and feedback loop

Resolve the target workspace and runtime. For multi-workspace work, check each workspace independently; use a shared design/planning front half only where the intent and artifacts are shared. Different implementation loops can require different routes. Mixed decision states go back to Step 0's split test.

When the recommendation depends on a workspace's verification loop, inspect actual test files and runnable verification commands. Headless tests, infrastructure-dependent tests, device checks, and manual visual checks are different feedback loops. If the workspace lacks tests, do not add a test-suite project merely to satisfy a candidate; select a compatible workflow or clearly report a prerequisite if establishing tests is part of the user's request.

Read platform assumptions from the candidate body: browser APIs, native tools, language, framework, service connectors, and deployment model. A portable subset may fit if you name the adaptation; a required unavailable runtime rules it out. Do not label work verified merely because a build compiles.

Completion criterion: each applicable probe has local evidence or an explicit unknown/not-applicable finding. Name known target workspaces and check contenders' required files/tools and feedback loops where accessible. If a missing workspace or fact could change the winner, give a conditional route and identify the minimum information needed; do not invent evidence or require unrelated checks.

## Step 3 — Rank by task fit

Build a task-specific comparison from the discovered inventory instead of a permanent winner table.

| Candidate and source | Task coverage and output | Prerequisites and compatibility | Advantage and cost |
|---|---|---|---|
| Actual discovered name/path | Verified capabilities and artifacts | Probe A/D evidence | What it improves and what it adds |

Match requirements interviews to real unresolved decisions; research skills to lookup-able facts; executable planning to imminent implementation; durable tickets/specs to backlog work; debugging to reproduction and diagnosis; testing to the actual feedback loop; and specialist skills to their domain. These are capability categories, not fixed skill names.

Rank by coverage of the user's intended outcome, prerequisite compatibility, runtime fit, verification strength, and proportional effort. A candidate outside a familiar library can win every category. Do not claim a feature is unique without comparing relevant discovered bodies. Verify handoff rules: a skill that mandates implementation may be a poor fit when the user only wants tickets for later.

For a review-only ask, compare review routers and direct reviewers by the same criteria as other candidates. A router such as `which-codereview` receives no preference from its name. Recommend an additional router only when its narrower selection capability prevents a named failure that direct comparison does not. Track router paths already visited or proposed in this routing session; exclude any route that returns to this skill or repeats a router. For a review link in a broader chain, use verified reviewer capabilities and appropriate effort instead of assuming a built-in command or a publisher-specific reviewer.

Completion criterion: each recommended candidate and any reported strongest relevant alternative have inspected source bodies; exclusions and tradeoffs trace to those bodies or observed environment constraints. If no suitable alternative or winner was found, say so within the searched scope. When evidence is incomplete, distinguish a conditional recommendation from a verified fit.

## Step 4 — Chain, when phases need different capabilities

Mix when phases need different capabilities or complementary controls that prevent concrete failures. Report the chain as an ordered list with the invocation syntax, and say why each link is there.

### Size the chain before you build it

A chain is not free. Every link is a handoff, a context switch, and a chance for the thread to drop — so even a short task needs a concrete reason for each added link. **The default is one link. Each additional link has to be argued for, and the argument is a named failure.**

Apply in order:

1. **Name the failure.** For each link, write the specific thing that goes wrong if it isn't there — not "less rigor," an actual outcome ("ships an untested gate", "picks the seam by accident"). **A link with no nameable failure comes out.**
2. **Check contributions are distinct.** Remove links that duplicate an existing safeguard. Links may address the same failure when they catch different causes or supply complementary evidence, such as implementation tests and independent security review. State what each adds. An interview and planning step are redundant only when they resolve the same decisions without adding useful evidence or a required artifact. Preserve mandatory handoffs; if a chain cannot satisfy them, choose another compatible route.
3. **Size controls to actual risk and uncertainty.** Assess the consequences of this change, unresolved decisions, and missing safeguards. Use expected diff size as one effort signal; a consequential one-line change may need substantial verification. A broad topic alone does not justify extra links.
4. **Drop the interrogation link when the unknowns are lookup-able.** Look up facts and reserve user questions for decisions. If you can answer the open questions by reading the repo, read the repo and skip the link.

Rough calibration, to be overridden by the failure test rather than followed mechanically:

| Work size | Expected links |
|---|---|
| One sitting, one workspace | **1** — usually just an implementation skill |
| One sitting, but a real design choice inside it | **2** — the design link plus implementation |
| Multi-session, or spanning workspaces with different loops | **3–4**, and Probe D usually splits the back half |
| Genuine epic, backlog-bound | interrogation → tickets, then re-route per ticket later — do not plan the whole thing now |

**If links add more cost than protection, remove redundant links or choose a simpler compatible route.** Preserve safeguards justified by actual consequences and mandatory handoffs. Recommending ceremony is the same failure Step 0 exists to prevent, arriving one step later.

Completion criterion: every link has a named failure and a distinct contribution attached. Links addressing the same failure explain their complementary mechanisms or evidence, and the chain satisfies mandatory handoffs.

Choose each chain link from the live inventory. Examples of capability sequences are diagnosis → regression test/fix → verification, requirements decisions → backlog tickets, or boundary design → public interface contract. These are examples, not required pipelines or named-library routes.

Avoid duplicate planning, contradictory test loops, and repeated general reviews. Check mandatory handoffs and terminal states from the chosen bodies before pairing them. Keep reviewer outputs separate when their instructions require it. Do not route to candidates whose required prerequisites failed Probe A or whose runtime failed Probe D.

## Step 5 — Report

Output, in this order:

1. **Verdict** — one skill, a minimal chain, a per-workspace chain, "split first", "no suitable local route found", or "none — just do it".
2. **Why** — at most two sentences naming the decisive probes and coverage limitations.
3. **What you're giving up** — strongest relevant alternative and its verified advantage; say if no suitable alternative was found.
4. **Invocation** — verified commands or supported instruction-file invocations, in order, with prerequisites and the specific failure each chain link prevents. Mark `[user]` for user-only commands or required human action and `[agent]` for compatible agent invocation once authorized. Check installed frontmatter and runtime restrictions; do not invent slash commands. A standalone compatible skill can be used through its explicit file path without app registration. State uncertain syntax or missing activation instead of presenting it as callable.
5. **Discovery** — selected source paths, serious alternatives, declared search scope, and relevant locations within that scope that were unreadable or deliberately left unsearched. Distinguish registered commands, standalone usable instructions, and incompatible or inactive copies.

For "no suitable local route found", report the missing capability or prerequisite, searched scope, and remaining uncertainty; omit invocation strings. For "none — just do it", report the verdict only. For "split first", report the parts, dependencies, likely capability for each, and any decision needed to route them; omit invocation strings because no route was chosen.

**Do not invoke. Do not begin the work. Stop after the report.**
