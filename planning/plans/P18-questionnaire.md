# P18 Questionnaire: Decisions Needed Before Forecasting

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle how time series are prepared, modelled, evaluated and gated                                                           |
| Already decided | P10 Q18, Q33; P17 Q1; P16 Q10; D-030..D-045 (draft, `planning/decisions-draft.md`); P11–P17 as audited                       |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation |

---

**Q1. How are frequency and gaps handled?**
_Blocks: P18-01._

> **Recommendation (Claude):** Infer the frequency with pandas and interpolate gaps.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Infer the frequency (`pd.infer_freq` on the sorted, de-duplicated index). Duplicate timestamps are a finding, and they are aggregated only by a rule the plan states. Gaps become **explicit missing values**, **never silently interpolated**: models that handle missing values use them as missing; otherwise interpolation is an explicit, disclosed step with the count of filled points. An irregular series is aggregated to a regular frequency the plan names, with disclosure.
>
> **Why:** Silent interpolation invents data. On a series with long gaps it fabricates trend and seasonality, and the backtest then validates the invention. Disclosing every fill keeps the report honest and makes the P18-03 "silent interpolation" check computable.
>
> **Rejected:** automatic interpolation (invented data); dropping gaps (breaks seasonal alignment).
>
> **Recommendation was:** overturned (explicit missing values; disclosed fills only).
>
> **Consequences:** P18-01 skill; P18-03 check from instrumentation (`interpolate`, `fillna` on a time index).
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: main computes frequency (modal delta in DuckDB, an allowed set), m and the gap count at `save_plan`; `pd.infer_freq` returns `None` on gappy indexes. Silent interpolation is detected in main by comparing the report's structured `fills` count with main's gap count, not by instrumentation. Duplicates are aggregated only by `sum`, `mean` or `last`.
>
> **Audit resolution, round 2 (2026-10-03):** Frequency bands are explicit (including business days, m = 5); anything else is refused. Main owns the fill count by comparing the grids of the series passed to `backtest` with the source (Q-Y8). Multi-series data uses one global cutoff.
>
> **Audit resolution, round 3 (2026-10-03):** `series_id` resolves only to the split source's train view; code applies the aggregation, and any other transform is a typed `seriesTransform` replayed by code everywhere, so the agent can't shape fold truth (Q-AC1). Fills not disclosed in `issues[]` raise a finding.

**Q2. What is the default forecast horizon?**
_Blocks: P18-01._

> **Recommendation (Claude):** Whatever the user asks for.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The user's horizon when given. The default is **one seasonal period** (e.g. 12 for monthly data). Horizons beyond **two seasonal periods, or beyond 25% of the history length**, are refused with an explanation and a suggested shorter horizon.
>
> **Why:** "Whatever the user asks" lets the agent produce a five-year forecast from three years of data, whose intervals mean nothing. A refusal with a reason teaches more than a confident fan chart.
>
> **Rejected:** no limit (meaningless long-range forecasts); a fixed horizon (ignores the question).
>
> **Recommendation was:** overturned (default plus limits).
>
> **Consequences:** P18-01; a forecast trap with an over-long requested horizon.
>
> **Revisit if:** users have legitimate long-horizon needs (then show a scenario band, not a forecast).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The default is **min(m, 25% of the history)**, so it is never refused by its own limit; daily data uses m = 7 with yearly Fourier terms. The refusal is a structured record written by code at `save_plan`, excluded from M-08's denominator; it isn't a trap detection.
>
> **Audit resolution, round 2 (2026-10-03):** On the bench the horizon comes from the task manifest; a refused or mismatched horizon is an M-08 **fail**, never excluded (Q-Y1).
>
> **Audit resolution, round 3 (2026-10-03):** "25% of the history" means the full registered series; on the bench the manifest horizon wins.

**Q3. How big is the SARIMA search?**
_Blocks: P18-01._

