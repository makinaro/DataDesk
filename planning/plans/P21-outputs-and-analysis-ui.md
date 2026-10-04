# P21 Plan: Reproducible Outputs & Analysis UI

| Field     | Value                                                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P21 of P10–P23 (roadmap §10)                                                                                                                                                                         |
| Milestone | v0.3 Learning                                                                                                                                                                                        |
| Objective | Notebooks that re-run to the same numbers, reports that show their method, and a UI that shows the whole analysis                                                                                    |
| Entry     | P20 closed (one phase at a time, roadmap §18.3); **the maintainer's spend approval for this phase before the gate session (9)**, as a maintainer-signed tag (P12 Q-K1; D-034's amount rules)         |
| Spend     | Planned **≈ $28**: one dev gate run per provider (D-036 fixed runs) with the judge floor (D-038); notebook re-runs run locally in the sandbox at no API cost                                         |
| Size      | L (9 sessions, re-baselined in round 3)                                                                                                                                                              |
| Branch    | `phase-21-outputs`                                                                                                                                                                                   |
| Inputs    | P10 Q3, Q8, Q11 · P12 Q-E6 · P13 Q6 (audited) · P14 Q2, Q5, Q7, Q8, Q10, Q-L5 · P15 (lineage) · P16 (`studyDesign`) · P17 Q5, Q-V10, Q-Z5 · P18 (refit, fan) · P19 Q6 · P20 (`lessons_used`)         |
| Outputs   | D21-1 `ReplayPlan` builder and notebook exporter · D21-2 sandbox re-run harness · D21-3 report v2 · D21-4 analysis view · D21-5 compare mode · D21-6 kernel replay and model retraining (controller) |
| Status    | Audited (3 rounds, `P21-audit.md`); maintainer defaults pending (Q-AD, Q-AJ, Q-AM)                                                                                                                   |

**Rule for the phase:** outputs and presentation of what the journal already holds, plus the
replay and retraining deferred here from P14 and P17. No new analysis method.

**One builder, three consumers (P21 audit, A1; round 2):** a code-owned
**`ReplayPlan(journal, splitEpoch)`** in `src/main/analysis/replay/` (exact sequence, restart
boundaries, seeds, snapshot content hashes, and code-owned steps) feeds (a) the notebook
exporter, a pure serialiser in `src/main/export/`; (b) kernel replay on Continue; and (c) model
retraining. The controller owns (b) and (c). **The re-run harness consumes only the serialised
`.ipynb`**, so M-05 tests what users actually get.

