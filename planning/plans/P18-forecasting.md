# P18 Plan: Time-Series Forecasting

| Field     | Value                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P18 of P10–P23 (roadmap §10)                                                                                                                                                     |
| Milestone | v0.2 Modeling                                                                                                                                                                    |
| Objective | Forecast with honest baselines, backtests and intervals                                                                                                                          |
| Entry     | P17 closed; **the maintainer's approval of this phase's planned API spend (D-034) before the gate session (7)**                                                                  |
| Spend     | Planned **≈ $24**: one dev run per provider at the gate (D-036 fixed runs, no retry), no judge calls beyond D-038's floor check                                                  |
| Size      | L (7 sessions)                                                                                                                                                                   |
| Branch    | `phase-18-forecasting`                                                                                                                                                           |
| Inputs    | D-032, D-035, D-036, D-038 · P10 Q18 · P11-16 · P12-03, P12-04 · P13-11 · P14-11 (forecasts always temporal) · P17 (evaluation orchestration, model store) · P16 Q10             |
| Outputs   | D18-1 forecaster sub-agent + `forecasting` skill · D18-2 `backtest` tool, forecast evaluation and refit · D18-3 forecast checks · D18-4 fan-chart template · D18-5 bench results |
| Status    | Audited (3 rounds, `P18-audit.md`); all findings fixed; maintainer defaults pending (Q-U, Q-Y, Q-AC); awaiting sign-off                                                          |

**Rule for the phase:** univariate (plus calendar features and declared regressors) forecasting of
at most 5 series per analysis. No hierarchical or deep-learning models.

**Who computes what (roadmap §8.3 principles 1 and 7):**

- **Main, at `save_plan`:** the frequency from the modal timestamp delta in DuckDB, in bands
  (hourly 1 h ± 5 min; daily 1 day; **business-day** when only Monday–Friday occur, m = 5; weekly
  7 days; monthly 28–31 days; quarterly 89–92 days; yearly 365–366 days; anything else is refused),
  the seasonal period m (24, 7, 5, 52, 12, 4, 1; daily data adds yearly seasonality through Fourier
  terms), the gap count and the series key. These extend the split record (a schema bump with
  migration fixtures, NFR-18); no row read is needed. Multi-series (long-format) data uses **one
  global cutoff** per analysis, and the time detector checks ordering **within each series**.
- **The agent declares only** the family set it wants considered and the trend and damping
  options. **Code owns everything else** inside the backtest harness: KPSS-d and Fs-D **per fold**,
  per-fold AIC orders within each family, and the family choice by backtest MASE, written to a
  **`selection` record** (Q-Y2).
- **Code-owned harness (Q-Y3):** a **forecast-harness** kernel variant (amended into P13-11:
  fit-capable, code only, receives the train history, horizon timestamps and declared
  future-known regressor values, **never horizon actuals**; its own escape cases) runs
  `backtest(family_set, series_id)` on the train view only, the evaluation and the refit. It uses
  the evaluation slot; a `compute_busy` after the 60 s queue is retried once. `evaluate_on_test`
  accepts only a `selection` record id; a test-free **pre-flight** fits the selection on the train
  history for every series before dispatch. Main computes every metric. After the test lock is
  spent, the controller **refits the selection with the orders frozen from the evaluation fit**
  (recorded in the manifest) on the full history and returns the user's forecast with 80/95%
  bounds and output ids for citation; if the refit fails, the evaluated fit's forecast is shown
  flagged "refit failed". On the bench, `predictions_ref` reads from the refit; the future-known
  regressor values for the key's horizon come from P12-03's scoring-features dataset.
- Kernel instrumentation stays advisory.

