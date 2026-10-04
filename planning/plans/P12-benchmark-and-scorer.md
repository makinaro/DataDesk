# P12 Plan: DS-Bench & Scorer

| Field     | Value                                                                                                                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P12 of P10–P23 (roadmap §10)                                                                                                                                                                                                                                                                                                                             |
| Milestone | M1 Foundation                                                                                                                                                                                                                                                                                                                                            |
| Objective | Be able to measure every metric in roadmap §7 before the features exist                                                                                                                                                                                                                                                                                  |
| Entry     | **P11 closed** (signed off and merged: schemas in `src/shared/ds/`; ADR-02 correlation ids, P11 Q-D1); P10-07 landed (CLAUDE.md rule 6 covers `bench/answer-keys/`); **plus the maintainer's explicit approval of this phase's planned API spend (D-034)**. The reference env is pinned to the compute host's versions when P13 hands them over (P13-08) |
| Spend     | Planned **≈ $13**: a reduced baseline of 5 dev tasks per provider (≈ $11, enough outputs for the pilot) and the 10-item judge pilot (≈ $2). Every pass is also hard-stopped at **$15 per provider, judge included** (D-034)                                                                                                                              |
| Size      | L (8 sessions)                                                                                                                                                                                                                                                                                                                                           |
| Branch    | `phase-12-bench`                                                                                                                                                                                                                                                                                                                                         |
| Inputs    | `docs/ds/02-metrics.md`, `docs/ds/05-benchmark.md` (P10) · ADR-04, ADR-10, ADR-11 (P11) · P10 Q19–Q23, Q33–Q36, Q44 · P11 Q12                                                                                                                                                                                                                            |
| Outputs   | D12-1 `bench/generator/` · D12-2 `bench/public/` fetcher · D12-3 `bench/tasks/` (dev only) · D12-4 `bench/scorer/` · D12-5 `bench/runner/` · D12-6 `bench/rubric/v1.md` + judge stage · D12-7 baseline results `bench/results/p12-baseline/` · D12-8 CI re-score job                                                                                     |
| Status    | Audited (3 rounds, `P12-audit.md`); all findings fixed; maintainer defaults pending (Q-E, Q-J, Q-K); awaiting sign-off                                                                                                                                                                                                                                   |

**Rule for the phase:** build the measuring stick, not the thing measured. No agent features and
no bench-only prompt changes; the only agent run is the partial baseline of today's SQL analyst.

**Pipeline (one owner per stage):**

1. **Runner** (paid, hard-blocked): launches the app, writes the **bench event log**, copies the
   finished run into an immutable run directory, writes `manifest.json` (file hashes) once and
   never again. The runner also copies P13's
   `bench/results/escape/<build-kind>-<sha>.json` for the run's exact SHA and build kind, and
   refuses the run if it is missing.
2. **Judge stage** (paid, runner-owned, same hard block and ledger): reads the frozen run
   directory and writes `rubric.json` plus its own `rubric.manifest.json` (hash), so no file has
   two writers. Its Anthropic key comes from the shell env through the runner's explicit env
   list (P11 Q12); each judge call reserves $0.25.
3. **Scorer** (offline, no network): reads the run directory, including `rubric.json` as an
   input, and writes `score.json` and `summary.md`.
4. **CI** re-runs the scorer on committed dev run directories and checks `rubric.json` against
   its schema and manifest hash only; an LLM output can't be re-scored.

**Trust model (P12 audit Q-J5):** CI re-scoring proves the scorer is deterministic, not that a
run happened; a hand-made journal would pass it. The control for committed dev runs is the
human peer review, which sees the cost record and the run's event log. Official gate runs for
P16 and P22 are run by a maintainer.

**Terms used in this plan:**

- **Score-comparable runs:** same key-set version, task-set version, resolved model snapshot ids
  and run count. Diffs and D-038's drop rule compare score-comparable runs across phases.
- **Identical build:** score-comparable plus the same app commit and the same prompt-and-skill
  hash (SHA-256 over `resources/agent-plugin/**` and the prompt sources, with line endings
  normalised to LF). Used for reproducibility checks only.
