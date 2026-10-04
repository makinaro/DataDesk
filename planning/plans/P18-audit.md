# P18 Audit: Blind Review and Resolution

| Field   | Value                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| Auditor | `plan-auditor` agent (context-blind, read-only), run 2026-10-03                                                |
| Scope   | `P18-forecasting.md` and the answered `P18-questionnaire.md`, against D-030..D-045 and P11–P17                 |
| Verdict | Round 1: **BLOCKED (decision needed)**. Critical 2 · Major 27 · Minor 15                                       |
| Status  | Round-1 findings fixed; eight maintainer questions answered with defaults, **pending maintainer** (Q-U1..Q-U8) |

---

## Round 1 report (summary)

- **[Critical] No code path produced a forecast from the latest data:** the held-back horizon stays hidden, so the user's forecast would start H steps stale, and on the bench M-08 was structurally biased.
- **[Critical] PA-07 couldn't be measured** (backtests ran in agent code) and contradicted EC18-1.
- **[Major] Architecture:** selection and backtesting in agent code; frequency, m and gaps from the kernel; no owner for the horizon.
- **[Major] Decisions:** instrumentation-based checks; the agent passing `kind`; 20 series vs the 20-minute cap and one evaluation; prose refusal counted as a detection; added trap tasks vs the fixed dev set.
- **[Major] Recommendations:** `infer_freq` fails on gaps; the default horizon contradicted its own limit; AIC across families and selection leakage; invalid coverage CIs; "future-known" set by the agent; Q6's cap; test-window series agent-visible.
- **[Major] Buildability:** unverified statsmodels APIs and no seasonal-strength test; a false P13 SARIMA claim; no forecast-mode predict or interval columns.
- **[Major] Operability:** a kill during a multi-series evaluation.
- **[Major] Measurability:** two M-08 formulas; denominators of 1–3; coverage source unspecified; EC18-2 without M-03; spend, gate owner, judge block and inherited gates missing.
- **[Major] Safety:** an actuals-echo model in the evaluation kernel; injected look-ahead; suppressed interpolation findings; gaming m.
- **[Major] Statistics:** selection leakage; OLS intervals ignoring autocorrelation; pre-plan profiling reads.
- **Minor:** ETS multiplicative fallback; ids vs the roadmap; paths; §1 sources; decomposition missing; done-when lines; risks; parity test; hand-off; undefined computations; size.

## Round 1 resolution (2026-10-03)

| Finding                                                               | Severity | Resolution                                                                                                                                                                                     | Where                   |
| --------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| No forecast from the latest data                                      | Critical | Controller refits the typed spec on the full history after the lock; `predictions_ref` reads the refit (Q-U1)                                                                                  | Plan header, P18-03     |
| PA-07 unmeasurable                                                    | Critical | Code-owned `backtest` tool; PA-07 redefined with an MVP value of 60% (Q-U2, Q-U3)                                                                                                              | P18-02, EC18-1, roadmap |
| Frequency, m, gaps, horizon owners                                    | Major    | Main computes them at `save_plan`; horizon and series key plan-locked                                                                                                                          | Plan header, P18-01     |
| Instrumentation checks; agent `kind`                                  | Major    | Main-side checks; P14-11's code-chosen temporal split                                                                                                                                          | P18-03                  |
| 20 series                                                             | Major    | ≤ 5 series, one batch evaluation (Q-U8)                                                                                                                                                        | P18-02                  |
| Prose refusal as detection; extra tasks                               | Major    | Structured refusal excluded from M-08; smoke gate on existing tasks by D-NNN (Q-U5)                                                                                                            | P18-01, EC18-1          |
| Q1–Q7 method issues                                                   | Major    | Modal-delta frequency; default min(m, 25%); per-family AIC with backtest MASE; KPSS; fit count; pooled coverage; authority field for future-known regressors (Q-U6); UI-only test-window chart | P18-01..04, resolutions |
| Unverified APIs; P13 claim; forecast predict                          | Major    | docs-researcher items; SARIMA timing in session 1; forecast predict harness with interval columns                                                                                              | P18-01, P18-03          |
| Multi-series kill                                                     | Major    | Stated: one kill spends the lock for all; per-series status records                                                                                                                            | P18-02                  |
| M-08 formula; denominators; coverage source; M-03; recurring gaps     | Major    | M-08 defined against seasonal-naive MASE (Q-U4); smoke gate; `predictions_ref` coverage; M-03 ≥ 75%; spend ≈ $24 (Q-U7); judge floor; named inherited gates                                    | §5, roadmap             |
| Actuals echo; injected look-ahead; suppressed interpolation; m gaming | Major    | No actuals in the evaluation kernel with a test; authority field; `fills` vs gap count; m from main                                                                                            | Plan header, P18-03     |
| OLS intervals; pre-plan reads                                         | Major    | SARIMAX with regressors; frequency and gaps from a main aggregate at `save_plan`                                                                                                               | P18-02, P18-01          |
| Minors                                                                | Minor    | Additive fallback; ids aligned; full paths; §1 sources; STL item; done-when line; R-02, R-05, R-12; parity test; hand-off fields; look-ahead computation; aggregation rule set; size L         | plan, roadmap           |