**The series and the interface (P18 audit round 3, Q-AC1, Q-AC5):** `series_id` resolves **only**
to the split source's train view plus the series key; derived datasets are not accepted. Code
applies the plan's `sum`/`mean`/`last` aggregation; any other transform is a typed,
zod-validated `seriesTransform` (log, square root, Box–Cox with λ fixed in the spec) that code
replays on the train view, the test window and the full history, and the scorer recomputes fold
truth from the source. The tool is `backtest(family_set, options, regressors, seriesTransform?)`:
`options` are trend and damping; `regressors` must all be declared future-known in
`studyDesign` (validated here, which is the "spec validation" the checks refer to), and code
always uses all of them. The evaluation fit uses the **most frequent per-fold AIC orders** (ties:
the lowest total order), recorded in the **`selection` record** (schema in P11-09 with
`schemaVersion`: id, split id, family set, options, regressors, transform, per-fold orders,
metrics and 80/95% quantiles, chosen family and orders; stored in the journal and exported to
`bench/results/p18/`). `evaluate_on_test` dispatches by the split kind: a temporal split takes a
`selection` id, others a model id (P17).

**Compute budget (Q-AC2):** at most 16 SARIMA and 6 ETS fits per fold, each fold its own
execution; the Fourier fallback applies when a seasonal SARIMA fit at m = 12 takes more than
**5 s** (120 s ÷ the 22-fit grid with margin); at most **200 fits per analysis** (series × folds ×
fits), reducing folds to 2 first and refusing further series beyond that; backtests yield the
evaluation slot between folds, and a starved call is journalled as a `compute_busy` stop.

---

## 1. Inherited Decisions and Inputs

| Source         | What it forces in P18                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| D-035, P10 Q18 | Seasonal naive, ETS, SARIMA; rolling-origin folds by history; 80/95% intervals with coverage; MASE              |
| D-032          | 20 minutes of active time per analysis                                                                          |
| D-036          | Fixed runs; detections only from structured fields; a fixed dev set                                             |
| D-038          | The judge's floor applies at every gate                                                                         |
| P11-16, P14-11 | The final horizon is held by the host; forecasts always split temporally, by code; any dispatch spends the lock |
| P12-03, P12-04 | The key's held-back horizon; seasonal-naive reference; `predictions_ref`                                        |
| P13-11, P17    | Predict-only evaluation kernel; evaluation orchestration and model store                                        |
| P16 Q10        | Chart templates built by main                                                                                   |
| P10 Q33        | PA-07 becomes a gate                                                                                            |

## 2. Session Plan

| Session | Work items      | Output                                                                    |
| ------- | --------------- | ------------------------------------------------------------------------- |
| 1       | P18-01          | Forecaster role and skill; docs-researcher checks; SARIMA timing measured |
| 2       | P18-02          | Model specs; `backtest` tool                                              |
| 3       | P18-03          | Temporal evaluation, forecast predict harness, refit                      |
| 4       | P18-03 (checks) | Main-side checks                                                          |
| 5       | P18-04          | Fan chart                                                                 |
| 6       | tests, audit    | Contract, parity and actuals-echo tests                                   |
| 7       | P18-05          | Gate run (paid); summary                                                  |

## 3. Work Item Breakdown

Ids follow the roadmap: P18-01 forecaster, skill, frequency, gaps, decomposition, baseline; P18-02
models and backtest; P18-03 temporal split and checks; P18-04 chart; P18-05 bench.

### P18-01 Forecaster and skill

- [ ] Scope-table row (`src/main/agent/claude/subagents.ts`), OpenAI wrapper and parity test (DS-04, NFR-14)
- [ ] Frequency, m and gaps from main (above; the delta band is decided first, then the business-day rule, with holidays counted as gaps on the business-day grid); duplicate timestamps are a finding and are aggregated only by `sum`, `mean` or `last`; gaps become explicit missing values; **main owns the fill count**, comparing the null and row grid of the series passed to `backtest` with the source grid; fills not disclosed in `issues[]` raise a finding (Q-Y8)
- [ ] **Horizon** and **series key** are plan-locked fields in the app; **on the bench the task manifest's horizon wins** and the plan field is ignored; answer keys respect the horizon limit. The default horizon is min(m, 25% of the **full registered series**); a requested horizon beyond two seasonal periods or 25% of that length is refused by code at `save_plan` with a structured refusal record, which counts as an M-08 fail (Q-Y1)
- [ ] STL decomposition (robust) is shown by a skill step for the user; the **scored** seasonal strength Fs = max(0, 1 − Var(R)/Var(S+R)) is computed by code in the harness per fold and decides D (D = 1 when Fs ≥ 0.64)
- [ ] docs-researcher on the pinned Pyodide statsmodels: `ETSModel` (no missing values and no exogenous terms: ETS is offered only for gap-free series, and Fourier terms only in SARIMAX) and its simulated intervals; `SARIMAX.get_forecast().conf_int`; KPSS. **SARIMA timing rule (Q-Y6):** measured in session 1 on the P13 reference runner; if a seasonal SARIMA fit at m = 12 takes more than 10 s, seasonal SARIMA is dropped and seasonality comes from Fourier terms with a non-seasonal ARIMA; seasonal SARIMA is never used for m > 12. Each fold's fit is its own execution under the 120 s limit

