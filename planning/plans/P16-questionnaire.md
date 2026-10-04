# P16 Questionnaire: Decisions Needed Before Statistical Inference

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle how inference is chosen, checked, charted and gated                                                                   |
| Already decided | P10 Q13, Q14, Q21, Q33, Q35; P12 Q7, Q11; P15 Q5; D-030..D-045 (draft, `planning/decisions-draft.md`); P11–P15 as audited    |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation |

---

**Q1. Which tools does the statistician get?**
_Blocks: P16-01._

> **Recommendation (Claude):** `run_python`, `get_output`, `create_chart`, `get_schema`,
> `profile_column`.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, plus `save_derived_dataset` **not** granted (the statistician analyses data and doesn't reshape it; that is the wrangler's job) and no `make_split`. Its context contract (8k) carries the plan's design fields and the profile summary in its working set.
>
> **Why:** Keeping one role per data-changing capability keeps lineage and per-agent metrics attributable (PA-04 vs PA-05). A statistician that saves datasets would blur which role caused a row loss.
>
> **Rejected:** a single "analyst" role with all tools (per-agent metrics become meaningless).
>
> **Recommendation was:** kept (explicit exclusions).
>
> **Consequences:** P16-01 scope-table row; the parity test covers it.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The three preloaded skills plus the design must fit the 8k contract; M-18 is measured before the gate.
>
> **Audit resolution, round 3 (2026-10-03):** Superseding "preloaded" in the round-1 line: the skills load on demand via `Skill` (§8.5). The statistician also gets `describe_design` (counts only) so it can lock its test knowing n and the outcome type.

**Q2. How is the statistical test chosen?**
_Blocks: P16-01, PA-05._

> **Recommendation (Claude):** A decision table in the `statistical-testing` skill.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The plan records the **design** in typed fields (outcome type, number of groups, paired or independent, n per group, weights declared, directional hypothesis). A **code function** maps the design to the **acceptable test set** from `docs/ds/04`; the same table appears in the skill for the agent to read. Instrumentation (Q3) records which test actually ran. A test outside the acceptable set raises a method finding (not a block), and PA-05 is computed by code against the answer key's acceptable set.
>
> **Why:** A decision table only in a skill is advice that can't be checked. Making the design typed and the mapping code turns "right test chosen" into a deterministic check and a measurable metric. Findings instead of blocks leave room for justified alternatives, which the critic (P19) can review.
>
> **Rejected:** a skill-only table (unmeasurable); a `choose_test` tool that picks for the agent (removes judgement the agent needs, and teaches nothing).
>
> **Recommendation was:** overturned (typed design plus code mapping, with the skill as documentation).
>
> **Consequences:** §12.1 plan gains design fields (propose at sign-off); P16-01 mapping function with table-driven tests.
>
> **Revisit if:** the acceptable sets prove too narrow on real data (widen in `docs/ds/04` by D-NNN).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The agent declares only structural fields (outcome, group, pairing, direction, hypotheses), locked at the first data read; code computes n and outcome type; `randomised`, weights and weight kind, planned allocation and screen vs confirmatory come **only** from the task, the user's UI or an accepted dataset note (Q-P5). One acceptable-test table in `src/shared/ds/` serves the app and the key generator; test identity includes keyword arguments.
>
> **Audit resolution, round 2 (2026-10-03):** The **chosen test per hypothesis is a plan-locked field** (D-035: chosen before testing); the scorer checks each claimed test equals the locked one (Q-S3). External design fields live in a typed `studyDesign` record set through the UI or, in bench builds only, the task manifest; defaults are confirmatory, unweighted and not randomised.
>
> **Audit resolution, round 3 (2026-10-03):** The `studyDesign` record (renamed from "authority" to avoid clashing with P14) **locks at the first row-returning read**; later UI changes are journalled as late and apply only to a new analysis (Q-W1). Code supplies n and outcome type before `save_plan` (Q-W2). Exploratory status follows P14's rule, including the user-named exception.

