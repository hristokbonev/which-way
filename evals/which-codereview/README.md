# which-codereview evals

Regression suite for `skills/which-codereview`. Not published (`package.json` `files` excludes `evals/`).

## Files

- `evals.json` — 12 behavior scenarios: prompt, fixture name, assertions.
- `build_fixtures.py [out-dir]` — builds one git repo per scenario (default `./fixtures`). Every fixture wires `npm test`/`npm run build` to touch `.tests-ran`/`.build-ran`, so a router that runs them is detectable.
- `check_state.sh <iteration-dir> <fixtures-dir> [start-marker]` — programmatic checks per run: tests/builds not run, `HEAD` and working-tree status unchanged, no writes to `~/.cache/which-codereview`.
- `routing-eval-set.json` / `run_routing.py [runs] [set] [out]` — routing check across the real installed skill set. Each query is labelled with the skill it should reach (`which-codereview`, `which-security-review`, `which-framework`, `reviewer` = any non-router, `other`).

## Behavior evals

1. `python3 build_fixtures.py /tmp/wcr/fixtures`
2. For each scenario and run, copy the fixture to `<iteration>/eval-<id>-<fixture>/with_skill/run-<k>/repo`, then give a subagent:
   - the skill path (`skills/which-codereview/SKILL.md`),
   - the repo path as its working project,
   - the scenario prompt, with "the user is not available; state any question and assumption and continue",
   - instructions to write `outputs/report.md` (verbatim answer) and `outputs/commands.md` (every command, skill and agent used).
3. Run `check_state.sh`, then grade `report.md`/`commands.md` against the assertions (skill-creator `agents/grader.md` format, one `grading.json` per run).
4. Aggregate and view with skill-creator's `scripts.aggregate_benchmark` and `eval-viewer/generate_review.py`.

Use 3 runs for the judgment-heavy scenarios (mechanical-rename, auth-small, agent-auth-no-tests, fixup-rereview, legal-plus-code, pr-adds-skill) and 1 for the rule-following ones.

## Routing eval

The installed `which-codereview` must be the repo version (e.g. a symlink from the skills root to `skills/which-codereview`). skill-creator's `run_eval.py` does not work here: its temporary slash command loses to installed skills of the same name and it only counts hits on its own copy.

```sh
ROUTING_CWD=$(mktemp -d) python3 run_routing.py 3
```

## Results

| Round | Runs | Assertion pass rate |
|---|---|---|
| 1 (vs previous version: 81%) | 10 | 100% |
| 2 | 22 | 97% |
| 3 (4 scenarios) | 12 | 99% |
| 4 (4 scenarios, after fresh review) | 12 | 96% (the 3 misses were a too-strict assertion, since loosened) |
| 5 (2 new scenarios + 5-scenario regression, v0.2.1) | 11 | 10/11 runs perfect |

Routing: 65/66 runs reached the expected skill.
