# P17 Plan: Machine Learning

| Field     | Value                                                                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P17 of P10–P23 (roadmap §10)                                                                                                                                                                                                           |
| Milestone | v0.2 Modeling                                                                                                                                                                                                                          |
| Objective | Build models that are honestly evaluated, saved and reusable                                                                                                                                                                           |
| Entry     | P16 closed (MVP declared); **the maintainer's approval of this phase's planned API spend (D-034) before the gate session (8)**                                                                                                         |
| Spend     | Planned **≈ $29**: one dev run per provider at the gate (D-036 fixed runs, no retry) with judging for D-038's floor (inherited EC16-5), within $15 per provider pass (Q-V7)                                                            |
| Size      | L (8 sessions)                                                                                                                                                                                                                         |
| Branch    | `phase-17-ml`                                                                                                                                                                                                                          |
| Inputs    | ADR-06, ADR-11 · D-035, D-036 · P10 Q15–Q17, Q33 · P11 Q5, P11-16 · P12-03 (scoring dataset, `predictions_ref`) · P13-11 (evaluation kernel) · P14-11 (split storage) · P16 templates and `tests[]` pattern                            |
| Outputs   | D17-1 split kinds, `evaluate_on_test` · D17-2 modeler sub-agent + `ml-workflow` skill · D17-3 explanations and chart templates · D17-4 model store, cards, predict · D17-5 clustering/PCA · D17-6 leakage checks · D17-7 bench results |
| Status    | Audited (3 rounds, `P17-audit.md`); all findings fixed; maintainer defaults pending (Q-R, Q-V, Q-Z); awaiting sign-off                                                                                                                 |

**Rule for the phase:** supervised and unsupervised learning on tabular data with honest
evaluation. Forecasting is P18.

**Who grades (roadmap §8.3 principle 7, P11-16):** main computes every scored number: test
metrics from predictions and host-held labels, the baseline from train labels, the leakage
checks from the train snapshot. Anything the agent's kernel reports (CV scores, permutation
importance, instrumentation) is shown tagged `source: kernel` and never feeds a gate, a
detection or a lesson.

---

## 1. Inherited Decisions and Inputs

| Source         | What it forces in P17                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D-035, P10 Q15 | 80/20 split by type, decided by code; CV for selection; test scored once per analysis; **nested CV and no separate test set for n < 1,000** |
| P10 Q16        | scikit-learn families only                                                                                                                  |
| D-035, P10 Q17 | Halving search; 200k tuning sample; ≤ 100 s per search, ≤ 4 searches, ≤ 3 families, 8 of the 20 minutes                                     |
| P11 Q5, P11-06 | Pickle loaded only in an evaluation kernel; hash and version checked; manifest written by main                                              |
| P11-16, ADR-11 | Host-held test rows; metrics in main; any dispatch to the evaluation kernel spends the lock                                                 |
| P12-03         | The bench scoring-features dataset and `predictions_ref`, for M-07                                                                          |
| P13-11         | The evaluation kernel is predict-only and returns predictions or an error class                                                             |
| P14-11         | The split storage and the temporal/random choice live in the controller; P17 extends it                                                     |
| P16 Q10        | Chart templates built by main                                                                                                               |
| P10 Q33        | PA-06 becomes a gate                                                                                                                        |

## 2. Session Plan

| Session | Work items     | Output                                                                                  |
| ------- | -------------- | --------------------------------------------------------------------------------------- |
| 1–2     | P17-01         | Stratified and grouped kinds; `evaluate_on_test` with pre-flight; nested CV for small n |
| 3       | P17-02, P17-07 | Modeler role and skill; main-side leakage checks; advisory instrumentation              |
| 4       | P17-03         | Explanations and chart templates                                                        |
| 5       | P17-04, P17-05 | Model store, cards, predict with the split allowlist                                    |
| 6       | P17-06         | Clustering and PCA                                                                      |
| 7       | tests, audit   | Contract, parity and e2e tests                                                          |
| 8       | P17-08         | Gate run (paid); summary                                                                |

## 3. Work Item Breakdown

### P17-01 Split kinds and the test lock

