---
name: which-security-review
description: Choose whether a target needs security review, the effort, and the best locally installed security reviewer or audit command. Use when choosing a security review for a diff, repository, design, or deployment configuration. Discovers candidates, reports an exact invocation, and stops without running the review.
---

Choose the security review route that fits one specific target from the skills and commands actually installed on this system. **Report only: do not perform the audit or invoke the selected route.**

Sibling to `which-codereview`, which routes general code reviews. This skill routes security reviews, including specialist checks that a general reviewer cannot cover.

## Step 1 — Establish, measure, and identify the target

Resolve whether the request concerns a working diff, committed range, PR, whole repository, design, dependencies, or deployment configuration. An explicit repository audit or design review remains meaningful with a clean working tree.

For committed changes, resolve the fixed point and run:

```bash
git diff --stat <fixed-point>...HEAD
git diff --name-status <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

Use this merge-base range when it matches the request; use an exact commit range when requested. Invalid refs are errors, not empty diffs. For a PR, resolve its actual base/head and the intended comparison before measuring. Record files, added/removed lines, workspaces, commits, and target state; commit count is not applicable to uncommitted targets.

Establish the exact uncommitted scope before measuring. An unspecified working-tree review means the final working-tree state relative to HEAD, including relevant non-ignored untracked source/configuration files. Preserve explicit staged-only or unstaged-only requests; clarify only when ambiguity materially changes the target.

- **Staged-only:** index versus HEAD; use `git diff --cached --numstat`.
- **Unstaged-only:** working tree versus index; use `git diff --numstat`. Include untracked files only if requested.
- **Combined:** final working tree versus HEAD; use `git diff HEAD --numstat` for tracked files. Do not add staged and unstaged statistics, because overlapping edits can cancel. Report staging status separately from aggregate size.
- Identify untracked files with `git ls-files --others --exclude-standard`. List included paths and exclusions with reasons. Count included text contents as additions; report binary paths separately without invented line counts. Deduplicate paths across tracked and included untracked files, and retain any requested path restrictions.

For an unborn branch without HEAD, compare staged-only targets against an empty tree and combined targets' final working-tree contents against an empty tree, stating that baseline. Unstaged-only remains working tree versus index and excludes already staged content even without HEAD. Measure without staging files or changing the index. A net-zero tracked combined diff is empty only when no included untracked files remain.

For repository, design, or deployment targets, record the actual paths/documents, runtimes, services, and scope exclusions instead of inventing diff measurements. Inspect only enough source and configuration to route the assessment; leave vulnerability analysis to the selected reviewer.

Record these routing facts, citing the files or user context that establish them:

- **Assets:** what data, credentials, money, or capabilities the target protects.
- **Entry points and actors:** public, authenticated, internal, administrative, or local access; relevant attacker capabilities.
- **Trust boundaries:** client/server, user/admin, tenant/tenant, service/service, application/database, or build/deployment.
- **Exposure and consequence:** deployed or planned, blast radius, recoverability, and whether merge releases the change.
- **Existing coverage:** applicable security tests, prior review scope, scanners, and unresolved findings.

Label unknowns. Ask for missing information only when it could change the chosen route; otherwise state the assumption and its impact. Do not collect credential values or reproduce secrets as routing evidence.

Completion criterion: scope and measurements come from inspected artifacts, affected boundaries are identified, and consequential unknowns are explicit.

## Step 2 — Apply the skip gate

Use the measured target and inspect relevant changes before deciding whether to skip.

A verified empty change target receives **"no changes to review"** and exits before applying overrides or discovering reviewers, even when a security review was explicitly requested. This exit applies only to change targets; repository, design, dependency-state, and deployment assessments remain meaningful without a diff. Invalid refs or unavailable evidence do not establish an empty target.

For a change review, recommend **"none — no security review needed for this change"** only when the measured target has no security-relevant behavior or exposure, and no override applies. Possible cases:

- Prose, comments, or formatting with no effect on security instructions, consent, operational behavior, or generated execution.
- A mechanical rename with unchanged behavior established by existing verification.
- Generated output whose inputs and provenance were already reviewed, with no dependency, executable, or deployment change.

**Overrides — review even for a small or apparently mechanical change:**

- Authentication, authorization, tenant isolation, visibility, or database access policies.
- Untrusted input crossing into queries, shell commands, templates, file paths, outbound requests, deserialization, or executable content.
- Secrets, cryptography, sensitive data handling, logging, retention, or export.
- Dependencies, lockfiles, build scripts, CI credentials, artifact provenance, or deployment permissions.
- Public exposure, network controls, security headers, sandboxing, or security-relevant configuration/documentation.
- A security fix, unresolved security finding, or explicit user request for a security assessment.

Dependency and configuration changes are not automatically low risk. A clean scanner result or a prior general code review does not establish security coverage.

When skipping, report the target, evidence, and override decision, then stop before discovery. Mark reviewer selection, effort, invocation, and discovery as unnecessary rather than filling the full recommendation template.

Completion criterion: the target is explicit, and the skip decision names its evidence and applicable overrides. A skip verdict describes review necessity, not a claim that the system is secure.

## Step 3 — Discover the installed routes

Use a current candidate inventory. No publisher, application, namespace, or fixed skill name is an allowlist.

Cache discovery, never the selection verdict. Use an available writable local cache recording canonical paths, last expanded-scan time separately from incremental-check times, definition formats, modification times or content fingerprints, and searched, excluded, unreadable, and unsearched roots. Retain discovered definition paths even when they are not currently security candidates, so changed capabilities can be reconsidered. Report the cache path. If caching is unavailable, disclose that limitation.

On each non-skipped use, check live installation records, configured skill directories, and the target repository for added or changed definitions; confirm cached paths still exist and check their fingerprints. Keep these checks bounded to known locations rather than recursively traversing every previously searched root. A top-level directory timestamp alone does not establish that its descendants are unchanged. Refresh affected locations and reconsider changed definitions, including previously ineligible ones.

Repeat expanded discovery when the inventory is absent, the last expanded scan is older than seven days, the user requests a refresh, or no cached candidate fits. Incremental checks never reset the expanded-scan timestamp. Disclose that new definitions outside checked locations may remain undiscovered between expanded scans. Broad discovery establishes eligibility across the filesystem; it is not required again for every invocation. Re-read serious contenders and verify their current tools, runtime compatibility, and invocation syntax before selection. Cached availability is not execution evidence.

1. Start with live skill lists, configuration, manifests, and known installation locations, then expand across the remaining readable local filesystem. On Unix-like systems, search from `/`; otherwise enumerate local drives and mount roots. Use `rg --files --hidden --no-ignore -g SKILL.md` where appropriate, with a filesystem traversal fallback. Follow directory symlinks with cycle protection and deduplicate resolved paths. Exclude virtual kernel/process filesystems and remote mounts. Include readable repositories, other users' directories, shared locations, caches, hidden directories, and standalone skills. Inspect alternate definition formats identified by manifests or registries. Report unreadable or unsearched locations.
2. Inspect names and descriptions for security capabilities, including threat modeling, application audits, authorization, infrastructure, dependencies, secrets, and specialist runtime checks. Directory names and the word `security` are insufficient filters. Separate reviewers from routers, remediation skills, compliance checklists, and generic hardening guidance.
3. Read relevant candidates' complete instructions and required references before ranking them. Record their canonical path, declared name, runtime, supported targets, security dimensions, required context/tools, isolation model, effort controls, invocation restrictions, and side effects.
4. Verify execution compatibility. A standalone instruction-based skill can be usable without application registration; a filesystem match does not prove an available slash command. Keep distinct versions separate. For cached or application-bound copies, distinguish direct use from activation requirements. Resolve name collisions against the live registry and runtime precedence. Verify built-in command syntax against the installed harness.

Use a compact inventory:

| Candidate and source path | Security coverage | Targets and prerequisites | Invocation and availability |
|---|---|---|---|
| Actual installed name | Dimensions established by its body | Diff, repository, design, config; required tools/context | Verified command or explicit skill path; active, inactive, or uncertain |

Discover standalone scanner commands through the target's manifests, lockfiles, package-manager selection, CI scripts, and tool configuration. Check relevant executable availability and verify supported audit subcommands, targets, and side effects using local help or installed metadata. Keep command discovery bounded to tools relevant to the target; report missing or unverifiable tools. Do not run audits, execute project scripts, download tools, or use package runners that can install software merely to discover a command.

Include compatible installed scanners when they answer the requested question, but distinguish scanner output from a contextual review. Record executable/tool metadata as the source for command candidates without skill definitions. A general reviewer qualifies only for security dimensions its instructions actually cover. If no suitable route exists, say so; do not invent or install one.

Completion criterion: fresh or cached discovery extends beyond application directories, every serious candidate has a source path, live registry entry, or verified executable/tool metadata, and freshness and coverage limits are explicit.

## Step 4 — Match the security question to verified capabilities

| Requested question or surface | Required coverage |
|---|---|
| Can an attacker abuse this code change? | Contextual application security review of the relevant entry points and data flows |
| Can users cross roles or tenants? | Authorization and isolation review, including enforcement locations and applicable database policies |
| Is this design missing a boundary or abuse case? | Threat modeling against assets, actors, and proposed controls |
| Are dependencies or artifacts risky? | Dependency/provenance analysis using the actual manifests, lockfiles, and available advisory data |
| Are credentials exposed? | Secret detection with appropriate files/history scope; separate response workflow if exposure is confirmed |
| Is deployment or CI configured securely? | Infrastructure, IAM, network exposure, build, and deployment review |
| Is cryptographic or protocol logic sound? | Relevant specialist coverage; identify when installed tooling cannot supply it |
| Are prior security findings fixed? | Focused remediation verification plus adjacent bypass/regression coverage |

For each serious contender, check its required documents, standards, tools, supported languages, target types, and access. A tool that detects dependency advisories does not cover application authorization; a static code audit does not establish live infrastructure state.

Treat missing setup that can preserve the target as a clearable prerequisite in the proposed invocation. Establish whether the user is willing to perform it from existing instructions; target preservation alone does not establish willingness to install tools, activate plugins, provide credentials, or upload source. Prefer the best compatible route usable within established authorization. Present a stronger route with unmet prerequisites as conditional, unless willingness to satisfy them is already established. If only conditional routes fit, say that no suitable route is currently usable and state the required conditions. Missing required expertise, unsupported runtimes, or unavailable evidence are coverage limits. Do not stage, commit, activate plugins, run scanners, or connect to deployed systems while routing. Separate a passive review from dynamic testing that requires a defined environment and authorization.

For unattended agent-written changes, prior missed findings, or consequential boundaries, prefer an independent reviewer when its installed instructions establish that isolation. Account for any delegation already provided by the chosen route.

Completion criterion: each requested dimension maps to verified coverage or an explicit gap, and contenders' prerequisite checks have actually run.

## Step 5 — Set effort by security consequence

Use the ordered planning ladder `low → medium → high → xhigh → max`. These labels do not imply that a reviewer supports equivalent command arguments.

Use scope to estimate cost, then let exposure and boundary risk determine depth. A ten-line authorization change can deserve more effort than a thousand-line mechanical refactor.

| Target | Starting tier |
|---|---|
| Narrow change with no altered trust boundary and strong applicable evidence | `low` |
| One exposed entry point or one security control in a known architecture | `medium` |
| Dependency/provenance or configuration change without a higher-risk boundary; otherwise unmatched security-relevant scope | `medium` |
| Authorization/tenant boundary, sensitive data flow, privileged CI/deployment path, or several connected services | `high` |
| Broad repository audit, novel security architecture, or specialist protocol/cryptography | `high`, with explicit scope and specialist gaps |

Apply each distinct risk modifier once, raising one rung:

- Public or privileged exposure with serious consequences: one combined exposure modifier.
- Missing applicable security tests or required context: one combined evidence-gap modifier.
- Unattended agent authorship.
- Evidence of a previous missed finding on this target.
- Automatic release on merge or difficult rollback: one combined delivery modifier.

Do not count a fact again if it already determined the starting tier. For example, a privileged deployment path that establishes a `high` start does not also earn the privileged-exposure modifier unless additional consequential exposure is established.

Apply each justified reduction once, lowering one rung: evidence that proves the actual security property being reviewed; a scope restricted to verified fixups. Do not reuse evidence that already reduced the starting tier or count the same evidence under both reductions. Generic test coverage and mechanical repetition do not prove a boundary safe.

Calculate starting rung plus unique risks minus unique reductions, clamp to `low`–`max`, and enforce a `medium` floor for changed security boundaries. `xhigh` and `max` require a concrete costly-miss reason, such as consequential public access, tenant isolation, sensitive data exposure, or an irreversible privileged release. Otherwise cap at `high`. State counted modifiers and any floor/cap once. Missing required evidence or specialist coverage remains a gap even at `max`; extra effort does not make an incompatible reviewer suitable.

For large targets, propose bounded passes by entry point, trust boundary, or subsystem. Preserve end-to-end data-flow coverage across the splits. Report **"too broad — scope or split first"** when the available route cannot cover the target credibly.

Effort tiers are planning labels, not vulnerability severities or universal command arguments. Map the chosen tier to verified route controls. Without effort controls, express it through scope, requested dimensions, and justified independent passes. Higher supported effort is warranted by the consequence of a miss, not line count alone.

Recommend billed routes only when available and the user has expressed willingness to pay. Identify proposed external source uploads, live testing, or comment posting from the route's actual behavior, so its invocation and authorization requirements are concrete.

Completion criterion: starting tier, applied modifiers, final tier, and the route's actual effort mapping are explicit.

## Step 6 — Pair only for complementary coverage

Add a second route only when it covers a requested security dimension the first structurally lacks: for example, contextual authorization review plus dependency analysis, or design threat modeling plus deployment configuration review. Rank by coverage, runtime fit, evidence requirements, isolation, and cost rather than publisher.

Account for built-in specialist passes before adding another reviewer. Label remediation, incident response, and hardening workflows as follow-ups rather than reviews. If a suspected active incident dominates the request, recommend the appropriate installed response route and explain the remaining assessment scope.

Completion criterion: every proposed pass has a distinct required question, and any follow-up is labeled separately.

## Step 7 — Report and stop

Output, in this order:

1. **Verdict** — discovered route plus effort, complementary pair, no review needed, scope/split first, or no suitable installed reviewer.
2. **Target and effort** — exact scope, measurements where applicable, starting tier, modifiers, final tier, and supported controls.
3. **Why** — decisive assets, entry points, boundaries, exposure, and evidence; state assumptions and missing dimensions.
4. **What you're giving up** — strongest relevant losing candidate and its actual advantage, or that none exists. Distinguish coverage disadvantages from unmet prerequisites; label a stronger route conditional when willingness to satisfy its prerequisites is not established.
5. **Invocation** — verified commands or supported explicit skill invocation, in order, with target, context paths, and prerequisites. Mark `[user]` for user-only, billed, or authorization-dependent steps; `[agent]` for callable steps within established authorization. If syntax or availability is uncertain, report that limit instead of inventing a command.
6. **Discovery** — selected source path or verified executable/tool metadata, serious alternatives, inactive installations, cache path, last expanded-scan time and incremental-check scope, and unreadable or unsearched locations.

**Stop after the recommendation.** Discovery and routing are not a security assessment: report coverage and proposed execution without producing findings, applying fixes, or claiming the target is secure.

## Keeping this honest

Validate the inventory on each non-skipped use and refresh discovery under Step 3’s conditions. Derive capabilities and invocation syntax from installed instructions and live harness metadata. Compatible standalone skills participate equally with registered commands; cached examples and remembered behavior do not establish availability. Keep recommendations tied to the actual target and security question.
