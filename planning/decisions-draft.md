# Draft decisions D-030..D-045 (P10, not signed off)

| Field   | Value                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------- |
| Status  | **Draft.** Not in `DECISIONS.md`. These entries are appended there by P10-01 on the P10 phase branch, then signed off |
| Source  | DS-01..DS-23, the P10 questionnaire answers and the audit answers (Q-A, Q-B, Q-C, Q34, Q36)                           |
| Numbers | D-030..D-045 are reserved for these entries; the P11–P23 plans cite them by number                                    |

## D-030: Advanced-analysis track: scope and product identity (2026-10-03)

**Context:** Phases 0–9 delivered a SQL-only analyst. The maintainer wants it to grow into a
fuller analyst that other people can install, planned in `planning/` (DS-01, DS-03, DS-05, DS-07,
DS-13, DS-16, DS-17; P10 Q1–Q4, Q31).

**Decision:**

- DataDesk stays **a local AI data analyst**. v1.0 adds data wrangling, statistical inference,
  machine learning, time-series forecasting and self-learning.
- It is a **portfolio product**: Windows only. The primary reader is a data-literate analyst, and
  every answer opens with a plain-language headline.
- Code signing is deferred to P23, and v1.0 may ship unsigned with checksums.
- Planning documents reference only this repository.

**Alternatives:** a separate "data scientist" product (rejected: same app, same users);
non-technical mode first (deferred to v1.x).

**Consequences:** roadmap P10–P23 (`planning/roadmap.md` v0.3). Out of scope for v1.0: deep
learning, live databases, macOS/Linux, auto-update.

## D-031: Sandboxed Python compute (2026-10-03)

**Context:** Statistics and ML need Python, and agent-written code is a new execution surface
(DS-02; P10 Q8–Q11).

**Decision:**

- **Runtime:** Pyodide in a hidden, sandboxed window, gated by the P13 spike, with bundled
  CPython as the fallback.
- **Packages:** NumPy, pandas, SciPy, statsmodels, scikit-learn and pyarrow (or a fallback). No
  runtime installs, and installer growth ≤ 200 MB.
- **Data size:** Python works on ≤ 50M cells and ≤ 200 columns. Larger data is sampled by
  DuckDB, and the report must disclose it.
- **Per execution:** 120 s; memory warning on > 500 MB growth, hard kill at 3 GB.
- **Charts:** Vega-Lite in the app; notebooks rebuild the same charts with Altair.

**Alternatives:** CPython first (weaker isolation); typed tools only (no notebooks); the user's
own Python (no isolation).

**Consequences:** P11 ADR-01/02 and P13 gate the design. Pyodide's `js` FFI makes the host
choice security-critical.

## D-032: Providers, autonomy and per-analysis budgets (2026-10-03)

**Context:** DS-04, DS-06 and DS-08; P10 Q5–Q7, Q28.

**Decision:**

- **Providers:** every new feature works on Claude and OpenAI. The phase **exit** needs the
  parity test plus both providers' gates. A provider that can't do something gets a D-NNN waiver.
- **Autonomy:** fully autonomous runs. A non-blocking, schema-validated plan comes before any
  execution.
- **Per-analysis limits:** $1, 20 minutes of wall clock, and 3 retries per error class; any stop
  writes a partial report built by code.
- **Models:** one model for all roles for now, with a per-role model field (`inherit`) in the
  scope table.

**Alternatives:** Claude first, OpenAI later (rejected by DS-04); stage-by-stage check-ins
(rejected by DS-06).

**Consequences:** the existing $2-per-conversation setting stays; the lower limit wins.

## D-033: Privacy and egress (2026-10-03)

**Context:** DS-09; P10 Q10; audit rounds 2–3 (N-6, R3-8, R3-9); Q-B6.

**Decision:**

- **What the model sees:** aggregates and small samples only.
  - Rows are **counted by code**: ≤ 20 per call and ≤ 200 per analysis, including stdout lines,
    which are capped at 20 per execution. When the budget runs out, outputs become id-only.
  - Byte caps: 48 KB per analysis across stdout, stderr and results; 1 KB per traceback;
    200 characters per cell.