- **Reference model:** per ML task, a pipeline and a fixed hyperparameter grid declared in the
  answer key, trained **with the same code-chosen split kind and small-n rule as the agent** (P17 audit); the leak column in the scoring-features dataset is filled as it would be at prediction time (null), so a leaky model can't raise M-07. Originally:
  answer key, trained in the reference env with **the same protocol as the agent** (the D-035
  80/20 split of the registered rows with a fixed seed), scored on the key's held-back rows.
- **Run directory:** `bench/results/<phase>/<run-id>/`, copied before judging and scoring. A copy
  that fails (disk full, crash) leaves the directory marked `incomplete`; it is never scored.
- **Task status:** `scored`, `provider_error`, `app_crash`, `timeout`, `sandbox_killed`,
  `budget_stop` or `refused`. A non-`scored` task counts as a **miss** for accuracy and recall
  metrics (M-01, M-02, M-07, M-08), at its **actual cost** for M-09, and as **unmeasured** for
  safety metrics (M-04, M-06, M-12, M-19): a gate fails if any injection or safety task is
  unmeasured. **Void rule (declared in advance):** if more than 25% of a pass's tasks end in
- **Unmapped metrics under failure statuses:** M-03 excludes the task from both counts; M-05,
  M-16 and M-18 are unmeasured; M-10 counts the elapsed time at the stop. A torn last line in the
  event log after `app_crash` is truncated, as for journals (P11-03).
  `provider_error` or `app_crash`, the pass is void and is re-run whole.

---

## 1. Inherited Decisions and Inputs

| Source                  | What it forces in P12                                                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-07, DS-13            | Synthetic traps plus openly licensed public sets from OpenML, HF and scikit-learn; no pilot                                                                                                                                                                                |
| D-036, P10 Q19          | 20 tasks: 12 synthetic and 8 public; dev 12, holdout 8; **maintainers hold the holdout seeds and task definitions** (hashes committed); holdout-a in P20, holdout-b and a fresh holdout-c in P22; fixed run counts; a task-bootstrap interval; M-19; CI re-scores dev runs |
| P10 Q20                 | Structured key-results block (P11-09 owns the schema, including `issues[]` and `predictions_ref`); acceptable-set tolerances; interval-width rule                                                                                                                          |
| P10 Q22                 | Keys computed by code in a pinned reference env; two reviewers for the public-key script                                                                                                                                                                                   |
| D-034, P10 Q23, Q44     | Paid runs hard-blocked in code; per-contributor approvals; no override flag; contributors' own keys; committed journals re-scored offline                                                                                                                                  |
| D-038, P11 Q12          | The judge is Claude Opus; `same-model` scores can't block; judge spend goes through the runner                                                                                                                                                                             |
| D-041, D-045            | Hard deny rules for paid entry points and answer-key reads; CLAUDE.md rule 6 extended to `bench/answer-keys/` (a P10 deliverable P12 checks)                                                                                                                               |
| CLAUDE.md rule 5        | Every process the runner launches gets an explicitly built env; shell keys never reach the app                                                                                                                                                                             |
| CLAUDE.md testing rules | No real API calls in automated tests; the runner is opt-in and never runs in CI                                                                                                                                                                                            |

## 2. Session Plan

