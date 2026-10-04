# P16 Plan: Statistical Inference (MVP gate)

| Field     | Value                                                                                                                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P16 of P10–P23 (roadmap §10)                                                                                                                                                                                                                                                                                                                                        |
| Milestone | MVP v0.1 Trust (gate)                                                                                                                                                                                                                                                                                                                                               |
| Objective | Answer "is it real, and how big?" correctly                                                                                                                                                                                                                                                                                                                         |
| Entry     | P15 closed; **the maintainer's approval of this phase's planned API spend (D-034) before session 5**                                                                                                                                                                                                                                                                |
| Spend     | Planned **≈ $140**: up to two pre-gate dev runs per provider on the P16 subset (≈ $40 at most); the official gate, 3 runs × 2 providers on the subset, **run and paid by a maintainer** (P12 Q-J5, ≈ $60); a contingency for one void re-run under P12's void rule (≈ $20); judging for the D-038 floor and the 30 calibration items (≈ $20). No gate retry (D-036) |
| Size      | L (8 sessions)                                                                                                                                                                                                                                                                                                                                                      |
| Branch    | `phase-16-inference`                                                                                                                                                                                                                                                                                                                                                |
| Inputs    | `docs/ds/04-method-policy.md` · D-035, D-036, D-038 · P10 Q13, Q14, Q35 · P12 Q11 · P14 (plan locks, artifact writer) · P15 (check registry, principle 7)                                                                                                                                                                                                           |
| Outputs   | D16-1 statistician sub-agent + skills (`statistical-testing`, `ab-testing`, `regression`) · D16-2 inference checks · D16-3 chart templates · D16-4 full judge calibration · D16-5 MVP gate results                                                                                                                                                                  |
| Status    | Audited (3 rounds, `P16-audit.md`); all findings fixed; maintainer defaults pending (Q-P, Q-S, Q-W); awaiting sign-off                                                                                                                                                                                                                                              |

**Rule for the phase:** inference and the MVP gate. No predictive modelling (that is P17).

**Terms.** _Plan-locked fields_ are what the agent declares in its first `save_plan` and can't
change (P14-11): outcome column, group column, pairing key, direction, hypotheses, and **the
chosen test per hypothesis**. Before `save_plan`, code gives the agent n per group and the outcome
type through `describe_design`, a controller fact that returns counts only (not a row-returning
read), so the test isn't locked blind. _External design fields_ are what the agent can never set:
they live in the `studyDesign` record (named so to avoid clashing with P14's "fields that grant
authority"). A _family_ is all confirmatory hypotheses on the same outcome **source column, followed
through lineage** (P15), in one analysis (in the app), or the task's family (on the bench).
_Exploratory_ results are hypotheses in a plan written after a row-returning read of the outcome,
unless the user's question names them (as P14 defines), or hypotheses the agent marks exploratory
**before** its first row-returning read; they carry a mandatory "exploratory" label and are never
part of a family. The _acceptable set_ is the list of tests the shared table allows for a design.
_Tools exist by P16_ means the questions in `docs/ds/05`'s P16 subset (frozen before session 5).

**Where design fields come from (P16 audit, A1 and round 2, M5):**

- **The agent declares the plan-locked fields**; code computes n per group and the outcome type
  from the snapshot.
- **External design fields** live in a typed `studyDesign` record that **main** stores per dataset (an analysis-level record overrides it). It is set through a new zod IPC channel from a "Study design" panel in the UI, or, in the **bench build flavour only** (unreachable in packaged builds), from the runner's task manifest. **It locks at the analysis's first row-returning read** (Q-W1): later UI changes are journalled, shown as late, and apply only to a new analysis. Defaults when nothing is set: confirmatory, unweighted, not randomised, no planned allocation. Agent text can never set them; each path has a test. P17 extends the record with the entity column, the target event's timestamp column and the subgroups.
  dataset or analysis. It is set through a new zod IPC channel from a "Study design" panel in the
  UI, or, in the **bench build flavour only** (unreachable in packaged builds), from the runner's
  task manifest. Defaults when nothing is set: confirmatory, unweighted, not randomised, no planned
  allocation. Agent text can never set them; each path has a test. P17 extends the record with the entity column, the target event's timestamp column and the subgroups.

**What is scored (roadmap §8.3 principle 7):** every reported p-value or test statistic in the
key-results block must reference an entry in a structured `tests[]` list, and **every locked
confirmatory hypothesis must have one** (otherwise main raises a finding, and PA-05 counts it as
missing) (Q-W4). Each entry has `hypothesisId` (on the bench, an enum the task supplies), `family`,
`function` (a zod enum generated from `src/shared/ds/tests.ts`), `kwargs` (a per-function schema of
scalars and enums only: no callables, paths, objects or **formula strings**), `inputs` (`{dataset
id, column, group level, optional journalled select}`), and for regression a typed **design**
(outcome, covariate list, reference level per categorical, interaction pairs from an enum,
coefficient name, covariance type from an enum) (Q-W6); weights are resolved by code from the
`studyDesign` record. The statistic and p-value are **cited** to an output and resolved by code at
full precision; `correction` and `pAdjusted` are claimed, and the scorer **recomputes Holm with m
from the plan lock** (Holm for confirmatory families, BH only where the `studyDesign` record says
screen; the `alternative` kwarg must match the locked direction). The **scorer recomputes each
entry** in a child process with an explicit env (rule 5), dispatching through a fixed table (never
`getattr` or `import` on agent strings), within a relative tolerance of 1e-6. Before running any
journalled `select`, it **re-validates it with P14-01's parser** against the run's recorded source
hashes and runs DuckDB with external access off, read-only and single-threaded; anything else is
`not recomputable` (an escape fixture tests this). **Matched** = in the acceptable set, equal to the
locked test, and recomputed within tolerance (Q-W5). A `not recomputable` claim, an agent-caused
error and a `recompute_error` all count as unmatched, unless the scorer's own self-test fails (then
the run is void). **PA-05's denominator is the key's inferential hypotheses**, each matched,
unmatched or missing. Kernel instrumentation of test calls is advisory (`source: kernel`).