- **Egress allowlist:** data leaves the machine only to the chosen provider and, after the first
  data-reading call, to Hugging Face through calls the user approves one by one (an exception to
  DS-06).

**Alternatives:** byte caps only (they don't limit rows); unrestricted Hugging Face calls (an
injection-driven exfiltration path).

**Consequences:** NFR-07 rewritten; P10-04 records the allowlist.

## D-034: Money is planned until approved; paid runs are hard-blocked in code (2026-10-03)

**Context:** DS-08 and DS-21; P10 Q19, Q23, Q44; audit Q-A3, Q-B3, Q-C1. The maintainer asked for
"an explicit hard block".

**Decision:**

- **Estimates only:** every cost figure is a planned estimate, and agreeing to a plan is not
  approving its spend.
- **Approval file:** a maintainer approves each phase's spend in `bench/spend/approved.json`.
  Each entry names the phase, the contributor and the amount, and only maintainers own the file
  through CODEOWNERS.
- **The paid runner, in code:**
  - reads approvals from the **remote** phase branch, so a local edit doesn't count;
  - refuses agent sessions and non-interactive runs;
  - needs a human to type the approval id;
  - refuses a task the remaining amount can't cover;
  - has no override flag.
- **Agents:** permission rules also deny agents the paid entry point (best-effort).
- **Dev set:** 12 dev tasks within $15 per provider pass, with the judge included. Each
  contributor pays for their own runs.

**Alternatives:** contributor `--confirm` overrides (rejected); one shared phase cap (can't be
enforced across machines).

**Consequences:** P12-07 and the runner; review criterion 08 is a blocker.

## D-035: Method policy (2026-10-03)

**Context:** P10 Q13–Q18 and their audit resolutions.

**Decision:**

- **Inference:**
  - α = 0.05, two-sided unless the direction was declared beforehand;
  - effect sizes with 95% CIs, in the data's own units;
  - Welch's test by default, with the method chosen before testing, never by an assumption test;
  - Holm correction within a family (in the benchmark, families come from the task) and
    Benjamini–Hochberg for screens;
  - weights used only when declared.
- **Causal wording:** code flags it unless the design was randomised, the critic adjudicates, and
  dismissals stay visible.
- **ML:**
  - 80/20 split, with **test rows held outside the kernel** and scored **once per analysis** on
    the final model;
  - nested CV for n < 1,000;
  - group- and time-aware folds, with "temporal" decided by code;
  - scikit-learn families only;
  - tuning time-boxed: ≤ 100 s per search, ≤ 4 searches.
- **Forecasting:** seasonal-naive baseline, ETS and a small SARIMA grid, rolling-origin backtests,
  80/95% intervals with their coverage, and MASE.

**Alternatives:** "once per model family" (selection on the test set); test-then-switch
procedures (distorted error rates).

**Consequences:** `docs/ds/04` (P10-05); P16–P18 checks.

## D-036: Benchmark, metrics and gates (2026-10-03)

**Context:** DS-07, DS-13; P10 Q19–Q22; audit Q-A5, Q-A6, Q-B4, Q-B5; findings R3-11, R3-12.

**Decision:**

- **DS-Bench:**
  - 20 tasks: 12 synthetic and 8 openly licensed public tasks;
  - 12 dev and 8 holdout;
  - every trap category in both splits, plus clean control tasks.
- **Answer keys:**
  - computed only by code in a pinned reference environment, with key hashes committed;
  - revised only from dev runs, applied to every compared run, and frozen for the holdout.
- **Holdout custody:** **maintainers hold the holdout seeds and task definitions** (hashes
  committed). Holdout-a is used once in P20, and holdout-b plus a fresh holdout-c in P22.
- **Scoring:**
  - structured answer blocks, with tolerances set per question;
  - detections only from structured fields;
  - M-03 from labelled flags;
  - new M-19, the provenanced fraction over numeric tokens extracted by code;
  - M-09 as median ≤ $0.75 with ≤ 10% of runs hitting the cap;
  - M-17 adds κ ≥ 0.6.
- **Gates:** a fixed number of runs set in advance (1; 3 for P16 and P22), no retry-on-near-miss,
  and a task-bootstrap interval reported.
