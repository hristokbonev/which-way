# which-framework evals

Regression suite for `skills/which-framework`. Not published: `package.json`'s `files` list leaves out `evals/`.

## Files

- `evals.json`: 10 scenarios, each with a prompt, the expected output and assertions. Scenario 10 has `should_trigger: false` and checks triggering only, not behaviour.
- `trigger-eval-set.json`: 20 queries labelled `should_trigger`, used to check the skill's description.

## Environment

There are no fixtures. The scenarios run against the machine's real installed skills and reach their verdicts from what is installed. They assume:

- `tdd` and `test-driven-development` (scenario 5);
- `diagnosing-bugs` and `debugging-and-error-recovery` (scenario 6);
- a user-only `to-tickets` plus `setup-matt-pocock-skills` (scenario 7);
- `security-and-hardening` with its `security-checklist.md` reference missing (scenario 2);
- no Terraform skill and no `terraform` or `terragrunt` on PATH (scenario 8).

A different skill set changes the expected verdicts, so adjust the assertions before running elsewhere.

## Behavior evals

1. Copy the `SKILL.md` under test to a neutral path, for example `skill-a/which-framework/SKILL.md` for the baseline and `skill-b/...` for the candidate, so runs are blind to the version.
2. For each scenario and run, create `runs/<version>-e<id>-r<k>/{work,outputs}`, with `work/` empty. Give a fresh subagent:
   - the skill path, to be read with Read and not loaded through the Skill tool;
   - `work/` as its project;
   - the prompt, plus "the user is not available; state any question and assumption and continue";
   - instructions to write `outputs/report.md` (the verbatim answer) and `outputs/process.md` (every command run and file read) **with a shell heredoc**, because the Write tool refuses report files from subagents.
3. Grade `report.md` and `process.md` against the assertions.

Use 3 runs each for scenarios 2–6, which are judgement-heavy, and 1 run each for 1, 7, 8 and 9. The harness allows 20 concurrent subagents, so launch in batches.

## Results

| Round | Runs | Assertion pass rate |
|---|---|---|
| Tier 1 trim vs HEAD (2026-10-04) | 19 + 19 | 83/88 for both versions, with identical failures |
| Tier 2 trim, scenarios 2 and 4 | 6 | 27/27 |

Known failures in every version: scenario 8 routes to `source-driven-development` instead of "no suitable local route found"; scenario 6 runs often don't mark the route as conditional; when a mandatory reference is missing, scenario 2 runs sometimes run a filesystem-wide `find`.