---

## 1. Inherited Decisions and Inputs

| Source           | What it forces in P16                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-035, P10 Q13   | Welch default; method chosen before testing; Holm per family (on the bench, families come from the task); BH for screens; weights only when declared |
| P10 Q14          | Causal wording flagged by code; the critic adjudicates from P19; until then flags are shown to the user                                              |
| D-036            | MVP gate = median of 3 runs per provider, fixed in advance, no retry on a near miss; task-bootstrap intervals                                        |
| D-038            | The judge may block on clear failures with peer confirmation; P16 is the first gate where calibration can pass                                       |
| P10 Q35, P12 Q11 | Full 30-item calibration happens here                                                                                                                |
| P10 Q33          | PA-05 becomes a gate                                                                                                                                 |
| P14, P15         | Plan locks; main is the single artifact writer; the check registry; kernel findings are advisory                                                     |

## 2. Session Plan

| Session | Work items     | Output                                                                                   |
| ------- | -------------- | ---------------------------------------------------------------------------------------- |
| 1       | P16-01         | Statistician role; the shared acceptable-test table; design-to-acceptable-tests function |
| 2       | P16-02, P16-03 | A/B and regression skills                                                                |
| 3       | P16-04, P16-05 | Weights by kind; inference checks; `tests[]` and the scorer's recomputation              |
| 4       | P16-06         | Chart templates written by main                                                          |
| 5–6     | P16-07         | Pre-gate dev run (paid); calibration labelling; judge agreement                          |
| 7       | P16-08         | Official gate (maintainer-run)                                                           |
| 8       | audit, summary | MVP summary (`docs/ds/mvp-summary.md`) and the "MVP declared" D-NNN                      |

## 3. Work Item Breakdown

### P16-01 Statistician and test selection

- [ ] Scope-table row (Q1); the three skills load **on demand** via `Skill` (§8.5), not preloaded; if M-18 shows the contract over 8k, the skill is split before the gate
- [ ] **One acceptable-test table** in `src/shared/ds/tests.ts`, exported as JSON for the bench generator and **generated into the skill**, so the runtime, the skill and PA-05's key use one mapping; test identity includes keyword arguments (`ttest_ind(equal_var=False)` is Welch, the default is Student)
- [ ] Code maps the design (plan-locked fields + code-computed n and outcome type + the `studyDesign` record) to the acceptable set (Q2); the **locked test** must be in it, and the scorer checks that each claimed test equals the locked one (D-035: chosen before testing)

**Done when:** the table drives both the app and the key generator, with tests.

### P16-02 A/B testing