- **Re-scoring:** CI re-scores dev runs only; holdout runs are run or witnessed by a maintainer.

**Alternatives:** committed holdout seeds (anyone can regenerate the holdout); the
retry-on-near-miss rule (optional stopping).

**Consequences:** P12 builds this; P12 Q7's noise rule is superseded.

## D-037: Self-learning and dataset memory (2026-10-03)

**Context:** DS-12, DS-14; P10 Q24–Q27; P20.

**Decision:**

- **Sources:** lessons come from failed executions, method and critic findings, and corrections
  the user typed. Never from answer keys, scores or the judge.
- **Effects:** each lesson has a typed `effect` assigned by code.
  - Additive effects apply automatically, rendered from structured fields only.
  - Suppressive or unrecognised effects need approval.
  - Invariants (test lock, provenance, sandbox limits) can't be changed by any lesson.
- **Scope:** lessons are dataset-scoped until confirmed on ≥ 2 datasets. Retrieval injects at
  most 8 lessons or 1.5k tokens.
- **Dataset notes:** keyed by content hash. A note goes stale when its file changes, and only the
  user re-validates it.

**Alternatives:** free-text lessons applied automatically (injectable); embeddings (one provider
only).

**Consequences:** P20; lessons from holdout-a are purged by provenance before P22.

## D-038: The evaluation model: Claude Opus, blocking only on clear failures (2026-10-03)

**Context:** DS-20; P10 Q33–Q36; audit R3-10, R3-17; Q-C2.

**Decision:**

- **Layers:** four evaluation layers (code scorer, evaluation model, human labels, live signals),
  plus per-agent metrics PA-01..PA-11 that gate from the phase that introduces each role.
- **Model:** the evaluation model is **Claude Opus**. A run that used Opus in any role gets a
  `same-model` score that can't block.
- **Calibration:** 30 items, two labellers spread over several sessions, ±1 agreement plus κ,
  done in P16 and re-checked in P22.
- **Blocking (option B):** the judge blocks a phase only when all three hold:
  - calibration passed;
  - a pre-set floor is breached on the gate's dev tasks;
  - a peer who didn't run the pass confirms in `judge-block.json`.

**Alternatives:** never blocking (no teeth); a full gate on M-16 (gameable and noisy).

**Consequences:** NFR-17 and roadmap §7.3. OpenAI-lane passes also need an Anthropic key.

## D-039: Context engineering (2026-10-03)

**Context:** DS-19; P10 Q37–Q39.

**Decision:**

- **Context contracts:** one per role, with first budgets of 16k for the lead (report-only on
  the Claude path until P11 verifies it), 8k for specialists, 6k for the critic and 4k for the
  scout.
- **Output size:** tool outputs are shaped to 8 KB, and large objects are passed by id.
- **History:** compaction keeps a code-built state card. DataDesk compacts on OpenAI and relies
  on the SDK's compaction on Claude.
- **Enforcement:** the checklist is enforced by the PR template, review criterion 08, and tests
  that check each tool's maximum output size.

**Alternatives:** a 40k lead budget (about 3.6× over the $1 cap).

**Consequences:** ADR-09 (P11), the context builder (P14), M-18.

## D-040: Collaboration and the planning process (2026-10-03)

**Context:** DS-15, DS-18; P10 Q30, Q40, Q42, Q43; audit Q-A4 (made moot by Q-B2).

**Decision:**

- **Roles:** one or more **maintainers** plus contributors.
  - Maintainers decide disagreements; only one-way doors block work.
  - About 1 hour a week goes on reading plans.
- **Planning:** each phase has a plan and questionnaire. `/spec-designer` answers, the
  `plan-auditor` audits blind, then a maintainer signs off.
- **Branches:** work-item branches are squashed into a phase branch, and the phase branch is
  merged into `main`.
- **Tracking:** GitHub issues are generated from `ROADMAP.md`.
- **Review clause:** DS-18's "reviewed by someone other than the author" is **confirmed**; peer
  review restored it (D-041).

**Alternatives:** a single owner (the project is collaborative).

**Consequences:** P10-08 (`CONTRIBUTING.md`, templates, issue sync).