- [ ] Extends the split storage owned by P14-11 (the controller); no second store. **Code chooses the kind** (Q1, Q-R3): temporal by P14's detector (temporal wins over an entity column); **grouped** when the `studyDesign` record (P16, extended here) declares an entity column; **stratified** for classification otherwise; random for regression. The agent's plan can't choose. In the app, "the task or the user declares" always means the `studyDesign` record
- [ ] `evaluate_on_test(model_id)`: first **main** checks the test schema and unseen levels against the manifest (no data returned); then a **pre-flight** loads the pickle and predicts on 5 train rows in an evaluation-kernel instance that **holds no test data** (a failure doesn't spend the lock; this amends ADR-11 through a D-NNN, Q-V2); then an `evaluation_dispatched` record is fsynced and the evaluation kernel receives **only the manifest's feature columns**, predicting in chunks; classifiers must return `predict_proba` (otherwise refused); main computes the metrics (Q2, Q3)
- [ ] **n < 1,000 (Q-R4, Q-V1, Q-Z3, Q-Z4)**, n counted in groups when grouped: the controller decides this **at `save_plan`** and records a split of kind **`nested_cv`** with no test partition (amending P14-11 and P11-16). The agent submits a **declarative pipeline spec** (`save_pipeline_spec`): zod-validated JSON with allowlisted scikit-learn class paths, JSON-literal parameters and column lists; **no pickle**. Main orchestrates **3 outer folds** that follow the split kind, each in a fresh **CV-harness kernel** that **constructs the pipeline from the spec itself** and holds only that fold's rows; main then fits the same spec on all rows there to produce the model, whose manifest records its `spec_id`; the card, `predict` and M-07 bind to that (spec, model) pair. Main holds the evaluation slot across all 3 folds; a fold failure after `nested_cv_dispatched` spends the run (no retry); each fold also gets the baseline; the pooled out-of-fold CI uses the split-matched bootstrap. Each outer fold's inner search counts toward D-035's 4 searches. It runs **once per analysis**; the report discloses that tuning outside the pipeline makes the estimate optimistic
- [ ] Metrics with CIs from a bootstrap **matched to the split**: cluster bootstrap by group (fewer than 20 test groups reports "too few groups"), block bootstrap for temporal splits (block length ceil(n^(1/3))); "model beats baseline" uses a **paired** bootstrap; multi-class metrics are macro one-vs-rest; bootstrap runs off main's event loop
- [ ] Key results carry a structured **`test_metrics[]`** whose citations must resolve to the `evaluation_dispatched` (or `nested_cv_dispatched`) record

**Done when:** EC17-1 holds with the M-06 event list below, and every route in ADR-11 has a test.

### P17-02 Modeler and skill

- [ ] **Enforcement of P15 Q-O3:** `evaluate_on_test`'s schema check requires the manifest's features to be a subset of the split source's raw columns, so cleaning that must reach test rows has to live inside the pipeline (code can't judge intent, so this is the enforceable form)
- [ ] Lineage of `predict` outputs: parents are the scoring dataset and `parent_model_id` (no snapshots involved)
- [ ] Scope-table row (`src/main/agent/claude/subagents.ts`) and OpenAI wrapper; `ml-workflow` skill: pipelines (all cleaning that must reach test rows is a pipeline step, P15 Q-O3), CV, halving within D-035's limits, metrics, probability calibration (`CalibratedClassifierCV` on CV folds), thresholds chosen on CV and passed to `save_model(threshold)` (recorded in the manifest as agent-declared)

**Done when:** the scope-table parity test passes and the skill's examples run in the sandbox.

### P17-03 Explanations

- [ ] Permutation importance and partial dependence (top 3 features) run **in the analysis kernel on a training validation fold**, tagged `source: kernel`; `evaluate_on_test` returns metrics only (Q4)
- [ ] Charts (ROC/PR, confusion matrix, residuals) are built **by main** from binned aggregates of test predictions; the importance chart is built by main from the kernel's validation-fold output and labelled `source: kernel`; no per-row test series is ever agent-readable

**Done when:** chart fixtures render from aggregates only.

### P17-04 Model store and cards