| Session | Work items                     | Output                                                                                 |
| ------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| 1       | P12-01 (reference env), P12-03 | `bench/` skeleton, reference env lockfile (Pyodide's versions), task and bench schemas |
| 2       | P12-01 (traps)                 | 7 dev synthetic tasks with keys; holdout generator handed to a maintainer              |
| 3       | P12-02, P12-04, P12-15         | 8 public tasks with keys, licences and hashes; reference models; golden vectors        |
| 4       | P12-06, P12-12                 | Scorer with its own number extraction, statuses, per-agent breakdown and bootstrap     |
| 5       | P12-07, P12-09                 | Runner with the D-034 hard block, ledger and env allowlist; isolation tests            |
| 6       | P12-10, P12-11, P12-13         | Judge stage with fake-client tests; labelling tool; report                             |
| 7       | P12-05, P12-14, P12-16         | Maintainer generates the holdout and commits hashes; CI re-score job; oracle passes    |
| 8       | P12-08, P12-11 (pilot), audit  | Partial baseline on both providers; pilot calibration; sign-off                        |

## 3. Work Item Breakdown

### P12-01 Trap generator

- [ ] Pinned CPython reference env under `bench/env/` (Q5) with **the compute host's pinned library versions, whichever host P13 chooses** (P13-08), run with `OMP_NUM_THREADS=1` and fixed BLAS threads
- [ ] One generator per trap category (Q2), seeded. **Both splits use the same design:** dev 4 trap tasks × 3 traps + 3 clean controls; holdout 4 trap tasks × 3 traps + 1 clean control; every category appears once in each split (D-036); holdout-c is regenerated to the same design
- [ ] Traps in one task are chosen not to interfere (a compatibility table in `docs/ds/05`)
- [ ] Holdout instances use fresh seeds and **new surface forms** (column names, phrasing, layout)
- [ ] Generated file, column, dataset-card and task ids are **opaque**. A test checks names against category tokens, except the **disclosures a card must carry** (listed in `docs/ds/05`, e.g. that a weight column exists)
- [ ] Each task's answer key is computed from the generator's own ground truth
- [ ] A **decoy-number** provenance fixture (P11 Q4) rides in 2 dev tasks and 1 holdout task; it is scored by M-19, not M-02

### P12-02 Public datasets

- [ ] Fetcher with a pinned URL, SHA-256 and recorded licence per dataset (Q3); nothing fetched at scoring time
- [ ] Each public task's split assignment is recorded in `docs/ds/05`
- [ ] Tasks use seeded resamples **with a perturbed signal**, defined per task type in `docs/ds/05` (ML: label noise and a shifted coefficient; inference: a shifted group mean; forecasting: a changed trend); where the classic dataset has a published value for the question, a check confirms it falls **outside** the key's tolerance
- [ ] Keys label the **genuine issues** in each public dataset (e.g. Adult's `?` markers), so a correct warning isn't a false alarm (M-03)

### P12-03 Task files, answer keys and bench schemas

- [ ] `bench/tasks/<id>.json` for **dev tasks only**: goal text, dataset, question ids, `requires_delegation` (P14 EC14-5), `requires_derived_dataset`, expected parents and the expected row count with tolerance of each required derived dataset (P15 EC15-2, EC15-4; task-set version bump), injection fixtures that include derived column names and descriptions, and the `studyDesign` fields the task declares (entity column, event timestamp column, subgroups, future-known regressors, forecast horizon) (P16–P18), the key-results fields required (P11-09), trap ids, task type, task-set version
- [ ] Dev keys written to `bench/answer-keys/` (git-ignored). **Dev keys are public by construction** (the generator and dev seeds are committed, P12 Q4), so a committed **dev key manifest** (values rounded to declared precision, tolerance, producing machine) is acceptable and is recorded as such in a D-NNN at sign-off; deny rules on `bench/answer-keys/**` are a convenience for dev, and holdout custody is the control (Q-K3)
- [ ] The key holds back the **test rows and the forecast horizon**; the registered task dataset excludes them, and a separate **scoring-features dataset** (no labels, a row-id column) is registered too. From P17, the agent's `predict(model_id, scoring_dataset_id)` writes predictions as an artifact referenced by `predictions_ref` in the key-results block; before P17, M-07 and M-08 are `n/a`
- [ ] The task text forbids using the scoring-features dataset for anything but `predict`; a method check flags any read of it outside `predict` (transductive leakage)
- [ ] Bench-only zod schemas in `bench/schemas/`: event log, ledger entry, status enum, profile manifest, run manifest, `split.json`; it **re-exports** the shared Score and Rubric Score schemas from `src/shared/ds/` instead of redefining them

### P12-04 Reference models and baselines

- [ ] Reference model metric per ML task (the reference protocol in terms) and seasonal-naive MASE per forecast task, computed in the reference env on the held-back rows

### P12-05 Dev / holdout custody

- [ ] `bench/split.json` committed with **dev ids and salted holdout commitments only**: each holdout artifact's commitment is SHA-256 over a 256-bit secret salt held by maintainers plus the artifact, so seeds and small keys can't be enumerated (Q-K4)
- [ ] **A maintainer holds the holdout generator's surface-form code, seeds, task files and keys outside the repo**; the runner accepts `--tasks holdout-a|holdout-b|holdout-c` only with a maintainer-supplied folder whose hashes match `split.json`
- [ ] The runner **copies** holdout datasets into the run profile, so they are never registered in place; the isolation tests include the holdout folder
- [ ] Holdout results are committed **aggregate-only**: no per-task values, judge rationales or agent prose
- [ ] Fresh profiles used for holdout runs are deleted after scoring

### P12-06 Scorer

- [ ] Reads only the run directory: the journal (hash chain verified and anchored, P11-03), the key-results block, the outputs, the bench event log, `rubric.json` and the predictions artifact
- [ ] Clustered traps: M-02 is computed at trap level with a **cluster bootstrap over tasks**, and the report notes the small number of traps per category
- [ ] **Its own number extraction** over the rendered answer and report, implementing P11-04's tokenizer specification independently in `bench/scorer/`, for M-04 and M-19; M-06 relies on the app's lock record, and the report says so
- [ ] **M-01 scoring (P14 audit):** a numeric answer is scored on the value **resolved by code from its citation** in the journal; an uncited or mismatched numeric entry counts as unanswered. Categorical and yes/no answers come from enum fields in the key-results block. Oracle passes (P12-16) write the solver's outputs as journal output entries, so their citations resolve
- [ ] Computes M-01..M-19 and PA-01..PA-11 where their source exists (§5 EC12-2), with the status rules in terms
- [ ] **Task bootstrap:** resample tasks with replacement, keeping all runs of a task together, then take the median over runs; 2,000 resamples; a metric with fewer than 5 tasks reports "n too small" instead of an interval
- [ ] Trap detection by structured fields only (Q6); `issues[]` capped at 12 entries; M-02 is always reported beside M-03 (with a note that 3 dev controls give M-03 little true-negative mass)
- [ ] M-12 reads **attempted** actions from the event log; each injection fixture carries a **"measurable in this run" flag**, true when every tool its predicate names is in the run's tool list. **The data-value and column-name fixtures are dev fixtures**; the card and fake-correction fixtures are holdout fixtures. A gate needs at least one measurable fixture per payload channel present in its split, otherwise M-12 is `n/a` and **the gate fails** (Q-K7)
- [ ] Runs before P14 have no journal or key-results block; journal-based metrics are `n/a before P14`

### P12-07 Runner

- [ ] Drives the **bench build flavour** of the app (keeps the orchestrator hook and the bench-mode writer; the default build strips both, asserted by the packaged smoke) per Q1, with an **explicit env allowlist**: a test asserts the launched env's key set **equals** a named list (so `NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE` or `ANTHROPIC_BASE_URL` from the shell can't reach the app)
- [ ] A **fresh profile per run**: the encrypted key file **and Chromium's `Local State`** (which holds the DPAPI-wrapped key; verify with docs-researcher against Electron 44.5.1) are copied in; `maxBudgetUsd` is pinned to 1 in the profile; the profile manifest hash goes into `score.json`; HF MCP tools are off in bench mode
- [ ] **D-034 hard block:** approvals are **maintainer-signed annotated tags** `spend/<phase>/<contributor>/<amount>` on the upstream repository, verified against maintainer public keys committed under `bench/spend/maintainers/` (CODEOWNERS-protected). This works with a single maintainer and can't be forged by a commit's author field; it supersedes D-034's "remote phase branch" source through a D-NNN at sign-off (Q-K1). The runner requires the typed approval id interactively; refuses agent sessions (marker variable verified by docs-researcher) and non-TTY runs; **no override flag**. The GitHub and git calls go through an injected client, so tests make no network calls. The typed id is a friction step, not proof of a human (D-041 accepts best effort)
- [ ] **Reservation per task:** $1.50 before P14 (the pinned `maxBudgetUsd` plus 50% for SDK overshoot; on both providers the bound is P14's analytic overshoot bound (ADR-12)), then the P14 meter's cap plus its stated maximum overshoot. **Per-pass hard stop at $15 per provider, judge reservations included** (D-034); refuses a task the remaining approval or pass budget can't cover
- [ ] **Ledger:** a local `bench/spend/<contributor>.<phase>.jsonl` with reserve and settle entries and a lock file; a crashed task counts in full. Every committed run directory records its actual cost, and **CI sums the committed costs per contributor and phase and fails above the approval**, so the cap holds across clones for committed runs (Q-J2)
- [ ] `--runs <n>` mode; the gate value is the **median of the run-level metric** across runs
- [ ] `--sequence <n>` mode (for P20): carries **only the lesson store** across the runs of one declared sequence, with each lesson's provenance recorded; every other run uses a fresh profile. Only a declared P20 sequence may apply dev-learned lessons to a holdout-a "after" run (Q-K5)
- [ ] Writes the **bench event log** from main's `AgentEvent` bus (by a bench-mode writer in main), including tool calls the scope hook or `canUseTool` denied (verify that denials appear on the bus; if not, add them)

### P12-08 Baseline

- [ ] Today's SQL analyst on **5 dev tasks per provider** (enough outputs for the 10-item pilot): cost, wall clock, M-12 where measurable, and the metrics the event log supports. The judge's rubric scores are kept **local and marked uncalibrated**, never committed before P16's calibration (EC12-5). The full "before" numbers come from P14's first gate run (P10 Q21)

### P12-09 Isolation

- [ ] The agent's **data** files are exactly the registered datasets (the app's own resources aside). Tests prove `register_dataset` and `run_sql` can't reach `bench/answer-keys/`, `bench/results/`, the reference env or the holdout folder, including via 8.3 and junction paths
- [ ] The coding-agent private-path guard covers `bench/answer-keys/` but is a convenience; **holdout custody is the only control against overfitting** (R-08)
- [ ] `.claude/settings.json` deny rules: paid entry points (`npm run bench`, `npm run-script bench`, `node bench/runner`, `npx tsx bench/`, `uv run` under `bench/`) and reads of `bench/answer-keys/**` (D-041). Textual rules are best effort; the runner's own refusals are the control
- [ ] Check that CLAUDE.md rule 6 includes `bench/answer-keys/` (P10-07); if not, block P12 until it does

### P12-10 Evaluation model (judge stage)

- [ ] Rubric v1 with anchors, judge prompt, zod-validated `rubric.json`; the single Claude Opus model, recorded by its **resolved snapshot id** (D-045), checked by docs-researcher (including temperature support); a fake judge client in tests
- [ ] Manipulation guard (Q10) measured against a paired score of the same answer without the payload
- [ ] A fixture plants "quote the expected values" in the analyst's answer; the check fails if any key value appears in a rationale

### P12-11 Calibration (pilot)

- [ ] Tooling for blind double labelling and the agreement report (± 1 and weighted κ); pilot on baseline outputs (Q11)

### P12-12 Per-agent breakdown

- [ ] Role attribution from the journal's correlation ids (P11-02); one table per role in the score report

### P12-13 Score report

- [ ] `score.json` plus `summary.md` per run directory, rendered with `md2html`; agent prose is never embedded; diff against the previous **score-comparable** run

### P12-14 CI re-score job

- [ ] CI installs `uv` and the reference env, fetches the public sets (network allowed in the fetch step only), regenerates dev keys and compares them with the key manifest within tolerance, then re-scores every committed dev run directory offline; it also sums committed costs per contributor and phase (P12-07)

### P12-15 Golden vectors (added by the P12 audit)

- [ ] Reference-env values for every metric main computes (ROC-AUC, PR-AUC, Brier, RMSE, MASE, bootstrap) on fixed inputs, committed for P11-16's tests

### P12-16 Oracle passes (added by the P12 audit)

- [ ] An **independent solver** per task computes the answers from the task's data with a different code path from the generator (e.g. statsmodels or scikit-learn where the generator used closed-form ground truth) and **never reads the key**; scored by the real scorer, **every question must fall within tolerance**. Dev runs in CI; the holdout is run by the maintainer other than the generator's author (there are two maintainers, maintainer answer to Q-K2)

## 4. Deliverable Map

| Deliverable | File path                                                                                          | Produced by        | Satisfies      |
| ----------- | -------------------------------------------------------------------------------------------------- | ------------------ | -------------- |
| D12-1       | `bench/generator/`, `bench/env/`                                                                   | P12-01             | EC12-2         |
| D12-2       | `bench/public/`                                                                                    | P12-02             | EC12-2         |
| D12-3       | `bench/tasks/`, `bench/split.json`, key manifest, `bench/schemas/`                                 | P12-03, 05         | EC12-2, EC12-6 |
| D12-4       | `bench/scorer/` + `tests/bench/`                                                                   | P12-06, 12, 13, 15 | EC12-1         |
| D12-5       | `bench/runner/`, `bench/spend/`                                                                    | P12-07             | EC12-3, EC12-7 |
| D12-6       | `bench/rubric/v1.md`, `bench/judge/`                                                               | P12-10, 11         | EC12-5         |
| D12-7       | `bench/results/p12-baseline/`                                                                      | P12-08             | EC12-3         |
| D12-8       | `.github/workflows/` re-score job, oracle pass                                                     | P12-14, 16         | EC12-1, EC12-8 |
| D12-9       | `src/main/bench/` bench-mode event writer and denial events (bench build flavour only), with tests | P12-07             | EC12-3         |

## 5. Exit Checklist

| EC / DoD | Check                                                                                                                                                                                                                                    | Evidence                      | State |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----- |
| EC12-1   | The scorer reproduces hand-checked scores on 3 fixture runs, and CI re-scores a committed fixture run                                                                                                                                    | `tests/bench/scorer.test.ts`  | Open  |
| EC12-2   | Every metric has a scorer function with fixture tests over the P11 schemas. Data arrives later for: M-04, M-19 (P14); M-06, M-07, M-13 partial (P17); M-08 (P18); M-05 (P21); M-11 (P13); M-13, M-14 (P20); PA metrics by role (P15–P19) | scorer unit tests             | Open  |
| EC12-3   | Partial baseline recorded for both providers, every task with a coded status                                                                                                                                                             | `bench/results/p12-baseline/` | Open  |
| EC12-4   | The agent can't read answer keys, results, the reference env or the holdout folder                                                                                                                                                       | isolation test                | Open  |
| EC12-5   | Calibration tooling works; pilot agreement reported; no judge score is committed before the P16 calibration                                                                                                                              | agreement report              | Open  |
| EC12-6   | Holdout artifacts are committed only as salted commitments; a maintainer holding the salts runs the custody check (no committed file reproduces a commitment) at P12 exit and before P20 and P22                                         | custody check                 | Open  |
| EC12-7   | The runner refuses: no approval, an approval not authored by a maintainer on upstream `main`, a non-TTY run, an agent session, an amount the remaining budget can't cover                                                                | runner tests                  | Open  |
| EC12-8   | The independent solver puts every question within tolerance on dev (CI) and on the holdout (maintainer-run)                                                                                                                              | oracle report                 | Open  |
| DoD 1–8  | As roadmap §17 (DoD-4: M-12 on the baseline run where measurable; M-11 from P13)                                                                                                                                                         | —                             | Open  |

## 6. Phase Risks

| Risk                                                     | Mitigation                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Answer keys differ between contributors' machines (R-19) | Pinned env, single-threaded BLAS, comparison within tolerance, producing machine recorded |
| A trap is ambiguous, so "detection" is subjective        | Detection only via structured fields with a fixed category enum and a named subject (Q6)  |
| Overfitting to dev (R-08)                                | Holdout held outside the repo by maintainers; same design, fresh seeds and surface forms  |
| Public datasets are memorised by the models              | Perturbed resamples checked against published values; HF tools off in bench mode          |
| Licence surprises in public data                         | Licence recorded per dataset; anything unclear is excluded                                |
| Spend outside approvals                                  | Upstream-only approvals with authorship check; reservations; CI sums committed costs      |
| Infrastructure failures fail a gate                      | Pre-declared void rule                                                                    |

## 7. Hand-off to P13 and P14

- The scorer and runner are used by every phase gate from P14
- Score schema and summary format are reused by P22's results report
- Golden vectors for P11-16's metric code
- P14's first gate run supplies the full "before" numbers for re-baselining targets (P10 Q21)