**Q3. How are the tests in a "family" counted for multiple-comparison correction?**
_Blocks: P16-05._

> **Recommendation (Claude):** The agent lists its tests per plan question in the answer.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **Instrument the test calls** (`scipy.stats` tests, `statsmodels` test functions, model `.fit()` p-values) as P15 did for pandas. Each recorded test is tagged with the execution's plan question id (from `run_python`'s optional `question` field, required once a plan has more than one question). Code counts each family, applies or checks Holm/BH, and flags any reported p-value whose family needed correction and didn't get it.
>
> **Why:** If the agent lists its own tests, it can leave out the tests it ran and didn't like, which is exactly the p-hacking pattern the trap tests. Instrumentation counts every test that actually ran, including the "failed" ones.
>
> **Rejected:** self-reported test lists (the agent grading itself); parsing code (fragile).
>
> **Recommendation was:** overturned (instrumented counting).
>
> **Consequences:** P16-05; P14's `run_python` gains an optional `question` field; the multiple-comparison trap in DS-Bench validates it.
>
> **Revisit if:** tests run through unusual APIs that instrumentation misses (then add wrappers).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded by roadmap §8.3 principle 7: instrumentation is **advisory**. The agent claims its tests in a structured `tests[]` list; the **scorer recomputes every claimed test** from the journalled snapshot, and PA-05 and family counts come from that (Q-P1). In the app, families are the hypotheses locked in the plan; later questions are exploratory; on the bench, families come from the task (D-035, Q-P2).
>
> **Audit resolution, round 2 (2026-10-03):** `tests[]` entries carry `hypothesisId`, `family`, an enum `function`, typed scalar `kwargs`, dataset-referenced `inputs`, the statistic, p, `correction` and `pAdjusted`; the scorer recomputes them in a sandboxed child through a fixed dispatch table, never executing agent strings (Q-S1, Q-S2). Kernel-only inputs make a claim "not recomputable". PA-05's denominator is the key's hypotheses (Q-S4). In the app a family is every confirmatory hypothesis on the same outcome column, so splitting questions can't avoid correction (Q-S9).
>
> **Audit resolution, round 3 (2026-10-03):** Every locked confirmatory hypothesis must appear in `tests[]`; the scorer recomputes Holm with m from the lock, checks Holm vs BH against the `studyDesign` record and the `alternative` against the locked direction (Q-W4). Statistics and p-values are cited and resolved by code at full precision; bench tasks supply the hypothesis ids; matched = acceptable ∧ locked ∧ recomputed (Q-W5). Regression uses a typed design schema; formula strings are banned (Q-W6). Journalled selects are re-validated with P14-01's parser and run with external access off. Families follow source-column lineage. The Simpson probe is a controller-only `datadesk-ds` tool tagged `source: probe` and excluded from M-02/M-03.

**Q4. What does the A/B testing skill require?**
_Blocks: P16-02._