- [ ] Save, list, remove in the UI (zod IPC channels, rule 3); the card is generated by code (Q5) with the main-written manifest (hashes, lineage, split kind and seed, library versions, PSI bins and category levels from the train snapshot, the threshold labelled agent-declared, `spec_id` for nested-CV models); **subgroups come from the `studyDesign` record, which locks at the first row-returning read** (P16); the card's "limitations" text goes through provenance and the fence
- [ ] Models live in `userData/models/`, indexed by **main** (single writer, atomic temp-and-rename writes), with a per-analysis limit of 10 models and 500 MB and a 5 GB global warning; a UI removal during an in-flight `predict` or evaluation waits until it releases; removing a model marks dependent derived datasets "parent removed" (D-043); a full disk gives `artifact_failed`; CODEOWNERS gains `src/main/models/**` (R-10)
- [ ] **Upgrade safety (Q-R7, Q-V10):** a library-version mismatch marks a model **"needs retrain"**; retraining moves to **P21** (journal replay): it must read the same split epoch's train snapshot (hash-checked) or refuse, and the old test score stays with the old model (the retrained one has none, since the lock is spent)

**Done when:** EC17-4 passes.

### P17-05 Predict

- [ ] `predict(model_id, dataset_id)`: for the life of the conversation's split record, it **refuses any dataset whose lineage or content hash includes the split source** (matching P11-02; the bench scoring-features dataset excepted, identified only from the runner's manifest in the bench build flavour, Q-V8); **every** `predict` passes only the manifest's feature columns; schema check, unseen categories, PSI drift warning; output as a derived dataset with a row-id passthrough; on the bench, `predictions_ref` points at that artifact and the scorer checks its model id equals the evaluated one (M-07)
- [ ] The scoring-features dataset **and its descendants** are readable only by `predict` (and, for forecast tasks, by P18's controller-run refit) and hidden from `run_python` and `run_sql` (controller allowlist) (Q-R9)

- [ ] Test predictions never get an output id
- [ ] Duplicate detection is exact-hash only: a re-export or re-sorted copy of the split source has a new hash and no lineage, so it isn't hidden. This is recorded in the threat model as a v1.0 limitation

**Done when:** the duplicate-registration and descendant routes have tests.

### P17-06 Clustering and PCA

- [ ] k-means and Ward with k from 2–10 by silhouette, bootstrap stability (ARI ≥ 0.75) on a seeded subsample of ≤ 10k rows for Ward and silhouette, disclosed (Q7)
- [ ] PCA: standardised features; components to 90% explained variance; top-5 loadings per component; a scree chart

**Done when:** clustering and PCA tests pass on fixtures (FR-07).

### P17-07 Leakage checks

- [ ] **Main-side checks (Q8, Q-R1):** (1) single-feature leakage, run at `save_model` over the manifest's features on the train snapshot in DuckDB (sampled to 200k rows): |Spearman r| > 0.95 for numeric features (regression and classification), rank-based AUC > 0.95 for numeric features in classification (multi-class: one-vs-rest maximum), out-of-fold target-mean AUC > 0.95 (classification) or out-of-fold target-mean Spearman > 0.95 (regression) for categoricals; (2) post-outcome features: when the `studyDesign` record declares the target event's timestamp column, any timestamp-typed feature whose value is later than the event time on ≥ 5% of rows; (3) entity leakage when an entity column is declared and the split is neither grouped nor temporal; (4) **imbalance** (minority class < 20%) with an accuracy headline is a **method failure**, never a detection (Q-V5)
- [ ] **Advisory (`source: kernel`):** preprocessing fitted on the whole training set outside a CV pipeline (sklearn instrumentation, Q9); only the outer call is fingerprinted, since a Pipeline converts frames to arrays
- [ ] A finding can be dismissed **only by the user** (NFR-13), never by a plan field (Q-R6)
- [ ] Thresholds are fixed before the gate run, not tuned on the trap tasks; there is one check registry (`src/main/checks/registry.ts`, P15)
- [ ] **An open leakage finding** withholds the model's headline in the report until the agent removes the flagged feature from the manifest or discloses it in `issues[]`

**Done when:** each check has a positive and a negative fixture.

### P17-08 Bench

- [ ] One dev run per provider (D-036): EC17-1..3 and the inherited gates (Q10)

## 4. Deliverable Map

| Deliverable | File path                                                                                                                                                                                                                                                                                                                                                                                                        | Produced by | Satisfies |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| D17-1       | `src/main/analysis/controller/` (split kinds incl. `nested_cv`, evaluation orchestration, nested CV); `src/mcp-server-ds/tools/evaluate.ts`                                                                                                                                                                                                                                                                      | P17-01      | EC17-1    |
| D17-2       | `src/main/agent/claude/subagents.ts`; `resources/agent-plugin/skills/ml-workflow/`; OpenAI wrappers                                                                                                                                                                                                                                                                                                              | P17-02      | EC17-2    |
| D17-3       | `src/shared/chartTemplates/` additions; main's chart writer                                                                                                                                                                                                                                                                                                                                                      | P17-03      | DoD-2     |
| D17-4       | `src/main/models/` (manifest, metrics, PSI, cards, store, index); `src/mcp-server-ds/tools/{saveModel,savePipelineSpec,predict}.ts`; IPC channels                                                                                                                                                                                                                                                                | P17-04, 05  | EC17-4    |
| D17-5       | `resources/agent-plugin/skills/ml-workflow/` clustering and PCA sections                                                                                                                                                                                                                                                                                                                                         | P17-06      | DoD-2     |
| D17-6       | `src/main/checks/leakage.ts`; `src/main/compute/instrumentation.py` additions                                                                                                                                                                                                                                                                                                                                    | P17-07      | EC17-3    |
| D17-7       | `bench/results/p17/`                                                                                                                                                                                                                                                                                                                                                                                             | P17-08      | EC17-1..3 |
| D17-8       | Tests: split-route escape tests, duplicate-registration predict, shifted-data predict, golden-vector metrics, clustering and PCA, parity; the `studyDesign` record extension (entity column, event timestamp column, subgroups) with its IPC fields; the key-results schema bump (`headline_metric`, `test_metrics[]`) with migration fixtures (D-045); the P13-11 CV-harness amendment; `docs/ds/07`, `08` rows | all         | DoD-2     |

## 5. Exit Checklist

| EC / DoD  | Check                                                                                                                                                                                                                                                                                                                                                                               | Evidence             | State |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----- |
| EC17-1    | M-06 = 0: metrics computed after a pre-plan row-returning read of the split source, a manifest split mismatch, or a `test_metrics[]` entry not resolving to the evaluation record. Refused attempts (a second evaluation or nested CV, a `predict` refused by the allowlist) are **not** violations: they are reported separately as attempts (Q-V6)                                | bench + unit         | Open  |
| EC17-2    | M-07 ≥ 0.90 on the dev ML tasks (count listed in `docs/ds/05`), one run per provider, with the bootstrap interval or "n too small"                                                                                                                                                                                                                                                  | `bench/results/p17/` | Open  |
| EC17-3    | On the dev leakage instance, both providers: the final manifest **excludes the flagged feature, or `issues[]` discloses it** (Q-V4); the imbalance instance scores only when `headline_metric` is not accuracy (Q-V5); PA-06: 0 lock violations and the **median** model ratio across the dev ML tasks ≥ 0.90 (MVP; 0.95 at v1.0) (Q-V3); the holdout instances are reported at P22 | same                 | Open  |
| EC17-4    | A saved model predicts after an app restart; a version mismatch shows "needs retrain"                                                                                                                                                                                                                                                                                               | e2e                  | Open  |
| Inherited | All gates from P14–P16                                                                                                                                                                                                                                                                                                                                                              | bench                | Open  |
| DoD 1–8   | As roadmap §17                                                                                                                                                                                                                                                                                                                                                                      | —                    | Open  |

## 6. Phase Risks

| Risk                                                         | Mitigation                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Host-held test data complicates pipelines (R-10 for pickles) | `evaluate_on_test` takes a fitted pipeline, so preprocessing is inside it; the skill says so |
| Fit times blow the wall clock on 1M rows                     | Halving, the tuning sample, P13 measurements, D-035's limits                                 |
| Leakage heuristics produce false alarms                      | Fixed thresholds; out-of-fold AUC for categoricals; controls count false alarms (M-03)       |
| One failure burns the test set                               | Pre-flight on train rows before dispatch                                                     |

## 7. Hand-off to P18 and P19

- Temporal splits come from P14-11; P17 hands P18 the evaluation orchestration, whose result schema is defined per task type (forecast: point forecasts and interval quantiles returned by the predict harness; metrics in main)
- The leakage check registry for the critic
