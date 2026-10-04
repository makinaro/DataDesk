# Pending: Advanced-Analysis Track

| Field | Value                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| As of | 2026-10-04                                                                                                                                                                                                                                                                                                                                                                        |
| State | Planning set complete. **P10–P23 audited; no phase signed off yet** (up to three blind rounds each, every finding fixed, defaults applied). **Nothing committed yet** on `plan/planning`                                                                                                                                                                                          |
| Next  | **All 277 audit questions answered (2026-10-04):** 275 agreed, 2 changed (2 GB compute cap; two maintainers). Sign-off is a later stage, not part of `plan/planning`: P10 first (append the draft D-030..D-045, see [decisions-draft.md](decisions-draft.md)), then each later phase before it starts. Commit (§3) when ready. Paid runs still need each phase's signed spend tag |

---

## 1. Decisions for the maintainer

Each is phrased so that "agree" settles it. Details are in the phase questionnaire's Spec-Designer Summary.

### Money: planned costs, approved phase by phase (DS-21)

Every cost below is a **planned approval amount** from the audited phase plans (P11–P23 audits,
2026-10-03), about **$1,020** across the track, paid from contributors' own keys. From P14 on, amounts
are sized on **reservations** (the $1 cap + the ≤ $0.25 overshoot bound per task, plus the judge),
so actual spend is lower. **Agreeing to a plan is not approving the spend.** Before a phase that
spends money starts coding or running, a maintainer approves that phase's spend as a
**maintainer-signed tag** (P12 Q-K1). **Paid runs are hard-blocked in code:** the runner refuses
without an approval, refuses agent sessions and non-interactive runs, and refuses any task the
remaining amount can't cover, with no override flag (DS-21).

| Phase                                                | What it pays for                                                                                                        | Planned approval | Approval code  | Status                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------- | ------------------------------------------------ |
| P11                                                  | Probes against a local scripted endpoint                                                                                | $0               | —              | —                                                |
| P12                                                  | Reduced baseline (5 dev tasks per provider) and the judge pilot                                                         | ≈ $13            | P12 audit      | agreed 2026-10-04; signed tag due at phase start |
| P13                                                  | No model calls                                                                                                          | $0               | —              | —                                                |
| P14                                                  | One dev run per provider, reservation-sized                                                                             | ≈ $24            | Q-L3           | agreed 2026-10-04; signed tag due at phase start |
| P15                                                  | One dev gate run per provider                                                                                           | ≈ $24            | Q-O8           | agreed 2026-10-04; signed tag due at phase start |
| P16                                                  | Pre-gate runs, the maintainer-run 3 × 2 gate, one void re-run, calibration judging                                      | ≈ $140           | Q-P4 (round 2) | agreed 2026-10-04; signed tag due at phase start |
| P17                                                  | One dev gate run per provider with the judge floor                                                                      | ≈ $29            | Q-R10, Q-V7    | agreed 2026-10-04; signed tag due at phase start |
| P18                                                  | One dev gate run per provider                                                                                           | ≈ $24            | P18 audit      | agreed 2026-10-04; signed tag due at phase start |
| P19                                                  | Fresh gate run plus a pack-replay model experiment                                                                      | ≈ $35            | Q-AI9          | agreed 2026-10-04; signed tag due at phase start |
| P20                                                  | Learning sequence with a lessons-off control, holdout-a before/after, one void sequence                                 | ≈ $200           | Q-AF3          | agreed 2026-10-04; signed tag due at phase start |
| P21                                                  | One dev gate run per provider; notebook re-runs are local                                                               | ≈ $28            | Q-AD7          | agreed 2026-10-04; signed tag due at phase start |
| P22                                                  | Final runs, ablations with an A/A control, learning sequence, judge recheck, headroom for a void and a holdout-d re-run | ≈ $490           | Q-AL7          | agreed 2026-10-04; signed tag due at phase start |
| P23                                                  | Fresh-machine tests and demo                                                                                            | ≈ $10            | Q-AK5          | agreed 2026-10-04; signed tag due at phase start |
| Dev set size: 12 tasks within $15 per pass (P10 Q19) | —                                                                                                                       | —                | —              | planned                                          |
| Each contributor pays for their own runs (P10 Q44)   | —                                                                                                                       | —                | —              | planned                                          |

### Audit questions P11–P23: defaults applied, pending your answer

The P11–P23 audits (2026-10-03, up to three rounds each) applied a **safe default** to every
one of the 282 questions below and wrote it into the plans. Nothing that spends money is approved by these
defaults: spend lines need the signed-tag approval above. Answer "agree" to keep a default, or
write a different answer; a struck-through default has been superseded by a later question.
Details are in each phase's `Pn-audit.md`.

#### P11 (18) · [P11-audit.md](plans/P11-audit.md)