**Where re-runs happen (Q-AD1, pending maintainer):** M-05 re-runs execute **in a fresh
compute-sandbox kernel** (P12 Q-E6), through a headless entry point into the compute host built
here (P13 moved it to P21). The entry is **removed at compile time** from the default build (a
build-time define with dead-code elimination, as P12's bench hooks); a test asserts the
production bundle lacks the symbol; the escape suite runs on both flavours; task-manifest grants
are restricted to `realpath`-canonical paths under `bench/` (reparse points refused), never taken
from a notebook's parameter cell; for **holdout** re-runs, the grant root is the runner's holdout copy inside the run profile, maintainer-run before the profile is deleted (P22 audit). `bench/env` never runs notebooks. **FR-15 stays as written
until the D-NNN lands.** Evidence for the user path (Q-AJ1, Q-AM1): (a) a **CI job runs fixture
notebooks in CPython**, installing from the emitted `requirements.txt` with the network on, then
running with the network off (no agent code runs in CI); and (b) **M-05b**: the gate-run
notebooks are re-run in a **no-network, empty-environment CPython child** (P12 Q-E6's alternative,
using P13's pinned CPython on the CI image) under tolerance tiers, **reported** beside M-05 and
committed to `bench/results/p21/m05b.json`.

**Same build, same bits (Q-AJ3, round 3):** the harness re-runs in the same sandbox build that
produced the journal, with a **fixed `PYTHONHASHSEED`** in both the analysis kernel and the re-run
kernel (docs-researcher confirms how Pyodide sets it), so M-05 requires **exact equality**:
integers and strings exactly, floats with `|a−b| ≤ 1e-12·max(|a|,|b|)`, NaN equal to NaN; wall-clock
values are not key results. Each run records the sandbox build and package hash, and a different
hash gives the status `env_mismatch`. Tolerance tiers apply only to M-05b.

**Terms:** _key result_ = a cited output in the key-results block, or a code-owned **recomputed**
result (test metrics, nested-CV estimate, backtest metrics, refit forecast); split membership is
**recomputed** from the split spec and seed and compared with the exported file, and a copied
file is never a key result; _completed run_ = a gate-pass analysis that reached a full report
(partial reports are listed, not counted).

---

## 1. Inherited Decisions and Inputs

| Source                   | What it forces in P21                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P10 Q3, Q11              | Teaching notebooks: a template library per step type, journal code, one labelled analyst cell; an acceptance test that every code cell has a preceding template cell; Altair charts. **Amended by D-NNN (Q-AM3):** agent loads are rewritten to the `load` shim, and the analyst cell is plain text without provenance marks |
| P13 Q6 (audited), P14 Q2 | Exact-sequence export with per-cell seeds; export safety decided by AST checks (below), not cell status; interrupted or killed cells become a restart boundary                                                                                                                                                               |
| P12 Q-E6                 | Notebooks are re-run only in the compute sandbox, never in `bench/env`                                                                                                                                                                                                                                                       |
| P14 Q7, Q10, Q-L5        | Provenance marks; key-results block; PA-09's report-sections half is gated here                                                                                                                                                                                                                                              |
| P14 (audited)            | Main is the single artifact writer, so main builds the PDF's HTML (amends D-016 by a D-NNN)                                                                                                                                                                                                                                  |
| P17 Q5, Q-V10, Q-Z5; P18 | Code-generated model cards; retraining moved here; nested-CV models and forecast refits are code-owned                                                                                                                                                                                                                       |
| P19 Q6, P20              | Limitations rendered by code; `lessons_used` shown                                                                                                                                                                                                                                                                           |

## 2. Session Plan

| Session | Work items     | Output                                                                                    |
| ------- | -------------- | ----------------------------------------------------------------------------------------- |
| 1–2     | P21-01         | `ReplayPlan`, template library, safe exporter, Markdown generator; docs-researcher checks |
| 3       | P21-02         | Headless sandbox entry, re-run harness, M-05b child                                       |
| 4       | P21-06         | Kernel replay and model retraining in the controller                                      |
| 5       | P21-03         | Report v2 assembled by code, PDF by main                                                  |
| 6       | P21-04, P21-05 | Analysis view; compare mode                                                               |
| 7–8     | tests          | Safety, e2e, parity                                                                       |
| 9       | gate, audit    | Gate run (paid); summary                                                                  |

## 3. Work Item Breakdown

### P21-01 `ReplayPlan` and notebook exporter

- [ ] `ReplayPlan(journal, splitEpoch)` with a sequence cut-off at the last committed entry, so a running analysis exports consistently
- [ ] `.ipynb` (and optional `.py`) from the plan (Q1–Q3): a parameters cell (paths as relative placeholders). **Row identity (Q-AM2):** snapshots carry a code-assigned **`__row_id` from the original ingestion order** (DuckDB with insertion order preserved and `threads=1`), written by the snapshot writer (§12.3 amended); the `load` shim **drops it before any frame reaches the kernel**, so row order and features don't change; the split record (P17) is defined in `__row_id`s; the expected hash is over rows in `__row_id` order; a leakage fixture checks `__row_id` never reaches a model. `requirements.txt` with exact versions **and hashes** (`--require-hashes`) generated from **`resources/compute/pyodide.lock.json`**, with a CI check that the sandbox pins and that lock agree; bundling data is **dropped from v1.0**
- [ ] **Cell metadata:** every emitted cell carries `metadata.datadesk.{executionId, resultIds[], restartBefore}`, and the scorer maps cited outputs through it; a restart boundary becomes a generated, template-allowlisted **reset cell**; a test checks that a restart boundary changes a result
- [ ] **Data loading (Q-AJ2):** agent loading code is rewritten into a code-owned **`load(<dataset_id>)` shim** emitted in both environments: in the sandbox it reads the granted snapshot whose hash the parameter cell expects; in a user's Python it re-creates the data (DuckDB `select` cells included) and checks the hash. Chart cells are skipped by the harness (charts aren't key results)
- [ ] **Code-owned steps** are emitted as generated cells: the split recomputed from its spec and seed and compared with the exported membership file (`__row_id`s); test-scoring, nested-CV and backtest templates driven from the journalled specs; the refit from the `selection` record. A **metric parity test** compares main's TypeScript metric with the Python template on fixtures for **every** metric (AUC ties, log-loss clipping, MASE scaling and the rest)
- [ ] **Export safety (Q-AD3, round 2, Q-AJ5, round 3 Q-AM4):** the allowlists live in a committed, enumerated data file (`src/main/export/allowlist.json`); **string-literal arguments of dispatching APIs** (`agg`, `aggregate`, `apply`, `transform`, `pipe`, `plot(backend=)`, `set_option`, `option_context`, `methodcaller`, `attrgetter`, `query`, `eval`) are checked against the name allowlist, and a non-literal string in those positions demotes the cell; a handler that catches `OSError` or a subclass, a bare `except` or `BaseException` demotes the cell; a **global allowlist of attribute and method names** (not per library, since receivers can't be typed statically): no `read_*`, `to_*`, `save`, `load`, `fetch_*`, file-based `from_*` or `*clipboard*`, and `np.load` never; an **allowlist of builtins** (banning `open`, `eval`, `exec`, `compile`, `__import__`, `getattr`, `setattr`, `vars`, `globals`, `breakpoint`, `input`) and of exact submodules; dunder access banned; a cell whose `try` handler catches `Exception` or wider around a call outside the allowlist is demoted; I/O only through the generated `load` shim; a cell that fails the check, that failed with an OS or I/O error class, or in which main saw a denial attempt, is exported **commented out** under a warning (an NFR-15 exception, recorded by D-NNN); pickle loads are never emitted; the check runs in P13's parse kernel. **Generated cells** are checked against a separate, enumerated **template allowlist** (seed lines included). Every example in the round-2 audit (remote `read_csv`, `read_clipboard`, `to_csv` to a startup folder, `fetch_openml`, a remote Altair URL) is an exfiltration fixture
- [ ] Every name, path and SQL string is written into generated cells as a `repr`-encoded literal; every emitted SQL string is re-checked with the in-app single-`SELECT` guard (`extractStatements`), refusing `COPY` and `ATTACH`; **Markdown cells are generated by code** and every untrusted string in them is **HTML-entity-escaped** (`&`, `<`, `>`, plus Markdown link and image syntax); agent prose (the analyst cell) is emitted in a `<pre>` block with `&<>` entity-escaped, so no fence can be closed and no raw `<img>` renders; fixtures with a backtick run, a raw `<img>` and a remote image; outputs are exported **only on opt-in**, `text/plain` only, listed in the export dialog; chart cells rebuild charts from re-run data
- [ ] DuckDB cells in user notebooks run with external access off, an allowed-directories list, autoinstall off, `autoload_known_extensions=false`, `lock_configuration=true` and `threads=1` (options verified by docs-researcher)
- [ ] Atomic export writes; a full disk gives a clear error

**Done when:** the template acceptance test, a seed fixture (two bootstraps whose draws differ and replay to the same values, P14 Q2) and the safety fixtures (exfiltration, injected names, pickle) pass.

### P21-02 Sandbox re-run harness

- [ ] Re-runs the exported `.ipynb` in a fresh sandbox kernel through the headless entry (above); gate-run snapshots are **pinned** until the harness finishes; results in `bench/results/p21/` with `schemaVersion` and per-notebook statuses (`ok`, `timeout`, `hash_mismatch`, `env_mismatch`, `snapshot_missing`, `sandbox_busy`, `failed`); `sandbox_busy` is retried up to 10 times over at most 10 minutes, then becomes `failed`
- [ ] It only **produces** outputs; the **P12 scorer** computes **M-05** in one unit, **key results** (F-1, round 3): re-run outputs are matched to cited outputs through each cell's `metadata.datadesk` ids; the numerator is matched key results, the denominator every key result of every completed run; **every non-`ok` status counts as a non-match**; outputs flagged by the literal-in-code heuristic **count as non-matches**; a 0/0 pool fails the gate; partial re-runs are reported as a count

**Done when:** EC21-1 is computable on fixtures.

### P21-03 Report v2

- [ ] **Assembled by code** with agent prose slots (headline narrative, interpretation) (Q-AD6); sections (Q5, FR-16, D-044): headline, key results (cited), methods with versions, assumptions and checks, **method findings and their resolution**, results, **model cards**, **sampling disclosure**, **weights used**, **exploratory labels**, **derived-data lineage**, the fan chart and any "refit failed" flag, late `studyDesign` changes, limitations (code-rendered), lessons used, **run status** (a partial report's stop reason and spend), and a **provenance appendix**; empty sections say "n/a"; a report schema bump v1 → v2 with migration (D-045)
- [ ] Only values **produced by main from main-owned records** (versions, dates, footnote numbers, the appendix) are tagged and excluded from the M-04/M-19 tokenizer; agent-supplied values rendered by code stay tokenised, with a test
- [ ] PDF through the existing locked-down print path; **main builds the HTML** (D-NNN amending D-016); agent links rendered as plain text (Q8)

**Done when (P21-03):** a fixture analysis with every source record set renders every section, and the EC21-2 scorer check passes on it.

### P21-04 Analysis view

- [ ] Plan card, cells, derived data, models, findings, lessons used (Q6); **every journal-sourced string** (cell code, stdout, agent prose, lessons, critic text, column names) is rendered as text, outputs `text/plain` only; zod IPC channels with payload caps (NFR-02), with **paginated** execution output so the full local output stays viewable (D-044)

**Done when (P21-04):** e2e opens a saved analysis and shows every panel.

### P21-05 Compare mode

- [ ] Answers and key results **side by side, with the method beside each value**; findings, cost and time per lane; **no benchmark scores or accuracy in the app** (bench reports cover that) and no automatic "disagreement" diff (Q-AD4); each lane uses the same locked `studyDesign`; compare mode **reserves 2 analysis leases up front** through an atomic multi-lease reservation added to P13-11's lease manager, or refuses to start; D-022's "tool calls only" is amended by a D-NNN

**Done when (P21-05):** e2e runs a compare on the fake provider.

### P21-06 Kernel replay and model retraining (controller)

- [ ] **Replay on Continue** (deferred from P14 Q5): replay **starts at the current split epoch**, since the kernel is restarted at `make_split` (the pre-split folder is deleted); it **excludes every evaluation and test step** and asserts no test path is granted (D-035); `replay_started`/`replay_finished` markers, and a start with no finish after a crash marks the kernel dirty on restart; before starting, it refuses with a message if the recorded duration exceeds the remaining active time; a replay output that differs from the journal is journalled as a `replay_divergence` record listing **cell ids only** (no outputs re-enter the model's context or the D-033 budgets) and shown in the UI; an evicted snapshot stops the replay with a clear message (Q-AJ4)
- [ ] **Retraining** (deferred from P17 Q-V10, Q-Z5): `retrain_started`/`retrain_finished` markers; for a model marked "needs retrain", replay the training steps on the **same split epoch's train snapshot** (hash-checked) or refuse, granting no test path; nested-CV models are refitted from their declarative spec; **forecast models are refitted only through P18's controller refit path**, which reads the host-held full history with a hash check and never grants it to an agent kernel; the model index write is atomic; reports and cards never show the old test score beside the retrained model
- [ ] Both queue through P13's lease manager; a new or changed MCP tool (none is planned) needs a scope-table row and the parity test

**Done when (P21-06):** EC21-4's tests pass.

## 4. Deliverable Map

| Deliverable | File path                                                                                                                                                                                                                                                                                                              | Produced by | Satisfies    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------ |
| D21-1       | `src/main/analysis/replay/replayPlan.ts`; `src/main/export/notebook.ts`, `src/main/export/templates/`, `src/main/export/allowlist.json`, the `load` shim; the snapshot writer's `__row_id` (P11/P15 writer, §12.3 amendment) and the P17 split record in `__row_id`s                                                   | P21-01      | EC21-1       |
| D21-2       | `bench/rerun/` (harness and the M-05b CPython child); the headless compute entry (compile-time removed from the default build); the CPython fixture-notebook CI job; the pin-agreement CI check                                                                                                                        | P21-02      | EC21-1       |
| D21-3       | `src/main/artifacts/report/` (assembler, PDF HTML); `resources/agent-plugin/skills/report-format/` v2 (prose slots)                                                                                                                                                                                                    | P21-03      | EC21-2       |
| D21-4       | `src/renderer/src/analysis/`; IPC channels in `src/shared/ipc/contract.ts`                                                                                                                                                                                                                                             | P21-04      | EC21-3       |
| D21-5       | `src/renderer/src/components/CompareView.tsx`; the multi-lease reservation in `src/main/compute/` (P13-11 amendment)                                                                                                                                                                                                   | P21-05      | EC21-3       |
| D21-6       | `src/main/analysis/controller/` (replay, retraining)                                                                                                                                                                                                                                                                   | P21-06      | EC21-4       |
| D21-7       | Tests; D-NNNs (FR-15 narrowing, D-016, D-022, the NFR-15 commented-out-cell exception, the P10 Q3/D-044 amendment); report schema migration; CODEOWNERS and the review applicability map gain `src/main/export/**`, `bench/rerun/**` and the headless entry's build define (session 1, Q-AM5); `docs/ds/07`, `08` rows | all         | DoD-2, DoD-3 |

## 5. Exit Checklist

| EC / DoD  | Check                                                                                                                                                                                                                                                                                                                                              | Evidence                 | State |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----- |
| EC21-1    | M-05 ≥ 90% per provider over every completed run of the fixed gate pass, in key results as defined in P21-02 (exact equality within the same build; non-`ok` statuses and flagged literals are non-matches; a 0/0 pool fails), with a task-bootstrap interval; the metric parity test and the CPython fixture-notebook CI job pass; M-05b reported | `bench/results/p21/`, CI | Open  |
| EC21-2    | PA-09's report-sections half: the **scorer checks each section against its source record** (`sampled`, `studyDesign` weights, `row_change`, findings, model records, lineage); "n/a" with a non-empty source counts as missing                                                                                                                     | bench                    | Open  |
| EC21-3    | e2e covers export, reopen and compare; the parity test passes                                                                                                                                                                                                                                                                                      | e2e                      | Open  |
| EC21-4    | Replay and retraining tests: markers, refusal on a changed snapshot, no old score beside a retrained model, **no evaluation or test step replayed and no test path granted** in replay or retraining (D-035)                                                                                                                                       | unit + e2e               | Open  |
| Inherited | M-01, M-02, M-03, M-04 = 0, M-19 ≥ 90%, M-06 = 0, M-07 ≥ 0.90, M-08 (P18 smoke), M-09, M-10, PA-02..PA-08, M-11 = 0 (per build), M-12 = 0, no unresolved judge-floor breach                                                                                                                                                                        | bench                    | Open  |
| DoD 1–8   | As roadmap §17; all apply                                                                                                                                                                                                                                                                                                                          | —                        | Open  |

## 6. Phase Risks

| Risk                                                      | Mitigation                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Exported notebooks run agent code (R-20; R-10 for pickle) | Enumerated name, dispatch-string and builtin allowlists, generated I/O, commented-out risky cells      |
| Notebooks expose data and paths (R-21)                    | Relative placeholders; entity-escaped generated Markdown; outputs only on opt-in, listed in the dialog |
| Replay or retraining overloads compute                    | Lease-manager queue; active-time budget                                                                |

## 7. Hand-off to P22

- M-05 measurement and the report v2 format used in the final evaluation