## Questions for the maintainer (defaults applied)

- **Q-U1. Refit for the real forecast.** Default: after evaluation, code refits the chosen model on all the data to produce your forecast. **Agreed (2026-10-04).**
- **Q-U2. Backtesting by code.** Default: a code-owned backtest tool runs model selection. **Agreed (2026-10-04).**
- **Q-U3. PA-07 at MVP.** Default: ≥ 60%. **Agreed (2026-10-04).**
- **Q-U4. What "beats seasonal naive" means.** Default: lower MASE than the seasonal-naive forecast on the held-back horizon. **Agreed (2026-10-04).**
- **Q-U5. Few forecast tasks.** Default: accept a smoke gate on the 2–3 dev forecast tasks (recorded as a decision) rather than add paid tasks. **Agreed (2026-10-04).**
- **Q-U6. Future-known regressors.** Default: only you or the task can mark one. **Agreed (2026-10-04).**
- **Q-U7. P18 spend.** Default: **≈ $24**. **Agreed after discussion (2026-10-04).**
- **Q-U8. Series per analysis.** Default: at most 5. **Agreed (2026-10-04).**

## Round 2 re-audit (2026-10-03)

Verdict **BLOCKED (decision needed)**: Critical 0 · Major 14 · Minor 15. Both round-1 Criticals landed (partly).

### Findings and resolution

| Finding                                                      | Severity | Resolution                                                                                                                                                                                                                                                                                            | Where                             |
| ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Selection split across agent, skill and tool; refit unpinned | Major    | Agent declares family set only; code picks orders and family into a `selection` record; refit reuses frozen orders (Q-Y2)                                                                                                                                                                             | Plan header, P18-02               |
| M-08 denominator vs roadmap; agent-controlled horizon        | Major    | Refusals and mismatches count as fails; bench horizon from the manifest (Q-Y1)                                                                                                                                                                                                                        | P18-01, EC18-1                    |
| External field misnamed, no path                             | Major    | `studyDesign` extended with UI field, IPC channel and bench path                                                                                                                                                                                                                                      | P18-03, D18-6                     |
| No kernel can fit a spec                                     | Major    | Forecast-harness variant in P13-11 (Q-Y3)                                                                                                                                                                                                                                                             | Plan header, P13-11               |
| SARIMA timing                                                | Major    | Per-fold executions; drop seasonal SARIMA above 10 s at m = 12 or for m > 12 (Q-Y6)                                                                                                                                                                                                                   | P18-01                            |
| Slots and leases                                             | Major    | Harness on the evaluation slot with one retry                                                                                                                                                                                                                                                         | Plan header                       |
| Smoke-gate statistics; task count                            | Major    | Labelled non-statistical; count pinned in `docs/ds/05`                                                                                                                                                                                                                                                | EC18-1, P18-05                    |
| PA-07 ambiguous                                              | Major    | Structural 100% tied to the dispatched selection; "beats naive" over ≥ 2-fold tasks (Q-Y5)                                                                                                                                                                                                            | EC18-1, roadmap                   |
| Inherited gates incomplete                                   | Major    | M-01..M-03 and M-09/M-10 added (Q-Y9)                                                                                                                                                                                                                                                                 | §5                                |
| Look-ahead check ill-posed                                   | Major    | Undeclared regressors refused; informational lag-1 check on dispatched regressors (Q-Y7)                                                                                                                                                                                                              | P18-03, EC18-2                    |
| Fill count self-reported                                     | Major    | Main computes it from the grids (Q-Y8)                                                                                                                                                                                                                                                                | P18-01                            |
| Pooled coverage is noise                                     | Major    | Gate on scorer-recomputed backtest-fold coverage per provider (Q-Y4)                                                                                                                                                                                                                                  | EC18-1                            |
| Minors                                                       | Minor    | ETS limits; pre-flight; refit failure and citation; backtest train-view rule; fold minimum and per-fold tests; roadmap size and §8.1 tools; split-record migration; summary rows; multi-series cutoff and detector; D-NNN deliverable; M-03 scope; frequency bands and business days; done-when lines | plan, questionnaire, roadmap, P13 |