## D-041: Agent review plus human peer review; humans merge; hard rules (2026-10-03)

**Context:** DS-22, DS-23; P10 Q41; audit Q-A1, Q-A2, Q-B1, Q-B2; Critical findings in rounds 1–2.

**Decision:**

- **Two reviews per PR:**
  - the agent suite `/review-suite`: criteria loaded from the base branch, a verdict computed by
    code naming the reviewed SHA, and re-verification in CI from the base branch's scripts;
  - a **human peer who is not the author**.
- **Merging:** a human merges, and agents never merge or enable auto-merge.
- **GitHub settings (free, since the repository is public):**
  - a PR is required before merging, with required checks;
  - one non-author approval;
  - stale approvals are dismissed, and the most recent push must be approved;
  - code-owner review for the protected paths, with no admin bypass;
  - `scripts/check-repo-settings.mjs` asserts all of this.
- **Agent permission rules:** **hard permission rules** in `.claude/settings.json` deny merging,
  paid runs and answer-key reads. They ask before pushes, before edits to protected paths and
  before `npm install`, and the allow list is narrowed. These rules are best-effort; branch
  protection and the human merge are the real controls.

**Alternatives:** agent-only review with an author-run verdict (forgeable); no permission rules
(prompts only, against D-008).

**Consequences:** P10-07, P10-08, P10-09.

## D-042: Push rule (2026-10-03)

**Context:** DS-10, as amended after audit round 2.

**Decision:** every `git push` asks the person at the keyboard first, through an `ask` rule in
`.claude/settings.json` (D-008: settings and hooks, not prompts). `/finish-phase` prepares the
push, and the human approves or declines it.

**Alternatives:** pushes decided by each contributor's personal instructions (a prompt, not a
control).

**Consequences:** `/finish-phase` changes in P10-07.

## D-043: Derived datasets (amends D-010 and D-029) (2026-10-03)

**Context:** P10 Q12, Q32. D-010 makes dataset registration a security boundary with approval, and
D-029 limits deletion to DataDesk's own downloads.

**Decision:**

- **Storage:** derived datasets are Parquet files under `userData/datasets/derived/<id>/`, with a
  2 GB cap per analysis and atomic writes.
- **Approval (amends D-010):** they are registered **without** an approval prompt. Their sources
  were already approved, and the folder is DataDesk's own.
- **Deletion (amends D-029):** DataDesk may delete files whose real path is inside the derived
  folder. Lineage survives the removal of a parent, marked "parent removed".
- **Retention:** saved analyses are kept until the user deletes them, with a storage view.

**Alternatives:** a prompt for every derived dataset (noise); in-memory tables (lost on restart).

**Consequences:** P15; P23 storage view.

## D-044: Outputs and the analysis UI (2026-10-03)

**Context:** DS-11; P10 Q2, Q3.

**Decision:**

- **Execution code in the UI:** read-only and collapsed, showing the full local output, while the
  model sees only capped output.
- **Notebook export:** code from the journal, template explanations, and one labelled analyst
  cell.
- **Reports:** v2 sections, including methods, limitations, model cards and a provenance
  appendix.
- **Models:** saved models can be used to predict on new data.

**Alternatives:** editable code cells (break provenance).

**Consequences:** P14, P17, P21.

## D-045: Upgrade safety, supply chain and repo hygiene (2026-10-03)

**Context:** P10 Q29, Q45; P13 Q7; audit round 1.

**Decision:**

- **Upgrade safety:** every persisted schema has a `schemaVersion` with fixture-tested
  migrations (NFR-18, P11-15).
- **Supply chain:** the bundled Python runtime is pinned and hash-verified (NFR-19, P13-09).
- **Model availability:** aliases by default, with a clear error when a model id is missing
  (P14-10).
- **Electron fuses:** disable `NODE_OPTIONS` and CLI inspect, enable asar integrity, and keep
  RunAsNode for D-003 (P23-08).
- **Lockfile:** revert the lockfile drift and pin the npm version.
- **CLAUDE.md:** rule 6 also covers `bench/answer-keys/`.

**Alternatives:** leaving migrations until P23 (by then, data is already unversioned).

**Consequences:** P10-07, P11, P13, P14, P23.