- [ ] Skill: SRM check against the planned allocation **from the `studyDesign` record**, p < 0.001; **interim looks are out of v1.0** (one analysis at the planned sample size); MDE at the achieved n for a stated power (80%), never observed power; practical significance against a smallest effect of interest from the task or user, otherwise reported without a verdict (Q4)
- [ ] The skill thresholds (SRM p < 0.001, VIF > 10, Cook's d > 4/n, top 5 points, < 30 per group, < 10 events per variable, 80% power) join P14's enumerated policy constants through a D-NNN recorded **before** P16-02, so they don't count against M-04 or M-19

### P16-03 Regression

- [ ] Skill: OLS with HC3 by default; logistic regression with the robust covariance statsmodels supports for Logit (**to verify** by docs-researcher in session 1; not yet verified); diagnostics; influence flags the top 5 points with Cook's distance > 4/n (Q6)

### P16-04 Weights

- [ ] Weights declared with their **kind** in the `studyDesign` record; `docs/ds/04` and the answer key map each kind to an estimator and an effective n: frequency → `DescrStatsW`; **probability → weighted point estimates with sandwich (HC) standard errors, disclosed** (design-based variance with strata and PSUs is out of v1.0); analytic → `WLS`; disclosure in reports (Q5)
- [ ] Name heuristics only suggest a weight to the user, fenced as data; this never fires on bench data (names are opaque), so it is unmeasured there

### P16-05 Inference checks and claimed tests

- [ ] `tests[]` in the key-results block (P11-09 schema bump with migration), validated in zod when the block is written; `run_python`'s optional `question` field is kept only for advisory instrumentation, validated against the plan's question-id enum and fenced
- [ ] Main-side checks: a claimed test outside the acceptable set or different from the locked test; a locked confirmatory hypothesis without a `tests[]` entry; a family needing correction without the required method; a reported p-value or statistic without a `tests[]` reference; an exploratory result without its label; causal wording; tiny n (< 30 per group, or < 10 events per variable); "SRM not checked: no planned allocation" when the `studyDesign` record has none
- [ ] The **Simpson probe** (round 3, A1): a `datadesk-ds` tool only the controller can call, using the plan-locked outcome and group, over every categorical with ≤ 10 levels (code enumerates them), with its own BH correction; it writes a journal entry tagged `source: probe`, which the scorer excludes from M-02 and M-03 credit
- [ ] The scorer's recomputation (P12) per the header; CI regenerates dev snapshots from the journalled `select` against the fetched and generated datasets; a test for the enum, the kwargs schema, the dispatch table and the env
- [ ] Kernel instrumentation of test calls: advisory only; a killed execution produces an advisory "test log incomplete" note

### P16-06 Charts

- [ ] Vega-Lite templates for Q-Q, residuals and a CI forest plot (Q10), built **by main** (the single artifact writer, P14) from journal outputs; ≤ 5,000 points with deterministic downsampling that keeps extremes; labels are `z.string().max(120)` and go only into title and text fields

### P16-07 Calibration

- [ ] Rubric bumped to `bench/rubric/v2` (Q7's unit-based anchor) **before** labelling; score comparability with P12/P14 judge scores breaks and is noted
- [ ] 30 items, two labellers, agreement report; items drawn from P12, P14 and P15 runs and the pre-gate runs, for spread; M-16 published only if M-17 passes (Q9)

### P16-08 MVP gate

- [ ] **Pre-gate rule (round 2, M7):** the gate starts only after a pre-gate run on the identical build meets every target on both providers. If a pre-gate fails, the phase continues with fixes and **one more pre-gate** is allowed (at most two); both are counted and disclosed in `docs/ds/mvp-summary.md`. **If the second fails, the MVP is not declared**; the summary records it, and continuing needs a new D-NNN (D-036)
- [ ] The official gate: 3 runs per provider on the P16 subset, on one identical **bench-flavour** build, **run by a maintainer**, against §5 (Q8). Each run is its own pass under D-034's $15 cap. A void run (P12 void rule) is re-run whole, that one run, from the contingency. M-11 is taken for both the bench and the packaged build. The roadmap folds the gate into P16-07; it is split out here because the gate has its own spend and runner (P12 Q-J5)
- [ ] `mvp-summary.md` states that the MVP is a **dev-only claim** on a dev set used since P14, measured on the bench build flavour, with no holdout evidence
- [ ] Holdout keys regenerated for the key-set version bump are recorded in a D-NNN (D-036 freezes them otherwise) and their commitments updated before P20

## 4. Deliverable Map

| Deliverable | File path                                                                                                                                                                                                                                                                                                                                                                                                           | Produced by    | Satisfies      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------- |
| D16-1       | `src/main/agent/claude/subagents.ts`; `resources/agent-plugin/skills/{statistical-testing,ab-testing,regression}/`                                                                                                                                                                                                                                                                                                  | P16-01..03     | EC16-1         |
| D16-2       | `src/shared/ds/tests.ts`; `src/main/checks/inference.ts`; `bench/scorer/recompute/`; `docs/ds/04` table                                                                                                                                                                                                                                                                                                             | P16-01, 04, 05 | EC16-1, EC16-4 |
| D16-3       | `src/shared/chartTemplates/`; main's chart writer                                                                                                                                                                                                                                                                                                                                                                   | P16-06         | DoD-2          |
| D16-4       | `bench/rubric/v2.md`, `bench/calibration/` + agreement report                                                                                                                                                                                                                                                                                                                                                       | P16-07         | EC16-5         |
| D16-5       | `bench/results/p16/`                                                                                                                                                                                                                                                                                                                                                                                                | P16-08         | EC16-1..5      |
| D16-6       | Key-results schema bump + migration (`tests[]` fields); the `studyDesign` record, its IPC channel and Study design panel; the bench-only task-manifest path; `create_chart` template-mode contract and the parity row in `docs/ds/07`; answer-key acceptable-set field and key-set version bump with the maintainer regenerating holdout keys; statistician contract in `docs/ds/06`; `docs/ARCHITECTURE.md`; tests | P16-01, 05, 06 | DoD-2, DoD-3   |
| D16-7       | `docs/ds/mvp-summary.md`; "MVP declared" D-NNN                                                                                                                                                                                                                                                                                                                                                                      | session 8      | DoD-6          |

## 5. Exit Checklist (MVP gate)

| EC / DoD | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                 | State |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----- |
| EC16-1   | On the P16 subset (frozen and reviewed before session 5; **6–9 tasks**, including at least one A/B task with an SRM trap, one weighted task and one regression task, or the gap is reported as not exercised; all §5 metrics use it): M-01 ≥ 70%, M-02 ≥ 60% and M-03 ≥ 75%, both providers, median of 3, with task-bootstrap intervals; a gated metric with fewer than 5 tasks uses its point value and the summary states it has no interval (Q-W3) | `bench/results/p16/`                                     | Open  |
| EC16-2   | M-04 = 0, **M-19 ≥ 90%**, PA-09 unprovenanced half = 0, M-11 = 0 (per build), M-12 = 0 with a measurable fixture per channel                                                                                                                                                                                                                                                                                                                          | same                                                     | Open  |
| EC16-3   | M-09 median ≤ $0.75 with ≤ 10% cap hits; M-10 median ≤ 15 min                                                                                                                                                                                                                                                                                                                                                                                         | same                                                     | Open  |
| EC16-4   | PA-02 = 100%, PA-03 ≥ 60% (MVP) and PA-04 = 0; **PA-05 ≥ 70%** (MVP) over the key's inferential hypotheses, from the scorer's recomputation (0/0 fails)                                                                                                                                                                                                                                                                                               | same                                                     | Open  |
| EC16-5   | M-17 calibration result recorded. The scorer writes `judge-floor.json` (`breached: bool`, D-038's floor only; the "drop > 0.5" clause can't apply at P16 because rubric v2 has no prior calibrated scores). A breach **holds the gate** until a peer's confirm-or-dismiss record exists in `judge-block.json`; a confirmed block fails the gate **only if M-17 passed and the score isn't `same-model`** (D-038)                                      | agreement report, `judge-floor.json`, `judge-block.json` | Open  |
| DoD 1–8  | As roadmap §17                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                        | Open  |

## 6. Phase Risks

| Risk                                      | Mitigation                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A failed gate                             | Pre-gate rule (at most two pre-gates on an identical build); no retry without a new D-NNN (D-036)                  |
| Labellers disagree with each other        | Rubric anchors revised (v2) before the judge is assessed (P10 Q35)                                                 |
| Test-choice rules too rigid for real data | The acceptable set lists alternatives; outside it, a finding, not a block                                          |
| Dev overfitting before the MVP claim      | At most two pre-gates, disclosed; the MVP is stated as a dev-only claim; the holdout stays untouched until P20/P22 |

## 7. Hand-off to P17

- Statistician, checks registry and the `tests[]` claim pattern (P17 claims metrics the same way)
- MVP results: the baseline for v0.2