**Done when:** main's frequency, m and gap values match fixtures for every allowed frequency.

### P18-02 Models and backtest

- [ ] Families: seasonal naive; ETS (gap-free series only; multiplicative seasonality only on strictly positive data, otherwise additive); SARIMA with the grid p, q, P, Q ∈ {0, 1} (subject to the timing rule); SARIMAX with Fourier terms, calendar features or declared regressors (Q3, Q5)

**Done when:** every family fits a fixture series in the harness within the timing rule.

- [ ] `backtest(...)` per the header, on the train view only; rolling origin with window = h, step = h, minimum training 2m, up to 5 folds. **With one fold** the family is chosen on that fold's MASE and flagged "weakly validated"; **with none**, the family is ETS (seasonal naive when the series has gaps) and the forecast is "unvalidated" (P10 Q18) (Q-AC3); a backtest killed at 120 s is recorded with a status and retried once with fewer folds
- [ ] At most **5 series per analysis**, evaluated in **one batch** (Q6) after the pre-flight: a **kill** during dispatch spends the lock for every series and no refit follows; a **host crash** resumes the same selection against the same `evaluation_dispatched` record (P11-16); per-series status records

**Done when:** a backtest, a pre-flight and a batch evaluation run end to end on fixtures.

### P18-03 Temporal evaluation and checks