- [x] **Q-D1. One owner for per-analysis state.** Default: an analysis controller in main owns the journal, budgets, split and attribution, and **`run_sql` also reports to it**, so the 200-row cap covers both servers. **Agreed (2026-10-04).**
- [x] **Q-D2. Who writes the journal.** Default: main, not `datadesk-ds` (reverses the old roadmap §8.3 wording; recorded as a D-NNN at P11 sign-off). **Agreed after discussion (2026-10-04).**
- [x] **Q-D3. Compute windows per analysis.** Default: up to 3 at once (one per compare lane), each killed at 3 GB, refused below 4 GB free memory, 60 s queue. **Maintainer answer (2026-10-04):** Changed: each window is killed at **2 GB** (amends D-031's 3 GB, D-NNN at sign-off).
- [x] **Q-D4. P11 designs the test lock.** Default: yes, as ADR-11, because P11's other ADRs fix the mechanisms P17 depends on. **Agreed (2026-10-04).**
- [x] **Q-D5. Strict number counting for provenance.** Default: every number in a report needs a cell-level citation, except numbers quoted from the user's question; M-19's ≥ 90% target is unchanged. **Agreed (2026-10-04).**
- [x] **Q-F1. Who opens an analysis.** Default: code opens and closes it; only the user starts a new one; split and spent test lock carry over within a conversation. **Agreed (2026-10-04).**
- [x] **Q-F2. Train-only SQL after a split.** Default: yes, the agent's SQL tools see only the training rows after `make_split`. **Agreed (2026-10-04).**
- [x] **Q-F3. Metering the other data tools.** Default: they all report to the controller; `second_opinion` stays off during DS analyses unless you turn it on. **Agreed (2026-10-04).**
- [x] **Q-F4. CPython fallback isolation.** Default: a Windows AppContainer (works without admin rights). **Agreed (2026-10-04).**
- [x] **Q-F5. Per-call output caps.** Default: required on both providers, so the $1 stop can be computed before a call. **Agreed (2026-10-04).**
- [x] **Q-F6. Free probes.** Default: all P11 probes use a local fake endpoint ($0), so P11 needs no spend approval. **Agreed (2026-10-04).**
- [x] **Q-F7. Stricter provenance metrics.** Default: M-04 measured before code marks anything, and values hard-coded in code don't count as provenanced. **Agreed (2026-10-04).**
- [x] **Q-G1. Split before reading.** Default: for prediction and forecasting plans, code splits the data when the plan is saved, before any code reads it; models from another split are refused. **Agreed (2026-10-04).**
- [x] **Q-G2. Tools that send rows to OpenAI.** Default: `second_opinion` and `search_columns` are off during every analysis, with no override, to keep D-033. **Agreed (2026-10-04).**
- [x] **Q-G3. Metering from the first call.** Default: every agent tool call is metered from the start of a conversation, and the 20-row per-call cap is always on (today's agent `run_sql` returns up to 500). **Agreed (2026-10-04).**
- [x] **Q-G4. A second target on a split dataset.** Default: a new split uses only rows never used as test rows; otherwise the report says there's no clean test set. **Agreed (2026-10-04).**
- [x] **Q-G5. The "unverified" mark.** Default: the agent writes `[[unverified]]` after a number it can't cite; M-04 = 0 stays the target. **Agreed (2026-10-04).**
- [x] **Q-G6. Failed test evaluations.** Default: any attempt that reaches the evaluation kernel uses up the test set, even if it fails. **Agreed (2026-10-04).**

#### P12 (21) · [P12-audit.md](plans/P12-audit.md)

- [x] **Q-E1. Baseline before P14.** Default: a **partial** baseline from a runner-written event log (cost, time, injection attempts, the rubric score); answer-based metrics start at P14's first gate. No bench-only prompt is added to today's analyst. **Agreed (2026-10-04).**
- [x] **Q-E2. Trap coverage.** Default: 2 traps per dev task and 3 per holdout task, so all 12 categories appear in both splits at no extra cost; drift is listed as a v1.0 limitation. **Agreed (2026-10-04).**
- [x] **Q-E3. P12 spend.** Default (updated in round 3): **≈ $13** (5 dev tasks per provider ≈ $11, judge pilot ≈ $2), hard-blocked until a maintainer approves it. **Agreed after discussion (2026-10-04).**
- [x] **Q-E4. Holdout custody.** Default: holdout tasks, seeds and keys live outside the repo with the maintainers; results for them are committed as aggregates only. **Agreed (2026-10-04).**
- [x] **Q-E5. Committed journals.** Default: official dev runs commit their journals and CI re-scores them (synthetic and public data only). **Agreed (2026-10-04).**
- [x] **Q-E6. Notebook re-runs.** Default: only inside DataDesk's compute sandbox (or a no-network, empty-env child), never in the reference env. **Agreed (2026-10-04).**
- [x] **Q-J1. Where approvals live.** Default: only on the upstream repository's protected `main`, and the last change must be by a maintainer. **Agreed (2026-10-04).**
- [x] **Q-J2. Spend ledger.** Default: local per contributor, plus a CI check that committed run costs never exceed each contributor's approval. **Agreed after discussion (2026-10-04).**
- [x] **Q-J3. Trap design.** Default: 3 traps per trap task in both dev and holdout (replaces Q-E2's 2 vs 3). **Agreed (2026-10-04).**
- [x] **Q-J4. Judge stage.** Default: a separate paid stage writes `rubric.json`, which CI checks but can't re-score. **Agreed (2026-10-04).**
- [x] **Q-J5. Trusting committed runs.** Default: peer review is the control for dev runs; maintainers run the official P16 and P22 gates. **Agreed (2026-10-04).**
- [x] **Q-J6. Independent number counting.** Default: the scorer counts numbers itself for M-04 and M-19. **Agreed (2026-10-04).**
- [x] **Q-J7. Holdout key check.** Default: a second maintainer runs an oracle pass on the holdout. **Agreed (2026-10-04).**
- [x] **Q-K1. Spend approvals.** Default: a maintainer signs a git tag per approval (phase, contributor, amount); this replaces "the remote phase branch" in D-034. **Agreed after discussion (2026-10-04).**
- [x] **Q-K2. How many maintainers.** Default: the plan works with one; with one, the holdout key check is run by the generator's author with you as witness. **Maintainer answer (2026-10-04):** Changed: there are **two maintainers**, so the holdout key check is always run by the maintainer who didn't write the generator.
- [x] **Q-K3. Dev answer keys in the repo.** Default: accept that dev keys are public (anyone can regenerate them); the holdout is what stays secret. **Agreed (2026-10-04).**
- [x] **Q-K4. Holdout secrecy.** Default: holdout files are committed only as salted commitments; the salts stay with maintainers. **Agreed (2026-10-04).**
- [x] **Q-K5. Lessons in the benchmark.** Default: only a declared P20 learning sequence carries lessons, including into the holdout-a "after" run. **Agreed (2026-10-04).**
- [x] **Q-K6. P15's data-quality gate.** Default: at least 3 of the 4 dev data-quality traps found, on both providers. **Agreed (2026-10-04).**
- [x] **Q-K7. Injection gate with nothing measurable.** Default: the gate fails. **Agreed (2026-10-04).**
- [x] **Q-K8. P12 spend.** Default: **≈ $13**, with a hard $15 cap per provider pass, judging included. **Agreed after discussion (2026-10-04).**

#### P13 (23) · [P13-audit.md](plans/P13-audit.md)

- [x] **Q-H1. Channel to main.** Default: a minimal preload with two functions; every limit is enforced in main, never in the sandbox. **Agreed (2026-10-04).**
- [x] **Q-H2. Partitions.** Default: a fresh in-memory partition per kernel window. **Agreed (2026-10-04).**
- [x] **Q-H3. CSP waiver.** Default: accept a recorded exception to CLAUDE.md rule 2 for the compute window's CSP (`'wasm-unsafe-eval'`). **Agreed (2026-10-04).**
- [x] **Q-H4. Memory warning.** Default: follow D-031 (warn on 500 MB growth), measured on private memory. **Agreed (2026-10-04).**
- [x] **Q-H5. Notebook export of failed cells.** Default: exported commented out with a warning, plus a danger scan (decided in P21). **Agreed (2026-10-04).**
- [x] **Q-H6. CPython fallback.** Default: if the spike fails, P13 ends there and a separate CPython phase (4–6 sessions) follows. **Agreed (2026-10-04).**
- [x] **Q-H7. Evaluation kernel.** Default: P13 builds and tests it. **Agreed (2026-10-04).**
- [x] **Q-H8. Same library versions.** Default: the reference environment pins Pyodide's versions. **Agreed (2026-10-04).**
- [x] **Q-H9. Escape log.** Default: P13 adds a denial log that feeds M-11 in every later run. **Agreed (2026-10-04).**
- [x] **Q-I1. Budget ownership.** Default: P13 enforces per-output limits; the per-analysis totals wait for P14's controller. **Agreed (2026-10-04).**
- [x] **Q-I2. Artifact channel.** Default: a second channel for files the sandbox produces (Parquet, models, predictions), written only by main and never shown to the model. **Agreed (2026-10-04).**
- [x] **Q-I3. Exporting failed cells.** Default: failed cells stay runnable; only cells the sandbox blocked are commented out; every cell gets a danger scan. **Agreed (2026-10-04).**
- [x] **Q-I4. Fair fallback rule.** Default: CPython must pass the same committed workload spec on the same machine before it can replace Pyodide. **Agreed (2026-10-04).**
- [x] **Q-I5. Clean restarts.** Default: a kernel restart always means a new window and a cleared partition. **Agreed (2026-10-04).**
- [x] **Q-I6. Escape metric.** Default: M-11 is measured per build from the CI escape-suite result. **Agreed (2026-10-04).**
- [x] **Q-I7. When the CSP waiver is recorded.** Default: in session 2, when the compute CSP first ships. **Agreed (2026-10-04).**
- [x] **Q-M1. Amend CLAUDE.md rule 2.** Default: yes, in the PR that ships the compute window, to allow "the UI CSP or the compute CSP variant, both from `csp.ts`". **Agreed (2026-10-04).**
- [x] **Q-M2. Drop the interrupt.** Default: a timed-out kernel never survives, so the interrupt machinery is removed. **Agreed (2026-10-04).**
- [x] **Q-M3. Where provenance code-parsing runs.** Default: a small third kernel type with no data and its own slot. **Agreed (2026-10-04).**
- [x] **Q-M4. One go/no-go rule.** Default: the ordered rule above, with the cell limit possibly lowered to 25M by a D-NNN. **Agreed (2026-10-04).**
- [x] **Q-M5. Notebook export safety.** Default: an import allowlist decides; risky cells are exported commented out. **Agreed (2026-10-04).**
- [x] **Q-M6. Recomputing answer keys.** Default: a maintainer recomputes them under the pinned versions before P14's gate run. **Agreed (2026-10-04).**
- [x] **Q-M7. Escape metric per build.** Default: committed per build SHA; no bench run without it. **Agreed (2026-10-04).**

#### P14 (21) · [P14-audit.md](plans/P14-audit.md)

- [x] **Q-L1. Continue.** Default: Continue reopens the same analysis, with the money, rows, split and test lock already used. **Agreed (2026-10-04).**
- [x] **Q-L2. Transcript on reopen.** Default: the visible conversation is restored from the journal; the SDK session itself isn't. **Agreed (2026-10-04).**
- [x] **Q-L3. P14 spend.** Default: **≈ $24** expected (one dev run per provider at the gate), with the approval covering reservations (updated in a later round). **Agreed after discussion (2026-10-04).**
- [x] **Q-L4. Who splits at plan time.** Default: P14 builds the mechanism; P17 adds the remaining split kinds. **Agreed (2026-10-04).**
- [x] **Q-L5. PA-09 in P14.** Default: gate only its "no unprovenanced numbers" half now; the report-section half waits for P21 (recorded as a D-NNN). **Agreed (2026-10-04).**
- [x] **Q-L6. Hugging Face approval after data is read.** Default: P14 builds it. **Agreed (2026-10-04).**
- [x] **Q-L7. Locked plan fields.** Default: direction, target, split and declared constants can't change once data has been read. **Agreed (2026-10-04).**
- [x] **Q-N1. Data read before a plan.** Default: plain SQL still works, but a test direction declared after looking is ignored, and early looks at data later split for a model are disclosed and count as a lock violation on the benchmark. **Agreed (2026-10-04).**
- [x] **Q-N2. Allowed confidence levels.** Default: only D-035's (α 0.05, 95%; 80/95% for forecasts) unless the user asked for another. **Agreed (2026-10-04).**
- [x] **Q-N3. One artifact writer.** Default: main writes every report and chart file. **Agreed (2026-10-04).**
- [x] **Q-N4. Scoring from citations.** Default: P12 scores numbers by what their citations resolve to. **Agreed (2026-10-04).**
- [x] **Q-N5. Hugging Face approval after data is read.** Default: remembered per conversation, including after Continue. **Agreed (2026-10-04).**
- [x] **Q-N6. Who picks the split kind.** Default: code, from the data's time column. **Agreed (2026-10-04).**
- [x] **Q-N7. Overshoot bound.** Default: computed in advance; the gate checks it holds. **Agreed (2026-10-04).**
- [x] **Q-N8. Independent scoring.** Default: the scorer recomputes provenance itself; only the test-lock record comes from the app. **Agreed (2026-10-04).**
- [x] **Q-Q1. What counts as a row.** Default: records count; a set of named statistics counts once; the byte cap bounds the rest. **Agreed (2026-10-04).**
- [x] **Q-Q2. Fewer false provenance flags.** Default: settings like `pd.options` don't taint; only distinctive literals count; flags don't stop an analysis. **Agreed (2026-10-04).**
- [x] **Q-Q3. Plan locks and lock violations.** Default: authority fields are set once in the first plan; only reads that return values count as violations. **Agreed (2026-10-04).**
- [x] **Q-Q4. Hypotheses picked after looking.** Default: exploratory, unless your question named them. **Agreed (2026-10-04).**
- [x] **Q-Q5. Forecast splits.** Default: always by time; refused without a usable time column. **Agreed (2026-10-04).**
- [x] **Q-Q6. Second-opinion and column search.** Default: off once any data has been read in the conversation. **Agreed (2026-10-04).**

#### P15 (24) · [P15-audit.md](plans/P15-audit.md)

- [x] **Q-O1. Instrumentation is advisory.** Default: yes, project-wide; P16–P18 follow (their audits apply it). **Agreed (2026-10-04).**
- [x] **Q-O2. Hiding derived data after a split.** Default: datasets derived from the split source are hidden entirely. **Agreed (2026-10-04).**
- [x] **Q-O3. Cleaning in predictive analyses.** Default: written as pipeline steps; P17 enforces it. **Agreed (2026-10-04).**
- [x] **Q-O4. Writers.** Default: main writes the file; the keyless helper validates and registers it; the journal is the record of truth. **Agreed (2026-10-04).**
- [x] **Q-O5. Hostile Parquet.** Default: rewritten by the keyless helper before any keyed process reads it. **Agreed (2026-10-04).**
- [x] **Q-O6. Visibility of derived data.** Default: private to the conversation (and lane) until you click "Keep". **Agreed (2026-10-04).**
- [x] **Q-O7. Hashes for lineage.** Default: from the bytes actually read. **Agreed (2026-10-04).**
- [x] **Q-O8. P15 spend.** Default: **≈ $24**, on the fixed dev set. **Agreed after discussion (2026-10-04).**
- [x] **Q-T1. Splitting a derived dataset.** Default: refused with a clear message; re-derive inside the pipeline. **Agreed (2026-10-04).**
- [x] **Q-T2. File writer.** Default: a short-lived keyless helper writes the file; main hashes the result. **Agreed (2026-10-04).**
- [x] **Q-T3. Visibility after a split.** Default: helpers fetch what they may show before every rebuild, and show nothing without it. **Agreed (2026-10-04).**
- [x] **Q-T4. Kept datasets.** Default: they keep their own copy of lineage and survive deleting the analysis. **Agreed (2026-10-04).**
- [x] **Q-T5. Row-change disclosure.** Default: each save states its expected rows and reason; joins are checked by key cardinality. **Agreed (2026-10-04).**
- [x] **Q-T6. Profiler output.** Default: the profiler returns a structured issue list. **Agreed (2026-10-04).**
- [x] **Q-T7. Kernel findings.** Default: shown to you only, never sent to the model. **Agreed (2026-10-04).**
- [x] **Q-T8. Registration rule.** Default: a recorded exception lets only the UI register derived files by id. **Agreed (2026-10-04).**
- [x] **Q-T9. Change detection.** Default: hash before and after reading; refuse if the file changed. **Agreed (2026-10-04).**
- [x] **Q-X1. Row-loss scoring.** Default: against expected rows in the answer key, not the agent's own figure. **Agreed (2026-10-04).**
- [x] **Q-X2. Join check.** Default: the helper reads the parent snapshots and checks shared columns itself. **Agreed (2026-10-04).**
- [x] **Q-X3. Hiding across analyses.** Default: follows all lineage, including kept datasets from deleted analyses. **Agreed (2026-10-04).**
- [x] **Q-X4. Forecast plans.** Default: also refused on all-rows derived data. **Agreed (2026-10-04).**
- [x] **Q-X5. Retention.** Default: derived data lives as long as its analysis (D-043). **Agreed (2026-10-04).**
- [x] **Q-X6. Reconcile.** Default: main decides from the journals; committed files are re-registered. **Agreed (2026-10-04).**
- [x] **Q-X7. Profiler output.** Default: a capped structured tool with precision reported. **Agreed (2026-10-04).**

#### P16 (24) · [P16-audit.md](plans/P16-audit.md)

- [x] **Q-P1. How tests are scored.** Default: the agent lists the tests it relied on, and the scorer recomputes each one. **Agreed (2026-10-04).**
- [x] **Q-P2. Test families.** Default: hypotheses locked in the plan; later questions are exploratory; the benchmark uses the task's families. **Agreed (2026-10-04).**
- [x] **Q-P3. No gate retry.** Default: one practice run, then one official gate; a failure needs a new decision to re-run. **Agreed (2026-10-04).**
- [x] **Q-P4. P16 spend and who runs the gate.** Default: **≈ $140** (raised from ≈ $116 in round 2 for the void contingency); a maintainer runs and pays for the official gate. **Agreed after discussion (2026-10-04).**
- [x] **Q-P5. Fields the agent can't set.** Default: randomised, weights and kind, planned allocation, screen vs confirmatory come only from the task, you, or a dataset note. **Agreed (2026-10-04).**
- [x] **Q-P6. PA-05 at MVP.** Default: ≥ 70% (85% at v1.0). **Agreed (2026-10-04).**
- [x] **Q-P7. What the MVP gate counts.** Default: only questions whose tools exist by P16, with M-03 ≥ 75% gated beside M-02. **Agreed (2026-10-04).**
- [x] **Q-P8. Judge block.** Default: the gate fails if a judge block is confirmed. **Agreed (2026-10-04).**
- [x] **Q-P9. Charts.** Default: main builds them from recorded outputs. **Agreed (2026-10-04).**
- [x] **Q-S1. Recomputable test inputs.** Default: tests must point at datasets; anything built only inside the kernel counts as not recomputable. **Agreed (2026-10-04).**
- [x] **Q-S2. Safe recomputation.** Default: the scorer only runs tests from a fixed list with simple arguments. **Agreed (2026-10-04).**
- [x] **Q-S3. Test chosen up front.** Default: the plan locks which test each hypothesis uses. **Agreed (2026-10-04).**
- [x] **Q-S4. PA-05 denominator.** Default: the answer key's hypotheses, not the agent's claims. **Agreed (2026-10-04).**
- [x] **Q-S5. Failed practice run.** Default: fix and allow one more practice run; both disclosed. **Agreed (2026-10-04).**
- [x] **Q-S6. Judge floor.** Default: a breach pauses the gate until a reviewer decides. **Agreed (2026-10-04).**
- [x] **Q-S7. Probability weights.** Default: sandwich standard errors; full survey designs later. **Agreed (2026-10-04).**
- [x] **Q-S8. Skill thresholds as constants.** Default: yes, recorded in a decision before P16-02. **Agreed (2026-10-04).**
- [x] **Q-S9. Families.** Default: by outcome column. **Agreed (2026-10-04).**
- [x] **Q-W1. Locking Study design.** Default: locked once data is read; later changes apply to the next analysis. **Agreed (2026-10-04).**
- [x] **Q-W2. Counts before planning.** Default: code tells the agent group sizes and outcome type before it locks its test. **Agreed (2026-10-04).**
- [x] **Q-W3. MVP subset size.** Default: 6–9 tasks; metrics on fewer than 5 tasks shown without an interval. **Agreed (2026-10-04).**
- [x] **Q-W4. Every hypothesis tested.** Default: each locked hypothesis must be reported, and Holm uses the locked count. **Agreed (2026-10-04).**
- [x] **Q-W5. What "matched" means.** Default: allowed, as locked, and recomputed to the same value. **Agreed (2026-10-04).**
- [x] **Q-W6. Regression claims.** Default: a typed design schema; no formula strings. **Agreed (2026-10-04).**

#### P17 (25) · [P17-audit.md](plans/P17-audit.md)

- [x] **Q-R1. Leakage checks that count.** Default: only checks computed by main count toward gates. **Agreed (2026-10-04).**
- [x] **Q-R2. `predict` during a split.** Default: refuses data descended from the split dataset. **Agreed (2026-10-04).**
- [x] **Q-R3. Split kind.** Default: code decides; grouped only when the task or you declare an entity column. **Agreed (2026-10-04).**
- [x] **Q-R4. Small data (n < 1,000).** Default: nested cross-validation run by main, not by the agent. **Agreed (2026-10-04).**
- [x] **Q-R5. Leakage gate.** Default: the dev leakage case must be caught on both providers; the holdout case is reported at P22. **Agreed (2026-10-04).**
- [x] **Q-R6. Silencing a leakage warning.** Default: only you can. **Agreed (2026-10-04).**
- [x] **Q-R7. Saved models after an upgrade.** Default: marked "needs retrain", with one-click retraining. **Agreed (2026-10-04).**
- [x] **Q-R8. Failed evaluations.** Default: a test-free pre-flight first, so a broken model doesn't use up the test set. **Agreed (2026-10-04).**
- [x] **Q-R9. Benchmark scoring data.** Default: readable only by `predict`. **Agreed (2026-10-04).**
- [x] **Q-R10. P17 spend.** Default: ~~≈ $24~~ **≈ $29** with judging for the D-038 floor (Q-V7). **Agreed after discussion (2026-10-04).**
- [x] **Q-V1. Small-data evaluation.** Default: a separate fit-capable kernel runs nested cross-validation once per analysis. **Agreed (2026-10-04).**
- [x] **Q-V2. Pre-flight.** Default: a test-free trial run doesn't use up the test set (amends ADR-11). **Agreed (2026-10-04).**
- [x] **Q-V3. PA-06 bar.** Default: per task, 0.90 at MVP. **Agreed (2026-10-04).**
- [x] **Q-V4. Leakage gate.** Default: the agent must drop or disclose the leaky feature. **Agreed (2026-10-04).**
- [x] **Q-V5. Imbalance trap.** Default: scored as "headline isn't accuracy". **Agreed (2026-10-04).**
- [x] **Q-V6. M-06.** Default: counts metrics after a violation; refused attempts are reported on their own. **Agreed (2026-10-04).**
- [x] **Q-V7. Judge at P17.** Default: yes, for the D-038 floor (≈ $29 total). **Agreed (2026-10-04).**
- [x] **Q-V8. `predict` and duplicates.** Default: refused by lineage or content hash; features only. **Agreed (2026-10-04).**
- [x] **Q-V9. Declared columns.** Default: entity, event-time and subgroups come only from the Study design record. **Agreed (2026-10-04).**
- [x] **Q-V10. Retraining.** Default: in P21, on the same training data; the old test score stays with the old model. **Agreed (2026-10-04).**
- [x] **Q-Z1. Refused attempts and M-06.** Default: not violations; reported on their own. **Agreed (2026-10-04).**
- [x] **Q-Z2. Leakage gate wording.** Default: the leaky feature is excluded or disclosed; PA-06 median ≥ 0.90. **Agreed (2026-10-04).**
- [x] **Q-Z3. Small-data models.** Default: main builds the final model from the same spec it evaluated. **Agreed (2026-10-04).**
- [x] **Q-Z4. Pipeline specs.** Default: declarative JSON, never a pickle. **Agreed (2026-10-04).**
- [x] **Q-Z5. Retraining.** Default: a P21 work item. **Agreed (2026-10-04).**

#### P18 (22) · [P18-audit.md](plans/P18-audit.md)

- [x] **Q-U1. Refit for the real forecast.** Default: after evaluation, code refits the chosen model on all the data to produce your forecast. **Agreed (2026-10-04).**
- [x] **Q-U2. Backtesting by code.** Default: a code-owned backtest tool runs model selection. **Agreed (2026-10-04).**
- [x] **Q-U3. PA-07 at MVP.** Default: ≥ 60%. **Agreed (2026-10-04).**
- [x] **Q-U4. What "beats seasonal naive" means.** Default: lower MASE than the seasonal-naive forecast on the held-back horizon. **Agreed (2026-10-04).**
- [x] **Q-U5. Few forecast tasks.** Default: accept a smoke gate on the 2–3 dev forecast tasks (recorded as a decision) rather than add paid tasks. **Agreed (2026-10-04).**
- [x] **Q-U6. Future-known regressors.** Default: only you or the task can mark one. **Agreed (2026-10-04).**
- [x] **Q-U7. P18 spend.** Default: **≈ $24**. **Agreed after discussion (2026-10-04).**
- [x] **Q-U8. Series per analysis.** Default: at most 5. **Agreed (2026-10-04).**
- [x] **Q-Y1. Horizon on the benchmark.** Default: from the task; a refused or mismatched horizon counts as a miss. **Agreed (2026-10-04).**
- [x] **Q-Y2. Who picks the model.** Default: the agent picks families to try; code picks orders and the winner. **Agreed (2026-10-04).**
- [x] **Q-Y3. Forecast kernel.** Default: a code-only fitting kernel that never sees the held-back values. **Agreed (2026-10-04).**
- [x] **Q-Y4. Coverage gate.** Default: on backtest folds recomputed by the scorer. **Agreed (2026-10-04).**
- [x] **Q-Y5. PA-07.** Default: structural 100%; "beats naive" reported. **Agreed (2026-10-04).**
- [x] **Q-Y6. Slow SARIMA.** Default: fall back to Fourier terms. **Agreed (2026-10-04).**
- [x] **Q-Y7. Undeclared regressors.** Default: refused. **Agreed (2026-10-04).**
- [x] **Q-Y8. Fill count.** Default: computed by main. **Agreed (2026-10-04).**
- [x] **Q-Y9. Inherited gates.** Default: all earlier gates, including accuracy, cost and time. **Agreed (2026-10-04).**
- [x] **Q-AC1. What backtests may read.** Default: only the original series' training part, plus typed transforms code replays. **Agreed (2026-10-04).**
- [x] **Q-AC2. Compute budget.** Default: at most 200 model fits per analysis, 5 s per fit before falling back. **Agreed (2026-10-04).**
- [x] **Q-AC3. Short histories.** Default: one fold is "weakly validated"; none falls back to ETS and is "unvalidated". **Agreed (2026-10-04).**
- [x] **Q-AC4. Future regressor values in the app.** Default: you register them as a dataset in Study design. **Agreed (2026-10-04).**
- [x] **Q-AC5. Regressors and model orders.** Default: all declared regressors are used; code picks orders. **Agreed (2026-10-04).**

#### P19 (27) · [P19-audit.md](plans/P19-audit.md)

- [x] **Q-AA1. `second_opinion`.** Default: dropped from v1.0. **Agreed (2026-10-04).**
- [x] **Q-AA2. Which findings count.** Default: only findings from main's checks and the critic's own; kernel and probe findings never count or teach lessons. **Agreed (2026-10-04).**
- [x] **Q-AA3. Who calls the critic.** Default: code, at fixed points. **Agreed (2026-10-04).**
- [x] **Q-AA4. Causal flags.** Default: the critic gives a verdict beside each flag; only you dismiss; dismissals don't change scores. **Agreed (2026-10-04).**
- [x] **Q-AA5. Plan review timing.** Default: the critic reviews a proposed plan before it locks. **Agreed (2026-10-04).**
- [x] **Q-AA6. Closing a finding.** Default: disclosed, or fixed only when code or the critic confirms. **Agreed (2026-10-04).**
- [ ] **Q-AA7. P19 spend.** ~~Default: ≈ $96~~ (superseded by Q-AI9).
- [x] **Q-AA8. Model experiment.** Default: never uses the judge model; the gate is a fresh run. **Agreed (2026-10-04).**
- [x] **Q-AE1. PA-08 denominator.** Default: only traps nothing had flagged yet when the critic ran. **Agreed (2026-10-04).**
- [x] **Q-AE2. Restated findings.** Default: no critic credit for repeating any earlier finding. **Agreed (2026-10-04).**
- [x] **Q-AE3. When the plan locks.** Default: at a separate commit step after the critique. **Agreed (2026-10-04).**
- [x] **Q-AE4. Critic calls.** Default: at most two per analysis (plus retries), reserved up front. **Agreed (2026-10-04).**
- [x] **Q-AE5. Questions the critic asks for after results.** Default: still exploratory. **Agreed (2026-10-04).**
- [x] **Q-AE6. Closing findings.** Default: code confirms fixes; otherwise disclosed. **Agreed (2026-10-04).**
- [x] **Q-AE8. Model experiment.** Default: critic only, OpenAI lane only, keep the current model unless clearly better; ~~≈ $65~~ (spend superseded by Q-AI9). **Agreed (2026-10-04).**
- [x] **Q-AE9. Claim subjects.** Default: matched by the (exposure, outcome) column pair. **Agreed (2026-10-04).**
- [x] **Q-AI1. Kernel text in review packs.** Default: enums only; the whole pack counts against the row and byte caps. **Agreed (2026-10-04).**
- [x] **Q-AI2. Critic findings as lessons.** Default: only after the user or a later main check confirms them. **Agreed (2026-10-04).**
- [x] **Q-AI3. Unverifiable fixes.** Default: the finding stays in limitations, with the lead's claim marked unverified. **Agreed (2026-10-04).**
- [x] **Q-AI4. Changes after the critique.** Default: disclosed as "not reviewed by the critic". **Agreed (2026-10-04).**
- [x] **Q-AI5. Model experiment design.** Default: replay one run's packs through both models. **Agreed (2026-10-04).**
- [x] **Q-AI6. PA-08 eligibility.** Default: no main, agent or profile finding before the answer-time call; zero eligible = not met. **Agreed (2026-10-04).**
- [x] **Q-AI7. Answer-key labels.** Default: P19 may extend the dev key schema for claim and test subjects. **Agreed (2026-10-04).**
- [x] **Q-AI8. Numbers in critic messages.** Default: not allowed. **Agreed (2026-10-04).**
- [x] **Q-AI9. P19 spend.** Default: **≈ $35**. **Agreed after discussion (2026-10-04).**
- [x] **Q-AI10. Controller-only roles.** Default: outside the delegatable scope table. **Agreed (2026-10-04).**
- [x] **Q-AI11. Reads before commit.** Default: refused while a plan is proposed but not committed. **Agreed (2026-10-04).**

#### P20 (19) · [P20-audit.md](plans/P20-audit.md)

- [x] **Q-AB1. Weights.** Default: only in Study design; notes show them read-only. **Agreed (2026-10-04).**
- [x] **Q-AB2. Dataset quirks.** Default: in notes only. **Agreed (2026-10-04).**
- [x] **Q-AB3. Control run and spend.** Default: add a lessons-off run per provider; ~~≈ $130~~ (spend superseded by Q-AF3, ≈ $200). **Agreed after discussion (2026-10-04).**
- [x] **Q-AB4. What auto-applied lessons look like.** Default: structured fields only; the agent's wording appears only in the app, never in model context, even after you approve it (reworded in round 3). **Agreed (2026-10-04).**
- [x] **Q-AB5. Merging lessons.** Default: exact structural match only. **Agreed (2026-10-04).**
- [x] **Q-AB6. Lesson retrieval tool.** Default: removed; lessons are pushed by code. **Agreed (2026-10-04).**
- [x] **Q-AB7. Lessons in P22.** Default: an empty store after purging holdout-a lessons. **Agreed (2026-10-04).**
- [x] **Q-AB8. M-14 in P20.** Default: reported, not gated. **Agreed (2026-10-04).**
- [x] **Q-AF1. Approved "skip a check" lessons.** Default: advisory only; the check still fires; "relax a threshold" is dropped. **Agreed (2026-10-04).**
- [x] **Q-AF2. Corrections.** Default: a small structured form; corrections about meaning become notes. **Agreed (2026-10-04).**
- [x] **Q-AF3. P20 spend.** Default: approve **≈ $200**, covering the worst case and one voided sequence. **Agreed after discussion (2026-10-04).**
- [x] **Q-AF4. Where inherited gates are measured.** Default: on the lessons-off control run. **Agreed (2026-10-04).**
- [x] **Q-AF5. Lesson cost in the data budget.** Default: once per lesson per analysis. **Agreed (2026-10-04).**
- [x] **Q-AG1. A failed holdout-a task.** Default: reported as unmeasured, never re-run. **Agreed (2026-10-04).**
- [x] **Q-AG2. Approved "dismiss a warning" and "change a default" lessons.** Default: advisory text only, like "skip a check". **Agreed (2026-10-04).**
- [x] **Q-AG3. Gates with lessons on.** Default: inherited gates are taken on the lessons-off run, and none may fail on the lessons-on run 3. **Agreed (2026-10-04).**
- [x] **Q-AG4. M-14 in P22.** Default: P22 re-runs the learning sequence from an empty store and measures M-14 before and after on holdout-b. **Agreed (2026-10-04).**
- [x] **Q-AG5. Dataset notes.** Default: structured records; free text only when the user types it. **Agreed (2026-10-04).**
- [x] **Q-AG6. Phrasing role budget.** Default: a new decision adds the phrasing role with a 2k-token budget. **Agreed (2026-10-04).**

#### P21 (17) · [P21-audit.md](plans/P21-audit.md)

- [x] **Q-AD1. Where notebooks are re-run.** Default: in a fresh sandboxed kernel; "outside DataDesk" becomes a documented manual check. **Agreed after discussion (2026-10-04).**
- [x] **Q-AD2. Code-computed results in notebooks.** Default: exported as generated cells from the recorded specs and split. **Agreed (2026-10-04).**
- [x] **Q-AD3. Export safety.** Default: a call allowlist with banned builtins; risky cells exported commented out. **Agreed (2026-10-04).**
- [x] **Q-AD4. Scores in compare mode.** Default: none in the app; benchmark reports cover that. **Agreed (2026-10-04).**
- [x] **Q-AD5. Replay and retraining.** Default: stay in P21 as a separate controller work item; size L. **Agreed (2026-10-04).**
- [x] **Q-AD6. Report v2.** Default: assembled by code with agent prose slots. **Agreed (2026-10-04).**
- [x] **Q-AD7. P21 spend.** Default: **≈ $28**. **Agreed after discussion (2026-10-04).**
- [x] **Q-AJ1. User-path evidence for FR-15.** Default: a CI job runs fixture notebooks in CPython; FR-15's wording waits for the D-NNN. **Agreed (2026-10-04).**
- [x] **Q-AJ2. `duckdb` and `altair` in the sandbox.** Default: not shipped; a code-owned load shim reads the granted snapshot, and charts are skipped. **Agreed (2026-10-04).**
- [x] **Q-AJ3. M-05 equality.** Default: exact within the same sandbox build. **Agreed (2026-10-04).**
- [x] **Q-AJ4. Replay start.** Default: the current split epoch, with evaluation steps excluded. **Agreed (2026-10-04).**
- [x] **Q-AJ5. Export allowlist.** Default: global name and builtin allowlists, not per library. **Agreed (2026-10-04).**
- [x] **Q-AM1. FR-15 evidence.** Default: M-05b re-runs the gate notebooks in a no-network CPython child and is reported; the narrowing D-NNN still decides FR-15. **Agreed (2026-10-04).**
- [x] **Q-AM2. Row identity.** Default: `__row_id` from ingestion order, invisible to the kernel. **Agreed (2026-10-04).**
- [x] **Q-AM3. Notebook form.** Default: amend P10 Q3/D-044 for rewritten loads and a plain-text analyst cell. **Agreed (2026-10-04).**
- [x] **Q-AM4. Export allowlist.** Default: an enumerated allowlist file, including dispatch strings. **Agreed (2026-10-04).**
- [x] **Q-AM5. Code ownership.** Default: export and re-run code are maintainer-owned paths. **Agreed (2026-10-04).**

#### P22 (18) · [P22-audit.md](plans/P22-audit.md)

- [ ] **Q-AH1. P22 spend.** ~~Default: ≈ $350~~ (superseded by Q-AL7).
- [x] **Q-AH2. The holdout after P22.** Default: kept in custody, aggregate-only, so a re-opened freeze has to use a fresh holdout-d. **Agreed after discussion (2026-10-04).**
- [x] **Q-AH3. A safety metric misses.** Default: fix by D-NNN, re-measure safety only on a fresh holdout-d (Q-AL3); quality comes from the first official pass. **Agreed (2026-10-04).**
- [x] **Q-AH4. M-13 and M-14 in P22.** Default: measured, through a learning sequence and a holdout-b after-run. **Agreed (2026-10-04).**
- [x] **Q-AH5. Judge recheck.** Default: 30 items; labellers are maintainers or contributors who accepted custody. **Agreed (2026-10-04).**
- [x] **Q-AH6. Components with no measured effect.** Default: reported; removal only as a v1.x proposal. **Agreed (2026-10-04).**
- [x] **Q-AH7. Freeze record.** Default: a maintainer-signed tag carrying `bench/freeze/<tag>.json`. **Agreed (2026-10-04).**
- [x] **Q-AL1. Safety metrics across runs.** Default: 0 in every run, not just the median. **Agreed after discussion (2026-10-04).**
- [x] **Q-AL2. M-14.** Default: after-runs on holdout-b and holdout-c ~~; a tie at 1.0 passes~~ (gate superseded by Q-AO1). **Agreed (2026-10-04).**
- [x] **Q-AL3. Safety re-run set.** Default: a fresh synthetic holdout-d of 5 tasks, budgeted in the headroom. **Agreed (2026-10-04).**
- [x] **Q-AL4. P23 and the freeze.** Default: storage, onboarding, diagnostics and release paths are outside the freeze. **Agreed (2026-10-04).**
- [x] **Q-AL5. Metric classes.** Default: M-16 report-only; M-17, M-18, M-19 gated and waivable; only PA-06's lock part never waived. **Agreed (2026-10-04).**
- [x] **Q-AL6. Ablation controls.** Default: an A/A control pair; lessons measured by M-13 and M-14. **Agreed (2026-10-04).**
- [x] **Q-AL7. P22 spend.** Default: approve **≈ $490** on reservations. **Agreed after discussion (2026-10-04).**
- [x] **Q-AO1. M-14 gate.** Default: non-inferiority (δ = 0.10) with matched estimators; if it misses, v1.0 ships with learning off by default. **Agreed after discussion (2026-10-04).**
- [x] **Q-AO2. What the freeze covers.** Default: an exact path list with a tree hash; runner, generator and decision rule finished before the code rc. **Agreed (2026-10-04).**
- [x] **Q-AO3. Judge-label settlement.** Default: a third blinded labeller who holds custody. **Agreed (2026-10-04).**
- [x] **Q-AO4. Infrastructure failure on a safety task.** Default: the pass is void for safety metrics and re-run, not treated as a violation. **Agreed (2026-10-04).**

#### P23 (23) · [P23-audit.md](plans/P23-audit.md)

- [x] **Q-AK1. Release gate.** Default: only maintainers create `v*` tags; publishing needs a maintainer-approved `release` environment; attestations are published. **Agreed after discussion (2026-10-04).**
- [x] **Q-AK2. Default models.** Default: ship aliases (D-045) as a declared deviation, printing the evaluated pinned ids. **Agreed (2026-10-04).**
- [x] **Q-AK3. Integrity.** Default: corruption-only in v1.0; same-user tampering out of scope. **Agreed (2026-10-04).**
- [x] **Q-AK4. Snapshots and lessons.** Default: saved analyses' snapshots can't be deleted alone; lessons keep data-free tombstones. **Agreed (2026-10-04).**
- [x] **Q-AK5. P23 spend.** Default: **≈ $10**. **Agreed after discussion (2026-10-04).**
- [x] **Q-AK6. Fresh-machine clock.** Default: ≤ 30 minutes excluding the analysis run, amending the roadmap. **Agreed (2026-10-04).**
- [x] **Q-AK7. Diagnostics.** Default: allowlisted fields only, copied by main. **Agreed (2026-10-04).**
- [x] **Q-AK8. Onboarding samples.** Default: copied into `userData`, licence-checked, a synthetic randomised A/B sample. **Agreed (2026-10-04).**
- [x] **Q-AN1. Evaluated-path changes.** Default: built in P23-00, before P22's code rc. **Agreed (2026-10-04).**
- [x] **Q-AN2. Fake-provider smoke.** Default: on the bench flavour of the same commit, with a bundle diff. **Agreed (2026-10-04).**
- [x] **Q-AN3. Release-input ownership.** Default: packaging, verify, sample, storage and diagnostics paths are maintainer-owned. **Agreed (2026-10-04).**
- [x] **Q-AN4. Fresh-machine installer.** Default: the hash-matched CI artifact. **Agreed (2026-10-04).**
- [x] **Q-AN5. Upgrade baseline.** Default: the Phase 9 merge commit. **Agreed (2026-10-04).**
- [ ] **Q-AN7. `file://` fuse.** ~~Default: kept on for the PDF window~~ (superseded by Q-AP5).
- [ ] **Q-AN8. Remote debugging port.** ~~Default: the packaged app quits when the switch is present~~ (superseded by Q-AP1).
- [ ] **Q-AN9. P23 spend.** ~~Default: approved on paper and paid by the maintainer running the test~~ (superseded by Q-AP6).
- [x] **Q-AP1. Remote debugging port.** Default: not blocked; same-user local access is out of v1.0's threat model. **Agreed after discussion (2026-10-04).**
- [x] **Q-AP2. P23-00 before the freeze.** Default: approved as a pre-freeze slice on `phase-22-evaluation`, and P22's frozen paths gain the agent-facing directories. **Agreed after discussion (2026-10-04).**
- [x] **Q-AP3. Who deletes.** Default: each store's owner; `StorageService` orchestrates. **Agreed (2026-10-04).**
- [x] **Q-AP4. Maintainer-owned paths.** Default: `.github/**`, package and build config, `scripts/**` and `bench/freeze/**`. **Agreed (2026-10-04).**
- [x] **Q-AP5. `file://` fuse.** Default: off, if a single-fuse test copy still exports a PDF. **Agreed (2026-10-04).**
- [x] **Q-AP6. Fresh-machine tester.** Default: a contributor who didn't write the README, on their own key. **Agreed (2026-10-04).**
- [x] **Q-AP7. Release tree-hash check.** Default: recomputed from the signed freeze tag, never read from the release commit. **Agreed (2026-10-04).**

### Decided on 2026-10-03

All non-money decisions are settled. Each is recorded in its questionnaire as a
**Maintainer decision** line.

- [x] **P10 Q30:** about **1 hour a week for reading plans** (possibly more). Reviewers read the
      Spec-Designer Summaries and flagged items; **PR review is automated** (DS-22).
- [x] **P10 Q31:** skipped for now. v1.0 ships unsigned with checksums; signing is revisited at P23.
- [x] **P10 Q35:** agree. Two contributors label calibration items, **spread over several sessions**.
- [x] **P10 Q40:** agree. The maintainer decides disagreements, and only one-way doors block work.
- [x] **P10 Q41:** latest answer wins. Every PR gets the **automated review suite plus a human peer
      review**, and a human merges; agents never merge (DS-22, DS-23).
- [x] **P20 Q10:** agree. Half of the holdout is used once in P20, and the other half is kept for P22.
- [x] **P22 Q6:** agree. M-04, M-06, M-11 and M-12 are never waived. A waived quality target is
      **logged as a limitation** in the evaluation report and the README.
- [x] **P23 Q7:** agree. CI builds releases from a tag, and the maintainer publishes the draft.

### New since the last update: automated PR review (DS-22)

PRs are reviewed by **review agents and a human peer** (Q-B2):

- **One criterion per agent**, each run in its own context so no criterion biases another.
- **Weights sum to 100.** Six criteria are **blockers**: security rules, tests, code-not-agent,
  provider parity, schemas and migrations, and scope.
- **Blockers are binding and the score is advisory.** A check that couldn't run never counts as a pass.
- **The verdict is committed with the PR**, and CI checks it.

The full criteria table is in P10-09 ([P10 plan](plans/P10-requirements-and-scope.md)).

### Optional review

- [ ] Skim the **overturned recommendations** listed in each questionnaire's summary. These are where the spec designer disagreed with the first draft:

  | Phase | Overturned |
  | ----- | ---------- |
  | P10   | 10         |
  | P11   | 2          |
  | P12   | 1          |
  | P13   | 1          |
  | P14   | 4          |
  | P15   | 3          |
  | P16   | 7          |
  | P17   | 3          |
  | P18   | 5          |
  | P19   | 6          |
  | P20   | 7          |
  | P21   | 4          |
  | P22   | 4          |
  | P23   | 7          |

- [ ] Override any answer you disagree with by writing your own answer under the spec designer's, signed `— @handle`.

---

## 2. Process steps

- [x] **Blind audit of P10** run on 2026-10-03. Verdict **BLOCKED**: Critical 1 · Major 19 · Minor 14 · Nit 1. Report and resolution table in [P10-audit.md](plans/P10-audit.md).
- [x] **Findings that need no decision are fixed** in the P10 plan (P10-07..P10-09, scope, exit criteria) and as **Audit resolution** lines under the affected answers. The main fix redesigns the review suite so **code, not the agent, computes the verdict**, and CI re-verifies it.
- [x] **Six audit questions answered** (Q-A1..Q-A6, below).
- [x] **Re-audit P10 (round 2)** run. Verdict **BLOCKED**: Critical 1 · Major 12 · Minor 8. All round-1 fixes landed (15 fully, 18 partly). The no-decision findings are fixed; see `P10-audit.md` "Round 2".
- [x] **Round-2 questions answered** (Q-B1..Q-B6, Q34, Q36).
- [x] **Re-audit P10 (round 3)** run. Verdict **BLOCKED**, but with **0 Critical**: Major 12 · Minor 10. All findings fixed except two small decisions (below).
- [x] **Q-C1 and Q-C2 answered** (per-contributor approvals; the judge is Claude Opus).
- [x] **P10 sign-off prepared on 2026-10-03** (sign-off itself happens later, on the P10 phase branch):
  - [x] DS-01..DS-23 and every maintainer answer drafted as grouped decisions **D-030..D-045** in [decisions-draft.md](decisions-draft.md); the D-NNN column in the P10 plan is filled
  - [ ] Append them to `DECISIONS.md` and sign off P10 (later stage, P10-01)
  - [x] DS-18's review clause confirmed (D-040); D-010 and D-029 amended (D-043)
  - [x] Roadmap bumped to **v0.3** with the §4 changes
  - [x] HTML re-rendered
- [x] **Blind audit → fixes for P11–P23** run on 2026-10-03: three rounds per phase (the maximum), every finding fixed, safe defaults applied to maintainer questions (listed in §1). Final-round verdicts can still read BLOCKED: each round found new detail, and the decisions are pending your answers. Each round's findings were fixed before the next.
- [ ] **Sign-off for P11–P23, one phase at a time,** before each phase starts: answer the phase's audit questions, record D-NNN entries, bump the roadmap. Later answers assume earlier ones, so a change upstream can change them.

### Round-3 audit questions: answered on 2026-10-03

- [x] **Q-C1: approvals name a person and an amount.** Agreed.
      _What it means:_ each contributor runs the benchmark on their own machine, so a single
      "phase budget" can't be watched across machines. Two people could each spend the full amount.
      _Recommendation:_ each spend approval names **phase + contributor + amount**, e.g.
      "P16, @a, $40". Each runner enforces only its own line. This is how your "explicit hard block"
      works across machines.

- [x] **Q-C2: the judge must always be a different model.** Answer: the judge is **Claude Opus**; a run that used Opus gets a same-model score that can't block.
      _What it means:_ with Claude-only judging, "a different model where possible" would still let
      Sonnet grade Sonnet's own work, and the judge can now block (Q36).
      _Recommendation:_ yes, **always** a different model from every model the run used, enforced
      by the judge config. A Claude key reaches several models, so this costs only a little more per pass.

### Round-2 audit questions: answered on 2026-10-03

- [x] **Q-B1:** **hard rules.** Permission rules deny merging and paid runs, and ask before every
      push and before edits to protected files; hooks and branch protection back them up (DS-23).
- [x] **Q-B2:** **peer review.** Every PR needs approval from a human who is not its author, on top
      of the agent review suite (DS-22).
- [x] **Q-B3:** **explicit hard block on money.** No paid run starts without a recorded maintainer
      approval, runs stop hard at the approved amount, there is no override flag, and agents can't
      start paid runs at all (DS-21).
- [x] **Q-B4:** agree. CI re-scores dev runs only; holdout runs are run or witnessed by a maintainer.
- [x] **Q-B5:** agree. A fixed number of runs per gate, no retry-on-near-miss, an interval reported.
- [x] **Q-B6:** agree. Hugging Face searches ask first, showing the query, once your data is loaded.
- [x] **Q34:** **Claude only for now.** The evaluation model is a Claude model, a different one from
      the analyst where possible, and its scores are marked `same-provider`.

- [x] **Q36:** **option B.** The evaluation model can block a phase only when it is calibrated, a pre-set floor is breached (any rubric criterion below 2.5/5, or a drop of more than 0.5), **and** a human peer confirms. Otherwise it reports.

### Audit questions: answered on 2026-10-03

- [x] **Q-A1:** Claude must not auto-merge PRs; **a human merges every PR** (DS-23). Agents are
      blocked from merging by a deny rule, and protected paths need a maintainer's approval
      through CODEOWNERS.
- [x] **Q-A2:** agree. CI re-checks the verdict, and checks are required. The repository is
      **public**, so branch protection is free.
- [x] **Q-A3:** **the maintainers** approve any spend over a phase's approved amount, as a new decision.
- [x] **Q-A4:** agree. A new decision supersedes DS-18's old review clause at sign-off.
- [x] **Q-A5:** yes. Maintainers hold the holdout seeds (not committed).
- [x] **Q-A6:** agree. Gates pass on the median with the interval reported; M-14 in P20 is report-only.

---

## 3. Housekeeping

- [ ] **Commit locally** on `plan/planning`: `planning/`, the four new skills (`using-agent-skills`, `spec-driven-development`, `planning-and-task-breakdown`, `spec-designer`), the `plan-auditor` agent, the CLAUDE.md edits, the npm script `plan:html` and the ignore entries. **Pushing is a separate approval.**
- [x] **`package-lock.json`:** the older drift of 90 removed `libc` lines is reverted to `main`. Pinning the npm version stays with P10-07 (P10 Q29).

---

## 4. Roadmap wording changed from the P10 answers (applied in v0.3)

All applied on 2026-10-03, in the roadmap v0.3 and the affected phase plans. They take effect when P10 is signed off.

| Change                                                                                                                                                                    | Source                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Test-set lock: scored **once per analysis** on the final model, not "once per model family" (glossary, PA-06)                                                             | P10 Q15                                                       |
| M-02: detection counted **only from structured fields** that name the affected column, not "explicit statement"                                                           | P12 Q6                                                        |
| M-09: **median ≤ $0.75 and ≤ 10% of runs hit the $1 cap**, instead of "≤ $1"                                                                                              | P10 Q21                                                       |
| M-17: add **quadratic-weighted κ ≥ 0.6** to the ±1 agreement                                                                                                              | P10 Q35                                                       |
| §12 schemas: plan design fields and revisions, lesson `effect`, review pack, state card, key-results `kind`, `lessons_used`, limitations                                  | P10 Q5, Q25, Q38; P14 Q10; P16 Q2; P19 Q2, Q6; P20 Q3; P21 Q4 |
| New work items: **P11-15** schema versioning, **P13-09** runtime integrity, **P14-10** model availability                                                                 | P10 Q45                                                       |
| New hardening item in P23: Electron fuses (disable `NODE_OPTIONS`, keep RunAsNode)                                                                                        | P13 Q7, P23 Q1                                                |
| Holdout split into **holdout-a** (P20) and **holdout-b** (P22), plus a fresh synthetic **holdout-c** at the P22 freeze                                                    | P20 Q10, P22 Q2                                               |
| Calibration moves from P12 (pilot only) to **P16** (full)                                                                                                                 | P12 Q11                                                       |
| Roadmap §10 P10: DS-01..DS-23; D10-8; EC10-6..EC10-8; P10-09                                                                                                              | Audit rounds 1–2                                              |
| M-19 provenanced fraction (denominator = numeric tokens extracted by code)                                                                                                | Q20 resolutions                                               |
| M-07 higher-is-better; M-08 on the key's held-back horizon; M-03 from labelled flags; M-14 report-only in P20                                                             | Q20, Q14, Q19 resolutions                                     |
| Gate statistics: fixed runs per gate, task-bootstrap interval (per Q-B5)                                                                                                  | Q-A6, Q-B5                                                    |
| NFR-07: "nothing is sent anywhere except the chosen provider" → the egress allowlist (Q10)                                                                                | Q10 resolution                                                |
| §18.3.4 review: code-computed verdict, base-branch verification, human merge, CODEOWNERS                                                                                  | DS-22, DS-23                                                  |
| §18.3.5 push: every push asks (settings rule), best-effort                                                                                                                | DS-10                                                         |
| §18.3.6: holdout seeds held by maintainers, not committed; dev seeds committed                                                                                            | Q-A5                                                          |
| §7.3: judge "at temperature 0" → "where the model supports it, else double-scored"                                                                                        | P10 Q34                                                       |
| New NFRs from Q45 (upgrade safety, runtime supply chain)                                                                                                                  | Q45                                                           |
| `_TEMPLATE.md`: "holdout opened only in P22" → except holdout-a once in P20                                                                                               | P20 Q10                                                       |
| §7.0 and §7.3, NFR-17, P12 EC12-5, P16 Q9: the evaluation model **can block on clear failures** (calibrated + pre-set floor + peer confirmation), no longer "never gates" | P10 Q36 (option B)                                            |
| §18.1: maintainers (one or more) with a second code owner (per Q-B2)                                                                                                      | Q-A3, Q-B2                                                    |
| §7.3, NFR-17, R-16: Claude-only judge that is never a model the run used (per Q-C2)                                                                                       | Q34, Q-C2                                                     |
| P12-07: remove `--max-usd` override wording; the runner hard-blocks (DS-21)                                                                                               | Q-B3                                                          |
| P12 Q7 noise rule → fixed runs per gate (Q-B5)                                                                                                                            | Q-B5                                                          |
| P11, P12, P16 Q9, P22 binding-context rows: "judge never gates" → option B                                                                                                | Q36                                                           |
| §9: P10 size S → M                                                                                                                                                        | Audit round 1                                                 |
| Note: §18.3.4 (review) and §18.3.7 (money) were updated early, with maintainer decisions; sign-off re-checks them against the final DS-21..DS-23                          | R3-16                                                         |

---

## 5. Later, by design

- [ ] **P10 work itself:**
  - [ ] the five `docs/ds/` documents
  - [ ] repo hygiene (`/finish-phase` push rule, commit scopes, README status)
  - [ ] the automated review suite: reviewer agents, `/review-suite`, CI verdict check (P10-09, DS-22)
  - [ ] `CONTRIBUTING.md` with the PR and issue templates and the issue-sync script
- [ ] **The `context-engineering` skill:** planned for P11-13. The router already points to it.
- [ ] **P11 onward:** one phase at a time, through the gates in `spec-driven-development`.

---

## Where things are

- [Planning index](README.md) · [Roadmap](roadmap.md) · [Repo audit](audit/repo-audit-2026-10-02.md)
- Questionnaires: `plans/P10-questionnaire.md` … `plans/P23-questionnaire.md`
- Skills: `.claude/skills/using-agent-skills/` (start here), `spec-driven-development/`, `planning-and-task-breakdown/`, `spec-designer/`
- Agent: `.claude/agents/plan-auditor.md`
