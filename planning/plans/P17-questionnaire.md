# P17 Questionnaire: Decisions Needed Before Machine Learning

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle splitting, evaluation, explanations, model reuse and leakage detection                                                |
| Already decided | P10 Q15–Q17, Q33; P11 Q5; P16 Q10; D-030..D-045 (draft, `planning/decisions-draft.md`); P11–P16 as audited                   |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation |

---

**Q1. How does `make_split` work?**
_Blocks: P17-01, M-06._

> **Recommendation (Claude):** It creates `train` and `test` DataFrames in the kernel and records
> the split; `evaluate_on_test` checks it is called once.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** `make_split(dataset_var, target, kind, group_col?, time_col?, test_size=0.2)` validates the kind (a group column must exist and repeat; a time column must be sortable, and the test set is the latest 20%). It puts **only the training frame in the kernel**. **The test rows are held by the host** outside the kernel. `evaluate_on_test(pipeline_var)` sends the test rows into a separate, short-lived evaluation step that scores the fitted pipeline, returns the results, and wipes the test data. A second call for the same split is refused (P10 Q15).
>
> **Why:** If the test frame lives in the kernel, the agent can look at it, fit on it or tune against it in an ordinary `run_python` call, and a "called once" counter on one tool proves nothing. Holding the test rows outside the kernel makes the lock real: the only way to touch them is the one audited evaluation.
>
> **Rejected:** test frame in the kernel with a call counter (unenforceable); no split tool (no lock at all).
>
> **Recommendation was:** overturned (host-held test data).
>
> **Consequences:** P17-01; pipelines must contain all preprocessing (the skill teaches it, and it's also what prevents leakage); an escape-suite-style test tries to reach test rows from `run_python`.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Refined by the P11 audit (2026-10-03):** the split and test lock are designed in ADR-11 (P11-16). `make_split` restarts the kernel; the analysis DuckDB then sees only the train snapshot; `evaluate_on_test` sends test **features only** to a fresh kernel that loads the saved pipeline, and **metrics are computed by code in main** from the predictions and host-held labels, so agent code can never grade itself.
>
> **Refined by the P11 audit, round 3 (2026-10-03):** the split takes a **dataset id**, not a kernel frame, and is made by code at `save_plan` for predictive and forecast plans; `evaluate_on_test` takes a **model id** from the store and refuses a model whose manifest split id differs; any attempt that reaches the evaluation kernel spends the lock; test predictions are never returned to the agent (ADR-11). This supersedes `make_split(dataset_var, …)` and `evaluate_on_test(pipeline_var)` above.
>
> **Audit resolution (2026-10-03):** Superseding the signature above: **code chooses the kind** (temporal by P14's detector; grouped when the task or user declares an entity column; stratified for classification; random for regression); the plan can't choose (Q-R3). For n < 1,000 there is no test set: main orchestrates nested CV, each outer fold in a fresh evaluation kernel, and computes the metrics (Q-R4).
>
> **Audit resolution, round 2 (2026-10-03):** Nested CV for n < 1,000 runs in a new fit-capable **CV-harness** kernel variant (amended into P13-11), on an unfitted `save_pipeline_spec`, with 3 outer folds following the split kind, **once per analysis**, inner searches counted toward D-035's limit (Q-V1). Entity columns, event timestamps and subgroups come only from P16's `studyDesign` record, extended here.
>
> **Audit resolution, round 3 (2026-10-03):** Superseding the round-2 pickled spec: `save_pipeline_spec` is **declarative JSON** (allowlisted scikit-learn class paths, JSON-literal parameters, column lists); the CV harness builds the pipeline itself and loads no pickle, so memorised labels can't be smuggled in (Q-Z4). The controller records a `nested_cv` split at `save_plan`; main fits the spec on all rows to make the model, and the card and M-07 bind to the (spec, model) pair (Q-Z3). A host-crash resume of the same model hash isn't a new attempt.

**Q2. What does `evaluate_on_test` return?**
_Blocks: P17-01._

> **Recommendation (Claude):** The task's metrics on the test set.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** It returns the default metrics for the task type (Q3) **with 95% bootstrap CIs** (1,000 resamples, recorded seed); the dummy-baseline metrics on the same test rows; predictions stored by output id (not returned in bulk); and the explanation bundle (Q4). Everything is journalled as one evaluation record linked to the split.
>
> **Why:** A point estimate on one test set hides how uncertain it is, so CIs are what make "model A beats baseline" honest. Bundling everything into one call is what makes "exactly one look at the test set" workable.
>
> **Rejected:** metrics only (no uncertainty); returning all predictions in context (budget and DS-09).
>
> **Recommendation was:** refined (CIs, baseline, bundle).
>
> **Consequences:** P17-01; the model card uses these numbers.
>
> **Revisit if:** bootstrap time on large test sets exceeds 30 s (then fewer resamples).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseding "the explanation bundle" and "predictions stored by output id": `evaluate_on_test` returns **metrics only**, computed by main; test predictions never get an output id. The baseline is computed by main from train labels. CIs use a bootstrap matched to the split (cluster or block), with a paired bootstrap for model-vs-baseline. A pre-flight on 5 train rows precedes dispatch, so a broken pickle doesn't burn the test set (Q-R8).
>
> **Audit resolution, round 2 (2026-10-03):** The train-row pre-flight runs in an evaluation-kernel instance holding no test data and doesn't spend the lock; ADR-11 is amended by a D-NNN (Q-V2). Main first checks the test schema and unseen levels; prediction is chunked. `test_metrics[]` citations must resolve to the evaluation record.

**Q3. Which metrics by default?**
_Blocks: P17-02._

> **Recommendation (Claude):** Regression: RMSE, MAE, R². Classification: accuracy, F1, ROC-AUC.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Regression: RMSE, MAE and R². Classification: **ROC-AUC, PR-AUC, Brier score**, plus F1 / precision / recall **at a threshold chosen on CV**, never on the test set. Accuracy is reported only with the majority-class baseline beside it. Multi-class: macro-F1 and balanced accuracy.
>
> **Why:** Accuracy on imbalanced data is the classic trap (DS-Bench has one), and F1 depends on a threshold that must not be tuned on the test set. PR-AUC shows imbalance honestly, and Brier shows whether the probabilities can be trusted.
>
> **Rejected:** accuracy as the headline (misleading under imbalance); a threshold tuned on test (leakage).
>
> **Recommendation was:** overturned (imbalance-aware metrics, CV-chosen threshold).
>
> **Consequences:** P17-02 skill; the imbalance trap checks that accuracy isn't the headline.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The threshold comes from `save_model(threshold)`, recorded as agent-declared; classifiers must return `predict_proba` or are refused; multi-class metrics are macro one-vs-rest. The headline metric is a structured `headline_metric` field (key-results schema bump).

**Q4. Where are explanations computed?**
_Blocks: P17-03._

> **Recommendation (Claude):** Permutation importance and partial dependence on the test set,
> after evaluation.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Computed **inside the single evaluation bundle** (Q2): permutation importance on the test rows with repeats and CIs, and partial dependence for the top 3 features. Correlated features get a caveat (permutation importance splits credit between them). Nothing is computed on the test set after the bundle.
>
> **Why:** "After evaluation" would be a second access to the test data, which Q1 forbids. Computing explanations in the same bundle keeps them on held-out data (honest) without breaking the lock.
>
> **Rejected:** a separate explanation call on test data (breaks the lock); impurity-based importance (biased toward high-cardinality features).
>
> **Recommendation was:** refined (inside the bundle; correlation caveat).
>
> **Consequences:** P17-03; templates for importance and partial dependence.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Refined by the P11 audit (2026-10-03), superseding "on the test rows" above:** the evaluation kernel receives test **features only**, so permutation importance is computed on a **validation fold of the training set**, never on the test set (ADR-11).
>
> **Audit resolution (2026-10-03):** Superseded: explanations run in the analysis kernel on a training validation fold, tagged `source: kernel`; nothing runs in the evaluation step except prediction.

**Q5. What goes in a model card?**
_Blocks: P17-04._

> **Recommendation (Claude):** Data, split, metrics, intended use, limitations.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The recommended items **plus**: dataset hashes and lineage; the split kind and seed; CV scores and the test score with CIs; the baseline; the threshold and how it was chosen; the library versions (P11 Q5); known method findings; "not for" uses. Performance per subgroup is shown **only for subgroups the user declares** (no guessing at sensitive attributes). The card is generated by **code from the journal**, with one free-text "limitations" field written by the agent and marked as such.
>
> **Why:** A card the agent writes freely can overstate. Code-generated facts plus a marked opinion field keep it honest and provenanced (M-04). Guessing sensitive attributes is both error-prone and inappropriate.
>
> **Rejected:** a free-form card (unverifiable); automatic fairness slices on guessed attributes (wrong and intrusive).
>
> **Recommendation was:** refined (code-generated, with declared subgroups only).
>
> **Consequences:** P17-04; P21-03 includes cards in reports.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** CV scores from the kernel are tagged `source: kernel`; subgroups are declared before `evaluate_on_test`; PSI bins and category levels are written by main from the train snapshot; the limitations text goes through provenance and the fence. A version mismatch marks a model "needs retrain", with retraining by journal replay (Q-R7).
>
> **Audit resolution, round 2 (2026-10-03):** Retraining moves to P21: same train snapshot or refuse; the old test score stays with the old model (Q-V10).
>
> **Audit resolution, round 3 (2026-10-03):** Retraining is now a P21 work item (P21-06 after the P21 audit) (same train snapshot or refuse; the old test score stays with the old model) (Q-Z5). Subgroups come from the `studyDesign` record, locked at the first row-returning read.

**Q6. How does predicting on a new dataset work?**
_Blocks: P17-05._

> **Recommendation (Claude):** Check the columns match, predict, and save the predictions as a
> derived dataset.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** `predict(model_id, dataset)` checks columns, dtypes and **unseen categorical levels** (handled per the pipeline's encoder, and counted), and runs a **drift check** (population stability index per feature; flag > 0.25). It writes predictions as a derived dataset with lineage to both the model and the input. The model loads only after the hash and version checks (P11 Q5).
>
> **Why:** Predicting on data unlike the training data is the commonest silent failure of a saved model, and a drift flag is cheap. Unseen categories either crash or quietly map to zeros, and either way the user must know.
>
> **Rejected:** a column-name check only (misses dtype changes, unseen levels and drift).
>
> **Recommendation was:** refined (unseen levels, drift, dual lineage).
>
> **Consequences:** P17-05; a test with shifted data.
>
> **Revisit if:** PSI proves noisy on small inputs (then require n ≥ 500 to flag).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** While a split is active, `predict` refuses datasets whose lineage includes the split source (except the bench scoring dataset); the evaluation kernel gets manifest feature columns only (Q-R2). The scoring dataset is readable only by `predict` (Q-R9). On the bench, `predictions_ref` must point at the `predict` artifact of the evaluated model.
>
> **Audit resolution, round 2 (2026-10-03):** `predict` refuses by lineage **or content hash** (matching P11-02) for the life of the split record, and every `predict` receives only manifest features (Q-V8). The scoring dataset's descendants are also predict-only; the bench exemption comes only from the runner's manifest.

**Q7. How is clustering done?**
_Blocks: P17-06._

> **Recommendation (Claude):** k-means with k chosen by the elbow method.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Standardise features, then k-means **and** agglomerative clustering (Ward). Choose k from 2–10 by **silhouette**, and check **stability** (bootstrap adjusted Rand index ≥ 0.75; below that, report "no stable structure"). Profiles per cluster in original units. A standing caveat: clusters are a description, not classes or causes.
>
> **Why:** The elbow method is a visual judgement, so code can't check it. Silhouette is computable. Stability is the test that distinguishes real structure from noise, and saying "no stable structure" is a valid, honest result.
>
> **Rejected:** the elbow method (subjective); a single algorithm (one view of structure).
>
> **Recommendation was:** overturned (silhouette plus stability, two algorithms).
>
> **Consequences:** P17-06; a "no structure" control task in a later bench revision (propose at sign-off).
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Ward and silhouette run on a seeded subsample of ≤ 10k rows, disclosed. PCA is specified (standardised, 90% variance, top-5 loadings, scree chart).

**Q8. Which leakage checks run?**
_Blocks: P17-07, EC17-3._

> **Recommendation (Claude):** Target leakage (a feature too correlated with the target), test
> reuse, and group leakage.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Five checks: (1) **single-feature target leakage**: any one feature alone reaching CV ROC-AUC > 0.95 or |r| > 0.95 with the target; (2) **post-outcome features**: a time-stamped feature dated after the target event, where a time column exists; (3) **group leakage**: the same group id in train and test when a group column is declared or detected (repeated ids); (4) **preprocessing fitted before the split**: from instrumentation (Q9), a scaler, encoder or imputer `fit` on data containing test rows; (5) **test reuse**, already impossible by Q1 but kept as a check. Findings name the feature or column.
>
> **Why:** The recommendation lacks thresholds (it can't be computed) and misses the most common real leak, preprocessing fitted on all the data. Naming the feature makes detection scoreable (P12 Q6).
>
> **Rejected:** correlation-only leakage (misses non-linear leaks); no preprocessing check (the most common leak).
>
> **Recommendation was:** refined (thresholds, two more checks, named subjects).
>
> **Consequences:** P17-07; leakage traps cover checks 1–4.
>
> **Revisit if:** check 1 false-alarms on genuinely strong features (then require the plan to whitelist with a reason).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: the scored checks run **in main** over the train snapshot (single-feature leakage with Spearman, rank AUC and out-of-fold target-mean AUC; post-outcome features with a declared event timestamp; entity leakage with a declared entity column; imbalance with an accuracy headline). Preprocessing fitted outside a CV pipeline is advisory. Check 5 is dropped (impossible by design). Only the user can dismiss a finding (Q-R6). Thresholds are fixed in advance.
>
> **Audit resolution, round 2 (2026-10-03):** EC17-3 gates on the agent **excluding the flagged feature or disclosing it**, not on the check firing (Q-V4). The imbalance trap scores only when the headline isn't accuracy; main's check is a method failure (Q-V5). Check 1 runs at `save_model` over manifest features; check 3 is skipped for temporal splits.
>
> **Audit resolution, round 3 (2026-10-03):** EC17-3 and the roadmap exit now say "excluded or disclosed" and PA-06 is the **median** ratio ≥ 0.90 (Q-Z2). Check (2) is defined: timestamp features later than the event time on ≥ 5% of rows. The Q-O3 enforcement is the schema rule (features ⊆ the split source's raw columns), since code can't judge intent.

**Q9. How are scikit-learn calls observed?**
_Blocks: P17-07._

> **Recommendation (Claude):** Instrument `fit`, `predict` and `transform` like the pandas
> instrumentation in P15.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended: wrap `fit`, `fit_transform`, `predict` and `transform` on estimators and pipelines to record the input shapes, a fingerprint of the row index (to tell train from all-data), and the estimator class. The records feed Q8 check 4 and PA-06. The same mechanism and caveats apply as in P15 Q5.
>
> **Why:** Row-index fingerprints are what tell "fit on train" apart from "fit on everything", which the shape alone can't. Reusing the P15 pattern keeps one instrumentation design.
>
> **Rejected:** code parsing (fragile).
>
> **Recommendation was:** kept (row fingerprints specified).
>
> **Consequences:** P17-07; overhead measured.
>
> **Revisit if:** overhead exceeds 10%.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Advisory only (roadmap §8.3 principle 7): it never feeds EC17-3 or PA-06 (Q-R1). Only the outer call is fingerprinted.

**Q10. What are the gate values?**
_Blocks: EC17-1..3._

> **Recommendation (Claude):** M-06 = 0, M-07 ≥ 0.90, leakage-trap detection ≥ 80%.

> **Answer Q10:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, plus **PA-06** (0 lock violations and ≥ 0.90 versus the reference per family) and the imbalance trap requiring a non-accuracy headline (Q3). All inherited gates apply. Single dev run with the P12 Q7 noise rule.
>
> **Why:** These are the measurable promises of this phase. The imbalance check guards the metric decision in Q3.
>
> **Rejected:** a lower M-07 (the reference model is the floor of competence).
>
> **Recommendation was:** kept (PA-06 and imbalance added).
>
> **Consequences:** EC17-1..3.
>
> **Revisit if:** the reference models prove unrealistically strong for the time box (re-baseline by D-NNN).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: one dev run per provider, no noise rule (D-036). PA-06 = 0 lock violations and ≥ 0.95 versus the reference per estimator family (roadmap §7.2). EC17-3 is per instance on dev, with the holdout instance reported at P22 (Q-R5). Spend ≈ $24 (Q-R10).
>
> **Audit resolution, round 2 (2026-10-03):** PA-06 is per task: model ratio ≥ 0.90 at MVP, 0.95 at v1.0 (Q-V3). M-06 counts metrics after a violation; refused attempts are reported separately (Q-V6). The gate runs the judge for D-038's floor; spend ≈ $29 (Q-V7).
>
> **Audit resolution, round 3 (2026-10-03):** EC17-1 no longer lists refused attempts as violations; they are reported separately (Q-Z1).

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                                           | Recommendation     | Confidence | Needs maintainer                 |
| --- | --------------------------------------------------------------------------------------------- | ------------------ | ---------- | -------------------------------- |
| Q1  | Test rows held by the host; one audited evaluation step                                       | **overturned**     | High       | no                               |
| Q2  | Metrics only, computed by main; pre-flight; split-matched bootstrap; `test_metrics[]` (audit) | overturned (audit) | High       | **yes (Q-R8, Q-V2)**             |
| Q3  | ROC-AUC, PR-AUC, Brier; CV-chosen threshold; accuracy only with baseline                      | **overturned**     | High       | no                               |
| Q4  | Explanations in the analysis kernel on a validation fold, `source: kernel` (audit)            | overturned (audit) | High       | no                               |
| Q5  | Code-generated model card; declared subgroups only                                            | refined            | High       | no                               |
| Q6  | Schema, unseen levels, drift (PSI) checks; dual lineage                                       | refined            | High       | no                               |
| Q7  | Silhouette + bootstrap stability; two algorithms                                              | **overturned**     | High       | no                               |
| Q8  | Main-side leakage checks; imbalance is a method failure; only the user dismisses (audit)      | overturned (audit) | High       | **yes (Q-R1, Q-R6, Q-V4, Q-V5)** |
| Q9  | Instrument fit/transform/predict with row fingerprints                                        | kept               | High       | no                               |
| Q10 | M-06 events; M-07 ≥ 0.90; EC17-3 on exclusion or disclosure; PA-06 per task (audit)           | overturned (audit) | High       | **yes (Q-R5, Q-V3, Q-V6, Q-V7)** |

**Totals:** 10 answered · 2 kept · 5 refined · 3 overturned · 0 need the maintainer. The audit raised Q-R1..Q-R10 and Q-V1..Q-V10 (`P17-audit.md`).

**Overturned recommendations:**

- Q1: a test frame inside the kernel can be peeked at, so a call counter proves nothing.
- Q3: accuracy misleads on imbalanced data, and test-tuned thresholds leak.
- Q7: the elbow method is subjective and can't be checked by code.

**For the maintainer:** none in the first pass; the audit raised Q-R1..Q-R10, Q-V1..Q-V10 and Q-Z1..Q-Z5 (`P17-audit.md`).

**Cross-question changes made in the consistency pass:**

- Q4 moved into Q2's bundle to respect Q1's single look. **Superseded by the audit:** explanations run on a validation fold.
- Q8 check 4 depends on Q9's row fingerprints. **Superseded by the audit:** instrumentation is advisory.

**Facts verified:** none in the first pass. **To verify (docs-researcher, session 1):** `HalvingGridSearchCV` in Pyodide's scikit-learn; `predict_proba` detection on pipelines; pickle portability across Pyodide releases; rank and window functions for Spearman and rank AUC in the pinned DuckDB node API.