### Questions for the maintainer, round 2 (defaults applied)

- **Q-Y1. Horizon on the benchmark.** Default: from the task; a refused or mismatched horizon counts as a miss. **Agreed (2026-10-04).**
- **Q-Y2. Who picks the model.** Default: the agent picks families to try; code picks orders and the winner. **Agreed (2026-10-04).**
- **Q-Y3. Forecast kernel.** Default: a code-only fitting kernel that never sees the held-back values. **Agreed (2026-10-04).**
- **Q-Y4. Coverage gate.** Default: on backtest folds recomputed by the scorer. **Agreed (2026-10-04).**
- **Q-Y5. PA-07.** Default: structural 100%; "beats naive" reported. **Agreed (2026-10-04).**
- **Q-Y6. Slow SARIMA.** Default: fall back to Fourier terms. **Agreed (2026-10-04).**
- **Q-Y7. Undeclared regressors.** Default: refused. **Agreed (2026-10-04).**
- **Q-Y8. Fill count.** Default: computed by main. **Agreed (2026-10-04).**
- **Q-Y9. Inherited gates.** Default: all earlier gates, including accuracy, cost and time. **Agreed (2026-10-04).**

## Round 3 re-audit (2026-10-03)

Verdict **BLOCKED (decision needed)**: Critical 0 · Major 5 · Minor 18 · Nit 1. This was the last round allowed, so the remaining decisions go to the maintainer with defaults applied.

### Findings and resolution

| Finding                                                | Severity | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                        | Where                         |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Backtest input could be an agent-shaped derived series | Major    | Train view of the split source only; code aggregation and typed `seriesTransform`; fold truth recomputed from the source (Q-AC1)                                                                                                                                                                                                                                                                                                                  | Plan header                   |
| Fit threshold and per-analysis budget                  | Major    | 5 s threshold; ≤ 16 + 6 fits per fold; ≤ 200 fits per analysis; slot yielding and `compute_busy` stop (Q-AC2)                                                                                                                                                                                                                                                                                                                                     | Plan header                   |
| 0–1 folds on typical histories                         | Major    | One-fold and zero-fold rules; tasks pinned with ≥ 2m + 3h history; 0/0 fails (Q-AC3)                                                                                                                                                                                                                                                                                                                                                              | P18-02, EC18-1                |
| No app source for future regressor values              | Major    | A user-registered "future regressor values" dataset through the Study design panel, validated for the horizon (Q-AC4)                                                                                                                                                                                                                                                                                                                             | P18-03                        |
| Agent/code interface unspecified                       | Major    | Full `backtest` signature; all declared regressors used; evaluation orders rule; `selection` record schema in P11-09 (Q-AC5)                                                                                                                                                                                                                                                                                                                      | Plan header, P11              |
| Minors and nit                                         | Minor    | Kill vs crash; P17-05 allowlist amended for the refit; capped refit summary; seeded ETS intervals; backtest status and retry; slot starvation; `refit_pending`; persisted fold quantiles; `predictions_ref` resolution check; optimistic fold coverage disclosed; business-day order; 25% basis; dispatch by split kind; "selection record" naming; bench horizon precedence; summary note; Q8 superseded; fill pass/fail rule; fit count numbers | plan, questionnaire, P11, P17 |

### Questions for the maintainer, round 3 (defaults applied)

- **Q-AC1. What backtests may read.** Default: only the original series' training part, plus typed transforms code replays. **Agreed (2026-10-04).**
- **Q-AC2. Compute budget.** Default: at most 200 model fits per analysis, 5 s per fit before falling back. **Agreed (2026-10-04).**
- **Q-AC3. Short histories.** Default: one fold is "weakly validated"; none falls back to ETS and is "unvalidated". **Agreed (2026-10-04).**
- **Q-AC4. Future regressor values in the app.** Default: you register them as a dataset in Study design. **Agreed (2026-10-04).**
- **Q-AC5. Regressors and model orders.** Default: all declared regressors are used; code picks orders. **Agreed (2026-10-04).**

**P18 status:** audit closed after three rounds; ready for sign-off once Q-U, Q-Y and Q-AC are confirmed or changed.