> **Recommendation (Claude):** A sample-ratio-mismatch check, no peeking, and practical vs
> statistical significance; CUPED is optional.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, with numbers and one clarification. The SRM check is a chi-square against the planned allocation, flagged at p < 0.001. "No peeking" means **one** analysis at the planned sample size; if the data has a time column and the plan calls for interim looks, a sequential method is required and anything else is a finding. A minimum detectable effect and power are reported. CUPED stays out of v1.0.
>
> **Why:** SRM at 0.001 is the common industry threshold that avoids false alarms on large samples. Peeking needs an operational definition to be checkable. Power and MDE stop "not significant" being read as "no effect".
>
> **Rejected:** CUPED in v1.0 (needs pre-period covariates the benchmark doesn't model; scope); SRM at 0.05 (false alarms at scale).
>
> **Recommendation was:** refined (thresholds, peeking definition, MDE).
>
> **Consequences:** P16-02; a DS-Bench A/B task includes an SRM trap.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The planned allocation and any interim looks come from the task or the UI, never the plan text. MDE is at the achieved n for a stated power; observed power is never reported.
>
> **Audit resolution, round 2 (2026-10-03):** Interim looks are out of v1.0. The skill thresholds and 80% power become policy constants by a D-NNN before P16-02 (Q-S8).

**Q5. How are survey or frequency weights detected?**
_Blocks: P16-04._

> **Recommendation (Claude):** Detect columns named like `weight`, `wt`, `rfact`, `pweight` and use
> them.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Weights are **declared, not guessed**: by the user, in dataset notes (P20) or in the task. Name heuristics only **suggest** ("column X looks like a weight; is it?"), shown to the user and recorded as a method finding. Undeclared weight-like columns produce an "unweighted estimates" caveat in the report.
>
> **Why:** Using a column as a weight just because of its name can silently produce wrong population estimates (a "wt" column might be body weight). The cost of asking is one line, and the cost of guessing wrong is every number. The benchmark's weights trap is declared in its task, which tests correct use rather than guessing.
>
> **Rejected:** auto-using name matches (silent wrong estimates); ignoring weights (the classic survey error).
>
> **Recommendation was:** overturned (declare, don't guess).
>
> **Consequences:** P16-04; dataset notes get a `weights` field in P20 (pre-declared via task or user until then).
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Weights carry a **kind** (frequency, probability, analytic), each mapped to an estimator and an effective n in `docs/ds/04` and the key. Weight suggestions are fenced and unmeasured on the bench.
>
> **Audit resolution, round 2 (2026-10-03):** Probability weights use weighted point estimates with sandwich SEs, disclosed; strata and PSUs are out of v1.0 (Q-S7).

**Q6. Which regression diagnostics are required?**
_Blocks: P16-03._

> **Recommendation (Claude):** Residual plots, VIF, and a Breusch–Pagan test, switching to robust
> standard errors when it rejects.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **HC3 robust standard errors by default** for OLS, not "test then switch". Required diagnostics: residuals vs fitted, Q-Q of residuals, VIF (flag > 10), influence (Cook's distance, flag the top points), and for logistic regression, separation warnings and calibration by decile. Breusch–Pagan is reported for information only.
>
> **Why:** "Breusch–Pagan rejects, so switch to robust SEs" is the same flawed two-stage pattern P10 Q13 rejected for normality tests. HC3 costs almost nothing when errors are homoscedastic and protects when they aren't.
>
> **Rejected:** test-then-switch (distorted inference); diagnostics without thresholds (uncheckable).
>
> **Recommendation was:** overturned (robust by default; BP informational).
>
> **Consequences:** P16-03; checks for VIF and separation in P16-05.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Logistic regression uses the robust covariance statsmodels supports for Logit (verify); influence flags the top 5 points with Cook's d > 4/n.
>
> **Audit resolution, round 2 (2026-10-03):** The Logit covariance is **not yet verified**; it's a docs-researcher item in session 1.

**Q7. Which effect sizes are reported?**
_Blocks: P16-01, FR-05._

> **Recommendation (Claude):** Cohen's d, Cramér's V, R², with small, medium and large labels.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Effect sizes **with CIs**: mean difference in original units plus Hedges' g (the small-sample-corrected d); risk difference and risk ratio (or odds ratio for logistic regression); Cramér's V; R² and adjusted R²; η² for ANOVA. **No generic small/medium/large labels**: interpretation is in the data's own units ("₱1,200 more per year, 95% CI …").
>
> **Why:** Cohen's labels are context-free conventions that mislead (a "small" effect can matter enormously). Original units are what the reader can act on, and they serve the headline rule (P10 Q1). Hedges' g corrects d's small-sample bias at no cost.
>
> **Rejected:** generic labels (misleading); standardised effects only (unactionable).
>
> **Recommendation was:** overturned (no labels; units first; Hedges' g).
>
> **Consequences:** P16-01 skill; the rubric's "conclusions supported" anchor rewards unit-based effects.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** This changes the rubric, so `bench/rubric/v2` is cut before calibration and score comparability with earlier judge scores is noted as broken.

**Q8. What exactly is the MVP gate?**
_Blocks: P16-08._

> **Recommendation (Claude):** The exit checklist as written: median of 3 dev runs per provider.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The exit checklist as written, plus a **pre-gate rule**: run the dev set once per provider first, and start the 3-run gate only if both single runs already meet the targets. If a gate run fails, the phase continues and the gate is re-run once after fixes. All inherited gates apply (M-04, PA-02, PA-03, PA-04, parity, M-11, M-12).
>
> **Why:** The 3-run gate costs about $78 (P12 Q7); spending it on a configuration that can't pass a single run wastes it. Re-running once after fixes bounds the cost of a failed gate.
>
> **Rejected:** gating straight away (wasted money on predictable failures); unlimited gate retries (overfitting the dev set by repetition).
>
> **Recommendation was:** refined (pre-gate rule, retry limit).
>
> **Consequences:** P16-08; the runner gets a `--gate` mode that enforces the pre-check.
>
> **Revisit if:** dev-set overfitting signs appear (holdout is the check in P22).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: **no gate retry** (D-036). One pre-gate dev run per provider on an identical build; the official gate is run and paid by a maintainer (P12 Q-J5). Spend ≈ $116 (Q-P3, Q-P4). Inherited gates add M-19 ≥ 90%, PA-09's half and M-03 ≥ 75%; EC16-1 counts only questions whose tools exist by P16 (Q-P6, Q-P7).
>
> **Audit resolution, round 2 (2026-10-03):** Pre-gate rule: the gate starts only after a pre-gate on the identical build meets every target; at most two pre-gates, both disclosed (Q-S5). Spend ≈ $140 including a void re-run contingency. The MVP is stated as a dev-only claim.
>
> **Audit resolution, round 3 (2026-10-03):** The subset holds 6–9 tasks, including SRM, weighted and regression tasks where the dev set has them; metrics under 5 tasks use point values, disclosed (Q-W3). Each gate run is its own $15 pass. If the second pre-gate fails, the MVP is not declared. The gate measures the bench build flavour, and M-11 is taken for the packaged build too.

**Q9. Is the judge's calibration part of the MVP gate?**
_Blocks: P16-07, EC16-4._

> **Recommendation (Claude):** Yes: M-17 must pass for MVP.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **No.** Calibration is done in P16 and its result is recorded (EC16-4), but M-17 is **not** an MVP gate. If it fails, M-16 simply stays unpublished and the rubric or judge is fixed in P17–P19. The MVP is declared on code-scored metrics only, consistent with P10 Q36.
>
> **Why:** Making the judge's calibration gate the MVP would let the evaluation model, which P10 Q36 said never gates, block the product indirectly. The MVP's claims are about correctness, which code measures.
>
> **Rejected:** M-17 as a gate (contradicts P10 Q36).
>
> **Recommendation was:** overturned (consistency with "the judge never gates").
>
> **Consequences:** EC16-4 wording ("recorded", not "met") as already written in the plan.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Superseded by the P10 answers (2026-10-03):** The judge may now block on clear failures (D-038, option B). M-17 calibration is still not an MVP gate, but blocking requires it.
>
> **Audit resolution (2026-10-03):** Calibration items come from runs that exist now (no skills, SQL-only baseline, full runs), since the critic and lessons don't exist yet. A judge block under D-038 is checked at this gate (EC16-5, Q-P8).
>
> **Audit resolution, round 2 (2026-10-03):** Calibration items come from P12, P14, P15 and pre-gate runs. The scorer writes `judge-floor.json`; a floor breach holds the gate until a peer records a decision (Q-S6).
>
> **Audit resolution, round 3 (2026-10-03):** A confirmed judge block fails the gate only if M-17 passed and the score isn't `same-model` (D-038); the peer's record is `judge-block.json`.

**Q10. How are the inference charts made?**
_Blocks: P16-06._

> **Recommendation (Claude):** The agent writes Vega-Lite specs following the `chart-style` skill.

> **Answer Q10:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **Code-owned templates.** `create_chart` gains a `template` mode (Q-Q, residuals vs fitted, CI forest, and later ROC/PR, confusion matrix, importance, forecast fan), where the agent supplies only data references and labels, and code builds the spec. Free-form specs stay available for exploratory charts, still sanitised (D-016, D-028).
>
> **Why:** Diagnostic charts have one correct form, and a free spec can quietly mislead (truncated axes, the wrong reference line on a Q-Q plot). Templates are consistent, themeable, testable, and cheaper in tokens. They also export to Altair identically (P10 Q11).
>
> **Rejected:** agent-written specs for diagnostics (error-prone and costly); a separate chart tool per type (tool sprawl).
>
> **Recommendation was:** overturned (templates for diagnostics).
>
> **Consequences:** P16-06; `src/shared/chartTemplates/` with snapshot tests; P17 and P18 add their templates.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Charts are built by **main** (the single artifact writer since P14) from journal outputs, ≤ 5,000 points with deterministic downsampling that keeps extremes; labels go only into title and text fields (Q-P9).
>
> **Audit resolution, round 2 (2026-10-03):** Chart labels are `z.string().max(120)`.

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                                                      | Recommendation     | Confidence | Needs maintainer           |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------ | ---------- | -------------------------- |
| Q1  | Recommended tools; no saving or splitting                                                                | kept               | High       | no                         |
| Q2  | Typed design in the plan; code maps it to acceptable tests                                               | **overturned**     | High       | no                         |
| Q3  | Claimed `tests[]` recomputed by the scorer; families by outcome column; instrumentation advisory (audit) | overturned (audit) | High       | **yes (Q-P1, Q-S1..Q-S4)** |
| Q4  | SRM at p < 0.001, a defined "no peeking", MDE and power; no CUPED                                        | refined            | High       | no                         |
| Q5  | Weights declared, never guessed; heuristics only suggest                                                 | **overturned**     | High       | no                         |
| Q6  | HC3 by default; diagnostics with thresholds; BP informational                                            | **overturned**     | High       | no                         |
| Q7  | Effects in original units + Hedges' g etc. with CIs; no generic labels                                   | **overturned**     | High       | no                         |
| Q8  | Up to two pre-gates on an identical build; no gate retry; maintainer-run gate (audit)                    | overturned (audit) | High       | **yes (Q-P3, Q-S5)**       |
| Q9  | Calibration recorded but not an MVP gate                                                                 | **overturned**     | High       | no                         |
| Q10 | Code-owned templates for diagnostic charts                                                               | **overturned**     | High       | no                         |

**Totals:** 10 answered · 1 kept · 2 refined · 7 overturned · 0 need the maintainer. The audit later raised Q-P1..Q-P9 and Q-S1..Q-S9 (`P16-audit.md`).

**Overturned recommendations:**

- Q2: a table only in a skill can't be checked or measured.
- Q3: self-listed tests let the agent hide the tests it didn't like.
- Q5: guessing weights from names silently corrupts estimates.
- Q6: test-then-switch for robust SEs is a flawed two-stage procedure.
- Q7: generic effect labels mislead, and original units are actionable.
- Q9: gating MVP on judge calibration contradicts "the judge never gates".
- Q10: diagnostic charts have one right form, which templates guarantee.

**For the maintainer:** none in the first pass; the audit raised Q-P1..Q-P9, Q-S1..Q-S9 and Q-W1..Q-W6 (`P16-audit.md`).

**Cross-question changes made in the consistency pass:**

- Q2's typed design feeds Q3's family counting and PA-05.
- Q9 aligns the plan's EC16-4 with P10 Q36.
- Q10's templates are reused by P17 and P18.

**Facts verified:** none needed beyond earlier phases.