> **Recommendation (Claude):** p, q ∈ {0,1,2}, d ∈ {0,1}, seasonal P, D, Q ∈ {0,1}, best by AIC.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **16 configurations at most**: p, q ∈ {0,1}, d from a unit-root test (KPSS/ADF on the training part, at most 1), seasonal (P, Q) ∈ {0,1}, and D from a seasonal-strength test. Configurations are ranked by AIC on training data only, inside a 60 s time box. ETS is chosen among additive or damped trend, with seasonal additive or multiplicative (≤ 6 configurations).
>
> **Why:** The recommended grid (3 × 2 × 3 × 2 × 2 × 2 = 144 fits) can't run inside the 120 s per-execution limit in single-threaded wasm (P10 Q10). Picking d and D by test instead of searching them cuts the grid by 4× with little loss.
>
> **Rejected:** the 144-model grid (breaks the time limit); auto-ARIMA (not shipped, P10 Q18).
>
> **Recommendation was:** overturned (a tested d and D with a small grid inside a time box).
>
> **Consequences:** P18-01; P13-05's perf measure includes a 16-model SARIMA run.
>
> **Revisit if:** M-08 suffers because the grid is too small.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** AIC selects orders **within a family per fold**; the family is chosen by backtest MASE (AIC can't compare ETS with SARIMA). d comes from KPSS only; D from STL seasonal strength computed by code. A fixed grid order with a fit count replaces the time box, so the result doesn't depend on machine speed. SARIMA timing is measured in session 1 (P13's spec didn't include it).
>
> **Audit resolution, round 2 (2026-10-03):** Superseding round 1: the agent declares only the family set and trend/damping options; code computes d, D and per-fold orders and picks the family, writing a `selection` record; the refit reuses the evaluated orders (Q-Y2). Timing rule: seasonal SARIMA is dropped if a fit at m = 12 takes over 10 s, and never used above m = 12 (Q-Y6). ETS is offered only for gap-free series.
>
> **Audit resolution, round 3 (2026-10-03):** The tool is `backtest(family_set, options, regressors, seriesTransform?)`; code always uses all declared regressors; the evaluation fit uses the most frequent per-fold AIC orders, recorded in a `selection` record (P11-09 schema) (Q-AC5). Budget: ≤ 16 SARIMA + 6 ETS fits per fold, the Fourier fallback above 5 s per fit, ≤ 200 fits per analysis (Q-AC2). With one fold the family is chosen on it ("weakly validated"); with none it defaults to ETS or seasonal naive ("unvalidated") (Q-AC3).

**Q4. How does the test lock work for forecasts?**
_Blocks: P18-02, M-06._

> **Recommendation (Claude):** The final horizon is held by the host; models are selected with a
> rolling-origin backtest on the history before it; one final evaluation.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended. The final horizon's rows are held by the host (as in P17 Q1). Selection uses the rolling-origin backtest on the earlier history (fold count per P10 Q18), and the single `evaluate_on_test` returns MASE, sMAPE (information only) and the **empirical coverage** of the 80% and 95% intervals with their CIs.
>
> **Why:** Reusing P17's mechanism keeps one test-lock implementation. Coverage on unseen data is what tells whether the intervals are honest, which is a key part of M-08's meaning.
>
> **Rejected:** evaluating on the backtest only (the last fold was used for selection, so it is no longer held out).
>
> **Recommendation was:** kept (metric list specified).
>
> **Consequences:** P18-02.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Selection and backtesting run in a **code-owned `backtest` tool** (window = h, step = h, minimum training 2m, ≤ 5 folds; metrics in main) (Q-U2). Coverage is pooled across tasks for the gate; per-analysis coverage is information only. After the lock is spent, the controller **refits the spec on the full history** for the user's forecast and the bench's `predictions_ref` (Q-U1). The evaluation kernel never receives actuals.
>
> **Audit resolution, round 2 (2026-10-03):** A fit-capable **forecast-harness** kernel variant (P13-11) runs backtest, evaluation and refit, never seeing horizon actuals; a test-free pre-flight precedes dispatch (Q-Y3). Coverage is gated on the scorer's recomputation of backtest folds; key-horizon coverage is information only (Q-Y4). At least 2 folds, or the forecast is "unvalidated".
>
> **Audit resolution, round 3 (2026-10-03):** Kill vs crash: a kill spends the lock with no refit; a crash resumes the same selection. In the app, future regressor values come from a user-registered dataset in the Study design panel (Q-AC4). `predictions_ref` must resolve to the controller's refit for the evaluated selection. Fold coverage is disclosed as somewhat optimistic.

**Q5. Which external regressors are allowed?**
_Blocks: P18-01._

> **Recommendation (Claude):** Calendar features and public-holiday calendars.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Calendar features computed by code (day of week, month, quarter, end of month, Fourier terms for seasonality) and **regressor columns the user supplies** (e.g. their own holiday flag or promotions). **No bundled holiday calendars** in v1.0. A future-known regressor must be available for the whole horizon, or it is refused.
>
> **Why:** A holiday library is another package (size, P10 Q9) whose country rules change yearly, which would silently date a frozen install. The "known for the horizon" rule is the look-ahead check that matters most for regressors.
>
> **Rejected:** holiday calendars (package and staleness); arbitrary covariates without the availability check (look-ahead).
>
> **Recommendation was:** overturned (no bundled calendars; availability rule).
>
> **Consequences:** P18-01; P18-03 checks horizon availability.
>
> **Revisit if:** users repeatedly ask for holidays (then a small, versioned table under user control).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** "Future-known" is an external design field in the `studyDesign` record, never agent text (Q-U6). OLS on calendar features is dropped for SARIMAX with exogenous regressors, whose intervals account for autocorrelation.
>
> **Audit resolution, round 2 (2026-10-03):** Undeclared regressors are refused at spec validation; future-known regressors come only from the `studyDesign` record, extended here with a UI field, IPC channel and bench path (Q-Y7).

**Q6. How many series can one analysis forecast?**
_Blocks: P18-01._

> **Recommendation (Claude):** Any number, looping over them.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** At most **20 series per analysis**, each modelled independently with the same configuration-selection rule. A summary reports how many series beat seasonal naive. More series need aggregating or sampling first (disclosed). Hierarchical reconciliation is out of v1.0.
>
> **Why:** Unlimited looping blows the wall clock (20 min) and the context (one summary per series). Twenty is enough for a portfolio demo and for most small-business questions, and the summary keeps context bounded.
>
> **Rejected:** unlimited (time and context blow-up); single series only (too narrow).
>
> **Recommendation was:** overturned (cap plus summary).
>
> **Consequences:** P18-01.
>
> **Revisit if:** P13/P18 timing shows room for more.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: at most **5 series** per analysis, evaluated in one batch; one kill spends the lock for all of them (Q-U8).

**Q7. What does the forecast chart show?**
_Blocks: P18-04._

> **Recommendation (Claude):** History, forecast and intervals.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** A template with history; **backtest forecasts overlaid on the actuals** for each fold; the final forecast with 80% and 95% bands; the seasonal-naive baseline as a dashed line; and the final holdout's actuals once evaluated. The axis starts at a sensible point, never truncated to exaggerate.
>
> **Why:** Showing the backtests and the baseline is what lets a reader judge the forecast at a glance; a fan alone looks equally confident whether it is good or bad.
>
> **Rejected:** the forecast fan alone (no evidence of skill).
>
> **Recommendation was:** refined (backtest overlay, baseline).
>
> **Consequences:** P18-04 template with snapshot tests.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Test-window forecasts and actuals are UI-only, never an agent-referencable chart; backtest overlays come from the code-owned tool.

**Q8. What are the gate values?**
_Blocks: EC18-1, EC18-2._

> **Recommendation (Claude):** M-08 ≥ 60% and look-ahead detection ≥ 80%.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, plus **80% interval coverage within ±10 points of nominal** across forecast tasks, **PA-07** (temporal split used and beats baseline), and the over-long-horizon refusal (Q2) counted as a detection.
>
> **Why:** M-08 can be met with a point forecast and bad intervals; the coverage gate makes the intervals count too.
>
> **Rejected:** a point-accuracy-only gate.
>
> **Recommendation was:** refined (coverage and PA-07).
>
> **Consequences:** EC18-1 (already written to include coverage).
>
> **Revisit if:** too few forecast tasks make coverage noisy (pool backtest folds).
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: M-08 means the agent's MASE is below the seasonal-naive forecast's MASE on the key's horizon, m from the key (Q-U4). EC18-1 is a smoke gate on the 2–3 dev forecast tasks, accepted by a D-NNN; no tasks are added to the fixed dev set (Q-U5). PA-07 ≥ 60% at MVP from the `backtest` tool (Q-U3). The over-long-horizon refusal isn't counted as a detection. EC18-2 is gated with M-03. Spend ≈ $24 (Q-U7).
>
> **Audit resolution, round 2 (2026-10-03):** PA-07 is structural (100%), with the "beats naive" share reported over tasks with ≥ 2 folds (Q-Y5). EC18-1 is a non-statistical smoke gate on tasks pinned in `docs/ds/05`. Inherited gates include M-01..M-03 and M-09/M-10 (Q-Y9).
>
> **Audit resolution, round 3 (2026-10-03):** The original "look-ahead detection ≥ 80%" is superseded by EC18-2's refusal test and recorded attempts. Forecast tasks need a history ≥ 2m + 3h, and a plan that never reaches `evaluate_on_test` fails PA-07.

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                                             | Recommendation  | Confidence | Needs maintainer           |
| --- | ----------------------------------------------------------------------------------------------- | --------------- | ---------- | -------------------------- |
| Q1  | Main computes frequency bands, m and gaps; main owns the fill count (audit)                     | overturned      | High       | **yes (Q-Y8)**             |
| Q2  | Default min(m, 25%); refusals count as M-08 fails; bench horizon from the manifest (audit)      | overturned      | High       | **yes (Q-Y1)**             |
| Q3  | Code owns orders and family via `selection` records; fit-count grid; timing rule (audit)        | overturned      | Medium     | **yes (Q-Y2, Q-Y6)**       |
| Q4  | Forecast harness; pre-flight; refit with frozen orders; coverage on backtest folds (audit)      | refined (audit) | Medium     | **yes (Q-U1, Q-Y3, Q-Y4)** |
| Q5  | SARIMAX with regressors; undeclared regressors refused; future-known from `studyDesign` (audit) | overturned      | High       | **yes (Q-U6, Q-Y7)**       |
| Q6  | ≤ 5 series in one batch (audit)                                                                 | overturned      | High       | **yes (Q-U8)**             |
| Q7  | Fan with backtest overlays and the baseline                                                     | refined         | High       | no                         |
| Q8  | Smoke gate; PA-07 structural; full inherited gates (audit)                                      | refined (audit) | Medium     | **yes (Q-U5, Q-Y5, Q-Y9)** |

**Totals:** 8 answered · 1 kept · 2 refined · 5 overturned · 0 need the maintainer. The audit raised Q-U1..Q-U8 and Q-Y1..Q-Y9 (`P18-audit.md`). (superseded by the audit: see `P18-audit.md`)

**Overturned recommendations:**

- Q1: silent interpolation invents data, and the backtest then "validates" it.
- Q2: unlimited horizons produce meaningless intervals.
- Q3: 144 SARIMA fits can't run in a 120 s wasm execution.
- Q5: a holiday library adds size and goes stale in a frozen install.
- Q6: unlimited series blow the time and context budgets.

**For the maintainer:** none in the first pass; see `P18-audit.md`.

**Cross-question changes made in the consistency pass:**

- Q3's time box fits P10 Q10's 120 s limit.
- Q4 reuses P17 Q1's host-held test mechanism.

**Facts verified:**

- **To verify:** SARIMA fit times in Pyodide (P13-05).