- [ ] `evaluate_on_test(selection_id)`: the forecast harness receives only horizon timestamps and declared future-known regressor values, forecasts multi-step only, and returns point forecasts and 80/95% quantiles; main computes MASE, coverage and the Winkler score; a test plants an actuals-echo model and must fail to see actuals
- [ ] **Refit:** a durable `refit_pending` record is written before the refit; a restart retries it (the lock isn't involved). The agent receives a capped summary (D-033) plus output ids, never the full forecast table. ETS simulated intervals use the analysis seed. **In the app**, future values of declared regressors come from a dataset the user registers as "future regressor values" in the Study design panel (zod IPC channel), validated to cover the whole horizon or the refit is refused (Q-AC4); on the bench they come from the scoring-features dataset, which P17-05's predict-only allowlist is amended to let the refit read
- [ ] **Main-side checks:** silent interpolation (main's own fill count, above); **undeclared regressors are refused at spec validation** (a structured record of the attempt), so a leaky covariate can reach a model only through the `studyDesign` record; for regressors in a dispatched spec, an informational lead/lag check at lag 1 after first differencing; a missing baseline; random splits on time data are impossible by construction (P14-11) and are tested (Q-Y7)
- [ ] Fold coverage is measured on the same folds that chose the family, so it is somewhat optimistic; the report and `docs/ds/p18` say so

**Done when:** each check has a positive and a negative fixture.

- [ ] **Future-known regressors** are external design fields in the `studyDesign` record (P16), extended here with a UI field, the zod IPC channel (rule 3) and the bench manifest path (B2)

### P18-04 Chart

- [ ] Fan chart built by main: history, backtest overlays (from `backtest`), the refit forecast with 80% and 95% bands, the seasonal-naive baseline dashed; the test-window forecast and actuals appear **only in the UI**, never as an agent-referencable chart (Q7)

**Done when:** the chart renders from fixtures.

### P18-05 Bench

- [ ] One dev run per provider (D-036); EC18-1..3 and the inherited gates (Q8); the dev forecast task count is pinned in `docs/ds/05`

**Done when:** §5 is recorded.

## 4. Deliverable Map

| Deliverable | File path                                                                                                                                                                                                                                                                                                    | Produced by | Satisfies |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------- |
| D18-1       | `src/main/agent/claude/subagents.ts`; `resources/agent-plugin/skills/forecasting/`; OpenAI wrapper                                                                                                                                                                                                           | P18-01      | EC18-1    |
| D18-2       | `src/mcp-server-ds/tools/{backtest,evaluate}.ts`; `src/main/analysis/controller/` (frequency bands, split-record extension, selection records, refit, batch evaluation, pre-flight); `src/main/models/` forecast metrics; the P13-11 forecast-harness amendment                                              | P18-02, 03  | EC18-1    |
| D18-3       | `src/main/checks/temporal.ts`                                                                                                                                                                                                                                                                                | P18-03      | EC18-2    |
| D18-4       | `src/shared/chartTemplates/forecastFan.ts`                                                                                                                                                                                                                                                                   | P18-04      | DoD-2     |
| D18-5       | `bench/results/p18/`                                                                                                                                                                                                                                                                                         | P18-05      | EC18-1..3 |
| D18-6       | Tests (frequency fixtures incl. business days, actuals-echo, pre-flight, parity, golden vectors for coverage and Winkler); the `studyDesign` extension (future-known regressors, bench horizon) with its UI field and IPC channel; the split-record migration; the smoke-gate D-NNN; `docs/ds/07`, `08` rows | all         | DoD-2     |

## 5. Exit Checklist

| EC / DoD  | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence             | State |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----- |
| EC18-1    | **Smoke gate, non-statistical** (no interval at this n; accepted by a D-NNN, Q-U5) on the dev forecast tasks pinned in `docs/ds/05`, each with a history of **at least 2m + 3h** so folds exist: M-08 ≥ 60%, scored only when `predictions_ref` resolves to the **controller's refit artifact for the evaluated selection** and covers exactly the key's timestamps (otherwise a fail; refusals are fails); **PA-07 = 100%**, where a forecast plan that never reaches `evaluate_on_test` counts as a fail, with the "beats seasonal naive" share reported over tasks with ≥ 2 folds (Q-Y5); **80% coverage within ±10 points on the scorer's recomputation of the backtest folds from the source**, per provider; 0/0 fails; key-horizon coverage is information only (Q-Y4) | `bench/results/p18/` | Open  |
| EC18-2    | Look-ahead: undeclared regressors are refused (unit test), and attempts on the dev look-ahead instance are recorded per provider; M-03 ≥ 75% on the gate run; the holdout instance is reported at P22                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | same                 | Open  |
| EC18-3    | D-038's floor: the scorer's `judge-floor.json` shows no unresolved breach                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | same                 | Open  |
| Inherited | M-01, M-02 and M-03 (EC16-1), M-04 = 0, M-19 ≥ 90%, M-06 = 0, M-07 ≥ 0.90, M-09 and M-10 (EC16-3), PA-02..PA-06, PA-09 half, M-11 = 0 (per build), M-12 = 0 (Q-Y9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | bench                | Open  |
| DoD 1–8   | As roadmap §17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | —                    | Open  |

## 6. Phase Risks

| Risk                                              | Mitigation                                               |
| ------------------------------------------------- | -------------------------------------------------------- |
| SARIMA fits too slow in wasm (R-02)               | Small grid; fit count; measured in session 1; ≤ 5 series |
| Short histories make backtests meaningless (R-05) | The fold rule and the "unvalidated" disclosure (P10 Q18) |
| statsmodels APIs differ in Pyodide (R-12)         | docs-researcher in session 1                             |
| Forecasts start stale after the split             | The refit on the full history after the lock is spent    |

## 7. Hand-off to P19, P21 and P22

- Temporal checks join the method-check registry the critic reads
- The refit, the plan-locked horizon and the `predictions_ref` interval columns, which P21's fan chart in reports and P22's evaluation use
