# DataDesk Advanced Analysis: Project Roadmap

| Field        | Value                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Document     | Advanced-analysis track roadmap (phases 10–23)                                                               |
| Version      | 0.3                                                                                                          |
| Status       | P10–P23 planned and audited; no phase signed off yet (D-030..D-045 drafted in `planning/decisions-draft.md`) |
| Maintainer   | Vlad (project owner; signs off phases and decisions)                                                         |
| Contributing | Open to contributors; how we work together is in §18 and `CONTRIBUTING.md` (P10-08)                          |
| Last updated | 2026-10-03                                                                                                   |
| Baseline     | `main` at `2e0040b` (Phase 9 merged). Audit: `planning/audit/repo-audit-2026-10-02.md`                       |
| Relationship | `ROADMAP.md` stays the execution checklist; this file is the plan it is filled from (§18)                    |

### Revision History

| Version | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2026-10-02 | First draft after the repo audit and four rounds of Q&A (decisions DS-01..DS-17 in `planning/plans/P10-requirements-and-scope.md` §1). Self-learning added on owner request (DS-14); product identity confirmed as a local AI data analyst (DS-17).                                                                                                                                                                                                                                                                                                                                                  |
| 0.2     | 2026-10-03 | Collaborative project (DS-18): contributor roles, review and branch rules (§18, P10-08). Context engineering as a design discipline (DS-19): §8.5, NFR-16, ADR-09, a contributor skill and a runtime briefing skill. Evaluation layers (DS-20): an evaluation model with a calibrated rubric, per-agent metrics (§7.2–7.3), NFR-17, ADR-10.                                                                                                                                                                                                                                                          |
| 0.3     | 2026-10-03 | **P10 answers applied.** Draft decisions D-030..D-045 (`planning/decisions-draft.md`) applied: test lock once per analysis; structured trap detection; M-03/M-07/M-08/M-09/M-14/M-17 redefined; new M-19; gate statistics with fixed runs; egress allowlist (NFR-07); new NFR-18/19; the judge is Claude Opus and blocks only on clear failures (option B); agent + peer review, human merge, hard permission rules; paid runs hard-blocked in code; holdout custody with maintainers; new work items P11-15, P13-09, P14-10, P23-08. Sources: `planning/plans/P10-questionnaire.md`, `P10-audit.md` |

---

## 1. Purpose and Vision

Grow DataDesk, a **local AI data analyst**, from SQL-only analysis (read-only DuckDB queries, Vega-Lite charts, Markdown/PDF
reports) into autonomous, **evidence-bound advanced analysis** on the user's desktop.
Given a dataset and a goal ("what drives churn?", "is variant B better?", "forecast next quarter",
"build a model that predicts X"), it:

1. frames the problem as a written analysis plan (question type, target, unit, metric, split);
2. profiles the data and cleans, joins and engineers features into **derived datasets** with
   recorded lineage, never touching the originals;
3. runs **statistical inference**, **machine learning** and **time-series forecasting** in a
   **sandboxed Python runtime** (pandas, NumPy, SciPy, statsmodels, scikit-learn), working with
   real numbers instead of having the model guess;
4. checks its own methodology with **deterministic code** (leakage, test-set reuse, multiple
   comparisons, causal language, unprovenanced numbers) plus a critic sub-agent;
5. **learns** from its mistakes, the critic's findings and the user's corrections, and from
   per-dataset notes, so the same mistake is not repeated next time;
6. delivers a **report** (with a methods section, assumptions and limitations), a **Jupyter
   notebook** that re-runs to the same numbers outside DataDesk, and **saved models** that can
   score new data later.

It is a **portfolio product** (DS-03): someone other than the author should be able to install
it on Windows, add a key, drop in a CSV and get a trustworthy analysis. It stays a **learning
project** too (CLAUDE.md): every phase has a learning-log entry, and the notebooks it writes are
meant to be read.

**Trust model in one sentence:** the agent writes code and prose, while _code_ runs the
analysis, records every result, computes every score and checks every number, so the agent
cannot grade itself.

> **How quality is measured.** The agent is measured on **DS-Bench**: datasets with planted traps
> (leakage, Simpson's paradox, missing-not-at-random, duplicates, imbalance, drift) plus openly
> licensed public datasets, with answer keys the agent never sees. DataDesk ships the Claude Agent
> SDK and the OpenAI Agents SDK with the **user's own API keys** (D-013, D-021), so cost in USD is
> a real budget dimension.

---

## 2. Starting Point (from the audit)

Full evidence: `planning/audit/repo-audit-2026-10-02.md`. Short version: the engineering base is
strong (840 unit tests and 39 e2e tests passing, 29 decisions, layered security, both providers,
packaged installer). Its analytical capability, though, stops at SQL.

| Capability          | Today                                                                        | Advanced-analysis need                                                           | Gap    |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Data access         | DuckDB views over CSV/Parquet/JSON/XLSX; Hugging Face download with approval | Same                                                                             | None   |
| Compute             | One read-only `SELECT`; 500-row cap (max 10k); 15 s timeout                  | Python: pandas, SciPy, statsmodels, scikit-learn on full tables                  | Major  |
| Derived data        | None. Views only, and writes are blocked by design (D-009)                   | Cleaned, joined, feature tables persisted with lineage                           | Major  |
| Statistics          | `profile_column` (quantiles, nulls, top values) and SQL aggregates           | Tests, CIs, effect sizes, power, multiple comparisons, survey weights            | Major  |
| Machine learning    | None                                                                         | Splits, baselines, CV, tuning, evaluation, saved models, predict                 | Major  |
| Time series         | SQL date bucketing only                                                      | Decomposition, ETS/ARIMA-family forecasts with intervals, backtests              | Major  |
| Verification        | `second_opinion` (an OpenAI LLM critic, optional)                            | Deterministic method checks plus number provenance                               | Major  |
| Reproducibility     | Timeline events in memory; artifacts by id                                   | Persisted analysis journal; notebook export that re-runs                         | Major  |
| Learning and memory | None: every conversation starts fresh, and reset loses it                    | Lessons from mistakes and corrections; per-dataset notes                         | Major  |
| Quality measurement | Unit and e2e tests with fake SDKs; no answer-quality benchmark               | DS-Bench with hidden answer keys and a scorer                                    | Major  |
| Charts              | Vega-Lite, sanitized and CSP-safe, inline data capped                        | Diagnostic charts: residuals, ROC/PR, confusion matrix, importance, forecast fan | Medium |
| Reports             | Markdown/PDF from findings                                                   | Methods, assumptions, limitations, model cards                                   | Medium |
| Providers           | Claude and OpenAI, plus compare mode                                         | Both, for every new analysis feature, from day one (DS-04)                       | Parity |

---

## 3. Scope

### 3.1 In Scope (v1.0 of the advanced-analysis track)

- Tabular data from the existing sources (local files, Hugging Face)
- Exploratory analysis and data-quality reports (extends `eda-checklist`)
- Data wrangling into **derived datasets**: filter, clean, impute, join, reshape, encode,
  engineer features, with lineage (DS-01)
- **Statistical inference:** descriptive statistics, hypothesis tests (t, Welch, Mann-Whitney,
  chi-square, Fisher, ANOVA/Kruskal), proportions, bootstrap CIs, effect sizes, power, A/B test
  analysis, multiple-comparison correction, OLS/logistic regression with diagnostics, survey or
  frequency weights when the data has them (DS-01)
- **Machine learning** (scikit-learn): regression, classification, clustering, PCA; baselines,
  CV, bounded tuning, evaluation on a locked test set, explanations (permutation importance,
  partial dependence), saved models and predictions on new data (DS-01, DS-11)
- **Time-series forecasting:** decomposition, seasonal-naive baseline, exponential smoothing and
  ARIMA-family models, backtesting, prediction intervals (DS-01)
- **Self-learning:** lessons from the agent's own mistakes, critic findings and user
  corrections, retrieved by context in later runs; per-dataset notes (DS-12, DS-14)
- Fully autonomous runs within a budget, with existing human approvals kept (DS-06)
- Outputs: report (MD/PDF) with methods and limitations, `.ipynb` export, saved models + predict
  (DS-11)
- Both providers (Claude and OpenAI) and compare mode for every new analysis feature (DS-04)
- DS-Bench: synthetic trap datasets plus openly licensed public datasets (DS-07)
- Windows x64 installer; code signing if a certificate is obtainable (DS-05)

### 3.2 Out of Scope (v1.0)

- Deep learning, GPUs, LLM fine-tuning, and image, audio or heavy-NLP data
- Gradient-boosting libraries outside scikit-learn (XGBoost, LightGBM, CatBoost) unless the P13
  spike shows they run in the sandbox
- Runtime package installation (`pip install`) and **any network access from analysis code**
- Live database connections (Postgres, warehouses) and data larger than one machine
- Deploying models as services or APIs; scheduled or batch retraining
- Causal inference beyond honest caveats (no DAGs, matching or IV in v1.0)
- Exporting derived datasets as files (not chosen, DS-11; they live inside DataDesk)
- macOS and Linux builds, auto-update, public website (DS-05)
- An unscored real-data pilot (DS-07: "no pilot")
- Model weight updates of any kind: "self-learning" means memory and retrieval, never training
  the LLM

---

## 4. Glossary

| Term                       | Definition                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Analysis**               | One user goal pursued end to end inside one conversation; has an id and a journal                                                                              |
| **Analysis plan**          | The first artifact of an analysis: question type, target, unit of analysis, metric, split, methods, budget. Not blocking (DS-06)                               |
| **Execution**              | One run of agent-written Python (or SQL) in the sandbox, with its inputs, code, seed, outputs, timing and status                                               |
| **Analysis journal**       | Append-only record of every execution and artifact in an analysis, **written by main (the analysis controller), never by the agent**                           |
| **Derived dataset**        | A table produced by an execution, stored as Parquet under `userData/datasets/derived/`, registered with lineage                                                |
| **Lineage**                | The chain from a derived dataset back to source files (content hashes) and the executions that produced it                                                     |
| **Claim**                  | A number or quantitative statement in an answer or report                                                                                                      |
| **Provenance**             | The link from a claim to the execution output that contains it. A claim without one is **unprovenanced**                                                       |
| **Method check**           | A deterministic test of methodology (e.g. test-set reuse, target leakage). Its result is a **method finding**                                                  |
| **Test-set lock**          | Code-enforced rule that a split's held-out test rows are kept outside the analysis kernel and scored **exactly once per analysis**, on the final model (D-035) |
| **Lesson**                 | A stored, retrievable piece of learned knowledge (§12.7). A **suppressive lesson** would make the agent skip a check or a warning                              |
| **Dataset notes**          | User-visible, user-editable notes for one dataset: dictionary, quirks, past findings                                                                           |
| **Trap**                   | A deliberately planted data problem in a DS-Bench dataset, with an id, category and expected detection                                                         |
| **Answer key**             | The expected answers and tolerances for a DS-Bench task. Generated by code from a seed; never readable by the agent                                            |
| **Sandbox / compute host** | The isolated runtime that executes analysis code (P13 decides: Pyodide in a sandboxed hidden window, CPython as the fallback)                                  |
| **Budget**                 | Per-analysis caps on USD, turns and wall clock; per-execution caps on time, memory and output size                                                             |

---

## 5. Assumptions and Constraints

| ID    | Assumption / Constraint                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-01 | A collaborative project: several contributors, with two maintainers who sign off phases and decisions (DS-18; maintainer answer to P12 Q-K2). Coding agents do much of the implementation, guided by the development skills (§18.1a). Work items in a phase can run in parallel. Human review time is about 1 hour a week on plans; PR review is automated (DS-22). Sizes are re-baselined at each phase end |
| AC-02 | Models are reached through the user's own Anthropic and OpenAI keys (D-013, D-021). Cost is real, and it is capped per analysis and per benchmark pass (DS-08)                                                                                                                                                                                                                                               |
| AC-03 | The six security rules in `CLAUDE.md` are non-negotiable and **extend to the sandbox**: no key, no network, no file outside a grant                                                                                                                                                                                                                                                                          |
| AC-04 | No real API calls in automated tests. Scored benchmark runs are a manual, opt-in script with a USD cap, never CI                                                                                                                                                                                                                                                                                             |
| AC-05 | Windows 10/11 x64 is the only target. Code signing is nice-to-have (DS-05)                                                                                                                                                                                                                                                                                                                                   |
| AC-06 | Fast-moving SDKs (Agent SDK, MCP SDK, OpenAI Agents SDK, DuckDB, Pyodide, electron-builder) are verified by `docs-researcher` before use and pinned with `--save-exact`                                                                                                                                                                                                                                      |
| AC-07 | The model sees aggregates and small samples only (≤ 20 rows per call, size-capped outputs); raw tables are never put in context (DS-09)                                                                                                                                                                                                                                                                      |
| AC-08 | Fully autonomous by default (DS-06): the agent does not stop between stages. Dataset registration and Hub downloads still need approval (D-010, D-020)                                                                                                                                                                                                                                                       |
| AC-09 | Each contributor uses their own API keys for manual and benchmark runs. Benchmark results stay comparable because every score records provider, model id, prompt and skill versions                                                                                                                                                                                                                          |

---

## 6. Requirements

### 6.1 Functional Requirements

| ID    | Requirement                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | The agent turns a goal into an **analysis plan** artifact before heavy work, and runs it autonomously within the budget                                                           |
| FR-02 | The agent profiles datasets and writes a data-quality report: types, missingness, duplicates, outliers, leakage suspects, target balance                                          |
| FR-03 | The agent creates **derived datasets** through sandboxed code; originals are never modified; lineage is recorded; derived datasets appear in the sidebar and can be removed       |
| FR-04 | The agent executes Python (pandas, NumPy, SciPy, statsmodels, scikit-learn) in the **sandbox**, with results returned as size-capped text and structured data                     |
| FR-05 | The agent performs statistical inference with assumption checks, effect sizes, confidence intervals and multiple-comparison correction, using weights when the data declares them |
| FR-06 | The agent trains and evaluates supervised models: baseline first, CV on the training set, bounded tuning, one locked evaluation on the test set, appropriate metrics              |
| FR-07 | The agent performs clustering and dimensionality reduction with validity measures and stability checks                                                                            |
| FR-08 | The agent saves models with a model card, and scores a new dataset with a saved model, checking that the schema matches                                                           |
| FR-09 | The agent forecasts time series with a seasonal-naive baseline, at least one statistical model, a rolling-origin backtest and prediction intervals                                |
| FR-10 | Every claim in a final answer or report is **provenanced** to an execution output, or visibly marked as unverified                                                                |
| FR-11 | Deterministic **method checks** run automatically and their findings are shown to the user and in the report                                                                      |
| FR-12 | A **critic** sub-agent reviews the plan and results, and the agent revises within the budget                                                                                      |
| FR-13 | The agent **learns**: it writes lessons from failed executions, method findings, critic findings and user corrections, and retrieves relevant lessons in later analyses           |
| FR-14 | The agent keeps **per-dataset notes** that the user can see, edit and delete; nothing learned applies silently                                                                    |
| FR-15 | The user can export a **Jupyter notebook** of an analysis that re-runs outside DataDesk to the same key numbers                                                                   |
| FR-16 | Reports include a methods section, assumptions, limitations, method findings and model cards                                                                                      |
| FR-17 | The UI shows the plan, executions (code and output), derived datasets, models, method findings and lessons                                                                        |
| FR-18 | Every new analysis feature works on both the Claude and OpenAI providers, and compare mode runs analysis tasks side by side                                                       |
| FR-19 | A saved analysis can be reopened (journal, artifacts, conversation) after restarting the app                                                                                      |

Acceptance criteria per FR and NFR are written in P10 (`docs/ds/01-requirements.md`).

### 6.2 Non-Functional Requirements

| ID     | Category        | Requirement                                                                                                                                                                                                                                                                                                                              |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Sandbox         | Analysis code has no network, no filesystem access except granted read-only inputs and its own scratch area, no process spawn, no keys, and no reach into the host's JS/Node APIs                                                                                                                                                        |
| NFR-02 | Security        | CLAUDE.md rules 1–6 hold unchanged. Every new IPC channel is zod-typed, and every new tool is allowlisted in the init guard and the scope table                                                                                                                                                                                          |
| NFR-03 | Limits          | Per execution: wall clock, memory and output-size caps, enforced by the host (kill on breach, recorded in the journal)                                                                                                                                                                                                                   |
| NFR-04 | Budget          | Per analysis: USD (default $1, DS-08), turns and wall clock; a breach ends the run with a partial report generated from the journal                                                                                                                                                                                                      |
| NFR-05 | Determinism     | Seeds are fixed and recorded; the same inputs, code and seed give the same numbers                                                                                                                                                                                                                                                       |
| NFR-06 | Provenance      | The journal is append-only and written by code; the agent cannot write, edit or delete journal entries, scores or answer keys                                                                                                                                                                                                            |
| NFR-07 | Privacy         | The model receives aggregates and ≤ 20 rows per call / ≤ 200 per analysis (counted by code across results and stdout lines); outputs are byte-capped; data leaves the machine only through the **egress allowlist**: the chosen provider, and Hugging Face calls approved per call once user data was read (D-033)                       |
| NFR-08 | Untrusted data  | Data values, column names, dataset cards and file contents are data, never instructions, including when they are echoed back through executions                                                                                                                                                                                          |
| NFR-09 | Offline compute | Every Python package ships with the app; nothing is downloaded at analysis time                                                                                                                                                                                                                                                          |
| NFR-10 | Performance     | A full benchmark task on a 1M-row × 50-column table completes within the wall-clock budget (target set in P10)                                                                                                                                                                                                                           |
| NFR-11 | Footprint       | Installer growth from the Python runtime stays within a budget set in P10 (today about 750 MB on disk)                                                                                                                                                                                                                                   |
| NFR-12 | Testability     | The sandbox runs for real in tests (it is local, like DuckDB); model providers are always faked                                                                                                                                                                                                                                          |
| NFR-13 | Learning safety | Lessons never come from answer keys; suppressive lessons need user approval; every lesson traces to its source execution or correction                                                                                                                                                                                                   |
| NFR-14 | Parity          | The Claude and OpenAI providers expose the same DS tools, sub-agents, limits and approvals, checked by a shared test                                                                                                                                                                                                                     |
| NFR-15 | Readability     | Generated code and notebooks are readable: named steps, comments that explain why, no dead cells                                                                                                                                                                                                                                         |
| NFR-16 | Context         | Every role has a **context contract**: what it receives, when, in what structure, and a token budget. Tool outputs are shaped before they enter context, and per-role context size is recorded in the journal (DS-19)                                                                                                                    |
| NFR-17 | Eval integrity  | The evaluation model is **Claude Opus**; a run that used Opus in any role gets a `same-model` score that can't block; it sees only the output and the answer key, uses a versioned rubric; its scores are reported only after calibration passes (M-17), and it may **block a phase only on clear failures** confirmed by a peer (D-038) |
| NFR-18 | Upgrade safety  | Every persisted file carries `schemaVersion`; migrations are fixture-tested; files newer than the app open read-only (D-045)                                                                                                                                                                                                             |
| NFR-19 | Supply chain    | The bundled Python runtime and packages are pinned and hash-verified at build and on first load (D-045)                                                                                                                                                                                                                                  |

---

## 7. Success Metrics and Targets

Proposed; they are confirmed in P10 (P10 Q19–Q21, Q34–Q36). "Dev" and "holdout" are the two
halves of DS-Bench (§10 P12).

### 7.0 How output is evaluated: four layers

| Layer                                 | What it judges                                                                                               | Who or what judges                                                                   | Gates a phase?                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------- |
| **1. Code scorer** (primary)          | Numbers, trap detection, provenance, model and forecast quality, reproducibility, cost                       | Deterministic scripts against code-generated answer keys                             | Yes                                |
| **2. Evaluation model** (Claude Opus) | What code cannot score: framing, method choice, whether conclusions follow, limitations, clarity             | A rubric-driven LLM judge, not the model under test, calibrated against human labels | No, reported next to layer 1 (Q36) |
| **3. Human labels**                   | Calibration of layer 2, and spot checks of layer 1                                                           | Contributors, on a fixed calibration set                                             | Indirectly (calibration target)    |
| **4. Live signals**                   | Real use, where no answer key exists: method findings, unprovenanced claims, critic findings, optional 👍/👎 | The app itself, stored locally                                                       | No                                 |

Per-run results are reported at two levels: **run-level** (7.1, the whole analysis) and
**per-agent** (7.2, which role caused a failure). **Gate statistics (D-036):** every gate uses a fixed number of runs decided in advance (1 for ordinary gates; 3 for P16 and P22), with no retry-on-near-miss, and reports a task-bootstrap 95% interval. The journal records which role made every call,
so both come from the same files.

### 7.1 Run-level metrics (code scorer)

| ID   | Metric                   | Definition                                                                                                                                                                                                                                           | MVP (v0.1)               | v1.0            |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------- |
| M-01 | Answer accuracy          | Task questions answered within the answer key's tolerance ÷ task questions                                                                                                                                                                           | ≥ 70%                    | ≥ 85% (holdout) |
| M-02 | Trap detection (recall)  | Planted traps detected ÷ planted traps; a detection is a **structured field** naming the trap category **and** its subject, never prose (D-036)                                                                                                      | ≥ 60%                    | ≥ 80%           |
| M-03 | Warning precision        | Warnings valid per the **answer key's labels** ÷ warnings raised; unlabelled subjects count as invalid; clean control tasks included (D-036)                                                                                                         | ≥ 75%                    | ≥ 90%           |
| M-04 | Unprovenanced claims     | Numeric tokens in the agent's final text (before code marks) with neither a valid citation nor an agent `[[unverified]]` mark (P11-04)                                                                                                               | 0                        | 0               |
| M-05 | Notebook reproducibility | Key results matched exactly when the exported notebooks re-run in a fresh sandboxed kernel of the same build ÷ key results of completed runs; M-05b (CPython child, tolerance tiers) reported beside it (FR-15 narrowing pending a D-NNN, P21 Q-AD1) | ≥ 90%                    | 100%            |
| M-06 | Test-set contamination   | Reported model metrics computed after a test-set-lock violation                                                                                                                                                                                      | 0                        | 0               |
| M-07 | Model quality            | Agent score ÷ reference score, oriented higher-is-better (reference ÷ agent for loss metrics), median over ML tasks                                                                                                                                  | ≥ 0.90                   | ≥ 0.95          |
| M-08 | Forecast quality         | Forecast tasks where the agent's MASE is below the seasonal-naive forecast's MASE on the **answer key's held-back horizon** (m from the key; P18 audit) ÷ forecast tasks                                                                             | ≥ 60%                    | ≥ 80%           |
| M-09 | Cost per task            | Median USD per task **and** share of runs hitting the $1 cap (per provider)                                                                                                                                                                          | ≤ $0.75 and ≤ 10% capped | ≤ $0.60         |
| M-10 | Duration per task        | Median wall-clock minutes per task                                                                                                                                                                                                                   | ≤ 15                     | ≤ 8             |
| M-11 | Sandbox escapes          | Escape-suite cases where analysis code reaches network, files, processes or host APIs outside the grant (measured **per build** and copied into each run, P13-03)                                                                                    | 0                        | 0               |
| M-12 | Injection compliance     | Instructions from injection fixtures (in data values, column names, cards) followed                                                                                                                                                                  | 0                        | 0               |
| M-13 | Repeated-mistake rate    | Per-task mean of failing executions with a non-`other` code-assigned error class, run 1 → run 3 of the learning sequence (executions per task reported beside it; < 10 in run 1 = not measurable) (P20 audit)                                        | n/a                      | ≥ 50% reduction |
| M-14 | Learning does not mask   | Trap recall after learning vs before; **report-only in P20** (holdout-a); in P22 a non-inferiority gate (δ = 0.10, paired task bootstrap) on holdout-b and holdout-c, or v1.0 ships with learning off (P22 audit)                                    | n/a                      | ≥ 1.0           |
| M-15 | Provider parity          | \|M-01 Claude − M-01 OpenAI\| on the same tasks (reported, not gated)                                                                                                                                                                                | report                   | report          |
| M-16 | Rubric quality           | Mean evaluation-model score (1–5) over the rubric criteria in 7.3, reported only once M-17 is met                                                                                                                                                    | ≥ 3.5                    | ≥ 4.0           |
| M-17 | Judge agreement          | Per criterion: within ±1 of the settled human label on ≥ the target share **and** quadratic-weighted κ ≥ 0.6                                                                                                                                         | ≥ 80%                    | ≥ 85%           |
| M-18 | Context size             | Median input tokens per role per task, against each role's budget from its context contract (NFR-16)                                                                                                                                                 | report                   | ≤ budget        |
| M-19 | Provenanced fraction     | Provenanced numeric claims ÷ **all numeric tokens extracted by code** from the rendered answer and report by the P11-04 tokenizer (spelled-out numbers: a v1.0 limitation; chart values are provenanced by construction)                             | ≥ 90%                    | ≥ 95%           |

### 7.2 Per-agent metrics (code scorer, from the journal's role attribution)

| ID    | Role          | Metric                                                                                                                                                                                                                      | Target (v1.0) |
| ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| PA-01 | Lead analyst  | Plan matches the task type in the answer key (descriptive / inferential / predictive / forecast)                                                                                                                            | ≥ 90%         |
| PA-02 | Lead analyst  | Delegation briefs that pass the brief schema and stay within the sub-agent's context budget                                                                                                                                 | 100%          |
| PA-03 | Profiler      | Planted data-quality traps reported in the profile ÷ planted data-quality traps                                                                                                                                             | ≥ 80%         |
| PA-04 | Wrangler      | Derived datasets with silent row loss or broken lineage                                                                                                                                                                     | 0             |
| PA-05 | Statistician  | Tests whose choice matches the answer key's acceptable set ÷ the key's inferential hypotheses (each claimed in `tests[]` and recomputed by the scorer; MVP ≥ 70%, P16 audit)                                                | ≥ 85%         |
| PA-06 | Modeler       | Test-set-lock violations (M-06) and model ratio vs reference per task (M-07; MVP ≥ 0.90, v1.0 ≥ 0.95; P17 audit)                                                                                                            | 0 / ≥ 0.95    |
| PA-07 | Forecaster    | Forecast plans evaluated only through the temporal lock with a code `selection` record for the dispatched selection (100%); the share whose backtest beats seasonal naive is reported over tasks with ≥ 2 folds (P18 audit) | 100% / ≥ 80%  |
| PA-08 | Critic        | Precision and recall of its findings against planted traps                                                                                                                                                                  | ≥ 85% / ≥ 70% |
| PA-09 | Report writer | Unprovenanced numbers in reports (M-04) and missing v2 sections                                                                                                                                                             | 0 / 0         |
| PA-10 | Every role    | Failed executions per task, and repeats of the same error class (M-13)                                                                                                                                                      | report        |
| PA-11 | Every role    | Cost and input tokens per role per task (M-09, M-18)                                                                                                                                                                        | report        |

### 7.3 The evaluation model

- **What it is:** a fixed prompt plus a versioned rubric (`bench/rubric/vN.md`), run by the
  scorer after a benchmark run, never during one. It sees the task, the agent's final answer and
  report, and the answer key; it never sees the transcript, so the agent's narration cannot sway it.
- **Rubric criteria (1–5 each, with anchored descriptions):** problem framing · method choice
  for the data and design · conclusions supported by the results · limitations and caveats stated
  · clarity for the intended reader (Q1) · honesty about uncertainty.
- **Model and independence (D-038):** **Claude Opus**, pinned by full id. A run that used Opus in any role gets a `same-model` score that can't block. Temperature 0 where the model supports it, otherwise scored twice and averaged. Output is JSON validated by a zod schema (§12.11). A Claude-only judge means OpenAI-lane passes also need an Anthropic key.
- **Blocking (D-038, option B):** it can block a phase only when (1) calibration passed (M-17), (2) a pre-set floor is breached on the gate's dev tasks (any criterion below 2.5/5, or a drop > 0.5 with non-overlapping task-bootstrap intervals), and (3) a peer who didn't run the pass confirms in `bench/results/<phase>/judge-block.json`. Otherwise it reports.
- **Calibration:** contributors hand-label a calibration set (Q35) with the same rubric. The judge's
  scores are reported (M-16) only while its agreement (M-17) meets target, re-checked whenever
  the rubric, the judge model or the prompts change.
- **Known biases, mitigated:** verbosity bias (length is not a criterion, and the anchors penalise
  padding); self-preference (independence); position bias (in compare mode both orders are scored
  and averaged).
- **Cost:** counted inside the benchmark pass budget (DS-08).

---

## 8. Architecture Overview (target)

### 8.1 Roles (sub-agents)

Existing roles are kept and narrowed; new roles are added. Every role is defined once in the
scope table (`src/main/agent/claude/subagents.ts`, D-017) and used by both providers.

| Role                            | Responsibility                                                       | Tools (indicative)                                                                                                            | Status  |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Lead analyst** (main session) | Frames the plan, delegates, integrates, answers                      | All read tools, `Agent`, `Skill`                                                                                              | Exists  |
| **Profiler**                    | Data-quality profile                                                 | Schema, samples, `profile_column`, `run_sql`, `run_python` (read-only)                                                        | Extend  |
| **Wrangler**                    | Derived datasets                                                     | `run_python`, `save_derived_dataset`                                                                                          | New P15 |
| **Statistician**                | Inference and regression                                             | `run_python`, `get_output`, `create_chart` (template mode), `get_schema`, `profile_column`, `describe_design`                 | New P16 |
| **Modeler**                     | ML: split, baseline, CV, tune, evaluate, save                        | `run_python`, `evaluate_on_test`, `save_model`, `save_pipeline_spec`, `predict` (split at `commit_plan`)                      | New P17 |
| **Forecaster**                  | Time series                                                          | `run_python`, `backtest`, `evaluate_on_test`, `create_chart` (split at `commit_plan`; `backtest` in the init-guard allowlist) | New P18 |
| **Critic**                      | Reviews the plan, method findings and results; cannot change results | No tools: the controller calls it with a code-built review pack (P19 audit)                                                   | New P19 |
| **Lesson phrasing** (P20)       | Phrases a lesson for the UI only; never in model context             | No tools; structured fields and a placeholder diff; 2k-token budget                                                           | New P20 |
| **Report writer**               | Report and model cards from provenanced results only                 | `save_report`, journal read                                                                                                   | Extend  |
| **Dataset scout**               | Hugging Face search                                                  | Unchanged                                                                                                                     | Exists  |

### 8.2 Components

```
Renderer ──typed IPC──► Main ──► Orchestrator (Claude | OpenAI)
                         │         │  sub-agents from one scope table; main stamps a correlation id on every tool call
                         │         ├─stdio─► datadesk-mcp   (DuckDB, catalog, charts, reports)        [exists]
                         │         ├─stdio─► datadesk-ds    (relay; snapshot DuckDB cache)           [new P14]
                         │         └─ HF MCP (remote, allowlisted)                                    [exists]
                         └─► Conversation controller (P11 Q1; analyses are phases inside it): journal · row/byte budget ·
                               USD meter · wall clock · split and test lock · kernel lease · role attribution
                               ▲ both MCP servers reach it over an authenticated pipe
                               └─► Compute host (sandboxed hidden window on compute://; P13 decides Pyodide/CPython)
                                     · inputs: Parquet snapshots, read-only · no network · no keys · per-execution limits
Code-only services (never an LLM): Analysis journal · Provenance checker · Method checks ·
Notebook exporter · Lesson store and retriever · Context builder · DS-Bench scorer
Bench-only, outside the app: Evaluation model (rubric judge, §7.3)
```

### 8.3 Design principles

1. **Code, not the agent.** Anything scored, safety-relevant or reproducible is done by code:
   the journal is written by main's analysis controller (P11 Q1); splits and test locks are tool state; provenance and
   method checks are deterministic; scores come from the scorer. Agents write code, plans and
   prose only.
2. **Rows stay home.** The sandbox sees full tables; the model sees capped outputs (AC-07).
3. **One table, two providers.** Tools, sub-agents and limits are declared once and consumed by
   both orchestrators (D-017, D-021); a parity test fails if they diverge (NFR-14).
4. **Fail closed.** An unknown tool, a missing sandbox, a limit breach or a failed check ends or
   flags the work. It never silently continues.
5. **Learn as data, apply with consent.** Lessons are records retrieved into context and never
   self-edited prompts. Anything that would suppress a check needs the user (NFR-13).
6. **Curated context.** Each role sees the right information at the right time, in a fixed
   structure and within a budget. Too little and it guesses; too much and it loses focus (§8.5).
7. **Kernel instrumentation is advisory.** Agent code owns the kernel, so anything recorded
   inside it (test logs, row-loss logs, fit logs) can be forged or bypassed. Its findings are
   shown to users tagged `source: kernel`, but never feed a gated metric, a trap detection, a
   family count or a lesson. Scored facts come from main (artifact facts, journal records),
   from structured fields, or from the scorer's own recomputation (P11-16, P13, P15 audit).

### 8.4 Compute host options (decided in P11 ADR, proven in P13)

| Option                                                 | Isolation                                                                                                                                                    | Packages                                                                                   | Speed                                                              | Risk                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pyodide in a sandboxed hidden window** (rec., DS-02) | Chromium renderer sandbox on its own partition and `compute://` scheme; CSP `connect-src` limited to `compute:`; session blocks every other request; no Node | NumPy, pandas, SciPy, statsmodels, scikit-learn ship as Pyodide packages (verify versions) | 1.5–3× slower than CPython, single-threaded, wasm32 memory ceiling | **Python's `js` FFI reaches the host's JS globals, so the host must be a context where those globals grant nothing. Plain Node would be an escape.** |
| Bundled CPython (python-build-standalone)              | OS process in a Windows AppContainer via a native launcher (job objects and restricted tokens don't block sockets; P11-01)                                   | All of PyPI (bundled wheels)                                                               | Native                                                             | Native escape surface; network blocking on Windows needs a firewall rule or AppContainer                                                             |
| Typed tools only (no free code)                        | Strongest                                                                                                                                                    | Only what we implement                                                                     | Native (TS/DuckDB)                                                 | Rigid, no notebooks; rejected by DS-02                                                                                                               |

### 8.5 Context engineering (DS-19)

Context is the biggest lever on agent output quality. Context engineering is the practice of
deliberately deciding **what** each agent sees, **when** it sees it, and **how** it is structured.
In DataDesk it is a design discipline with an owner in code (the **context builder**), a contract
per role (NFR-16), a contributor skill and a runtime skill, and it is measured (M-18, PA-02, P22
ablations).

**What goes into a role's context, in layers (stable first, volatile last):**

| Layer            | Contents                                                                                         | When it enters                                 | Structure and budget                                  |
| ---------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| 1. System prompt | Role, rules, the untrusted-data rule, output contract                                            | Session start; stable, so it is prompt-cached  | Short, imperative; no examples that belong in skills  |
| 2. Skills        | Method know-how (EDA, testing, ML workflow, forecasting, report format)                          | On demand via `Skill` (progressive disclosure) | Name and description up front; body only when invoked |
| 3. Task brief    | What the lead hands a sub-agent: goal, dataset ids, relevant facts, constraints, expected output | At delegation                                  | **Brief schema** (zod): required fields, size cap     |
| 4. Working set   | Schema card, profile summary, relevant lessons and dataset notes (top-k), plan excerpt           | Just in time, retrieved by the context builder | Tables and stable keys; top-k with a token budget     |
| 5. Tool results  | Execution outputs, query results                                                                 | As they arrive                                 | **Shaped:** capped, summarised, large objects by id   |
| 6. History       | Earlier turns                                                                                    | Compacted at a threshold                       | The journal is the memory; the transcript is not      |

**Rules the context builder and the skills enforce:**

1. **References, not payloads.** Datasets, charts, models and big outputs travel as ids. Agents
   fetch a slice only when they need it (this extends D-016's charts-by-id rule).
2. **Just in time.** Nothing is preloaded "in case". Lessons and notes are retrieved for the
   current task type, dataset and error class.
3. **Fixed structures.** Briefs, profiles, schema cards and results use the same headings and
   keys every time, so the model can find things, and code can validate and measure them.
4. **Fenced untrusted data.** Data-derived text sits in a clearly delimited block after the
   instructions, never mixed into them (NFR-08).
5. **Budgets per role.** Each context contract sets a token budget. The builder trims
   lowest-relevance items first and records what was dropped in the journal.
6. **Fresh context for sub-agents.** A sub-agent starts with its brief and working set only,
   never the lead's whole transcript (this keeps D-017's context isolation).
7. **Compaction keeps facts.** When history is compacted, decisions, numbers and open questions
   survive as a structured summary that links to journal ids.
8. **Measured, not assumed.** P22 ablates each layer (no shaping, full transcript, no lessons)
   to show it earns its tokens.

**Skills:**

- **For contributors:** `.claude/skills/context-engineering/SKILL.md` (P11-13), a checklist for
  anyone writing a system prompt, sub-agent, skill, tool description or tool output format. It
  covers the layers, budgets, references-not-payloads, structure, injection fencing, and how
  to test a change with the benchmark.
- **For the in-app analyst:** a runtime skill `delegation-briefs` (P14-09) that teaches the lead
  to write minimal, sufficient briefs in the brief schema. The schema check is code (PA-02).

---

## 9. Phase Overview

Phases continue the existing numbering (0–9 are done), so branches stay `phase-N-<slug>`.

| Phase | Name                                         | Depends on | Milestone      | Size |
| ----- | -------------------------------------------- | ---------- | -------------- | ---- |
| P10   | Analyst Requirements & Scope                 | Phase 9    | M1 Foundation  | M    |
| P11   | Analyst Architecture & Design                | P10        | M1 Foundation  | L    |
| P12   | DS-Bench & Scorer                            | P11        | M1 Foundation  | L    |
| P13   | Compute Sandbox Spike (gate)                 | P11        | M1 Foundation  | L    |
| P13b  | CPython host (only on a P13 no-go)           | P13 no-go  | M1 Foundation  | M    |
| P14   | `datadesk-ds`, Analysis Journal & Provenance | P12, P13   | MVP v0.1 Trust | L    |
| P15   | Data Wrangling & Derived Datasets            | P14        | MVP v0.1 Trust | M    |
| P16   | Statistical Inference                        | P15        | MVP v0.1 Trust | L    |
| P17   | Machine Learning                             | P16        | v0.2 Modeling  | L    |
| P18   | Time-Series Forecasting                      | P17        | v0.2 Modeling  | L    |
| P19   | Critic & Method Checks                       | P18        | v0.2 Modeling  | L    |
| P20   | Learning & Memory (self-learning)            | P19        | v0.3 Learning  | L    |
| P21   | Reproducible Outputs & Analysis UI           | P20        | v0.3 Learning  | L    |
| P22   | Evaluation & Benchmarking                    | P20, P21   | v1.0           | L    |
| P23   | Hardening, Packaging & Portfolio Polish      | P22        | v1.0           | L    |

Size: S ≈ 1–2 sessions, M ≈ 3–5, L ≈ 6–9 (a session is one sitting of Claude Code work plus
review). Re-baselined at every phase end (DoD-6).

**Why this order.** The benchmark (P12) and the sandbox gate (P13) come before any feature, so
that every later phase is measured and nothing is built on an unproven runtime. A benchmark
built after the features it measures cannot set their exit criteria. Provenance (P14)
comes before the analysis features so that no unprovenanced number ever ships. Learning (P20)
comes after the critic (P19), because lessons are mostly distilled from critic and method
findings.

---

## 10. Phase Details

### P10: Analyst Requirements & Scope

**Objective:** Define success precisely before building anything.
**Entry:** Phase 9 merged. **Branch:** `phase-10-ds-requirements`.

| ID     | Work item                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| P10-01 | Confirm vision and scope (§1, §3); record DS-01..DS-23 and the P10 answers as D-NNN entries in `DECISIONS.md` (done: D-030..D-045)                |
| P10-02 | FR/NFR acceptance criteria (`docs/ds/01-requirements.md`)                                                                                         |
| P10-03 | Confirm metric targets and measurement methods (`docs/ds/02-metrics.md`)                                                                          |
| P10-04 | Sandbox and data policy: grants, limits, what the model may see (`docs/ds/03-sandbox-and-data-policy.md`)                                         |
| P10-05 | Statistical and ML method policy: defaults for alpha, splits, tuning bounds, causal language (`docs/ds/04-method-policy.md`)                      |
| P10-06 | DS-Bench selection: trap catalogue and public dataset list with licences (`docs/ds/05-benchmark.md`)                                              |
| P10-07 | Repo hygiene from the audit: lockfile drift, `finish-phase` push rule (DS-10), commit-scope list, README status                                   |
| P10-08 | Collaboration setup (DS-18): `CONTRIBUTING.md`, PR and issue templates, branch and review rules, CLAUDE.md wording for several contributors       |
| P10-09 | Automated PR review suite (DS-22): weighted reviewer agents in `.claude/agents/reviewers/`, `/review-suite`, committed verdicts, CI verdict check |

**Deliverables:** D10-1 Requirements · D10-2 Metrics · D10-3 Sandbox and data policy · D10-4
Method policy · D10-5 Benchmark selection · D10-6 Hygiene commit · D10-7 Collaboration setup · D10-8 Review suite.
**Exit:** EC10-1 every FR/NFR has an acceptance criterion · EC10-2 every metric has a target and
a measurement method · EC10-3 the sandbox policy lists every grant and limit · EC10-4 every trap
category and public dataset has a licence and an expected detection · EC10-5 plan-auditor
verdict is READY · EC10-6 a non-author completes the CONTRIBUTING walkthrough · EC10-7 evaluation
rules confirmed by the maintainer · EC10-8 the review suite catches one planted violation per
security rule 3 of 3 and passes ≥ 5 clean PRs 3 of 3.
**Learn:** how to write measurable acceptance criteria; what makes a DS result trustworthy.

### P11: Analyst Architecture & Design

**Objective:** Design every component, interface and schema needed through MVP.
**Entry:** P10 closed.

| ID     | Work item                                                                                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P11-01 | ADR: compute host (Pyodide-in-sandboxed-window vs CPython), the FFI risk, the data hand-off format (Parquet/Arrow)                                                     |
| P11-02 | ADR: `datadesk-ds` as a second MCP server vs extending `datadesk-mcp` (process model, D-002/D-003 consistency)                                                         |
| P11-03 | ADR: analysis journal storage (per-analysis JSONL vs DuckDB file vs SQLite) and the single-writer rule                                                                 |
| P11-04 | ADR: provenance algorithm (number extraction, matching tolerance, how marks are rendered)                                                                              |
| P11-05 | ADR: derived dataset storage, lineage and lifecycle; interaction with D-009's read-only SQL                                                                            |
| P11-06 | ADR: model store (format, the pickle risk, load only inside the sandbox) and predict flow                                                                              |
| P11-07 | ADR: lesson store, retrieval (keyword/embedding), approval, decay                                                                                                      |
| P11-08 | ADR: provider parity mechanics (OpenAI agents-as-tools for the new roles, same scope table)                                                                            |
| P11-09 | Schemas in `src/shared/ds/` (zod) for §12; tool and IPC interface contracts                                                                                            |
| P11-10 | Threat model update: new tools, the sandbox, injection through code, model files                                                                                       |
| P11-11 | Budget design: USD, turns, wall clock, per-execution limits, partial-report-on-breach                                                                                  |
| P11-12 | ADR-09 context architecture (§8.5): a context contract per role (layers, structure, token budget), the brief schema, tool-output shaping, compaction, prompt caching   |
| P11-13 | Contributor skill `.claude/skills/context-engineering/SKILL.md`: checklist for prompts, sub-agents, skills, tool descriptions and output formats                       |
| P11-14 | ADR-10 evaluation design: the four layers (§7.0), judge independence, rubric versioning, calibration protocol                                                          |
| P11-15 | Schema versioning and migrations for everything persisted in `userData` (D-045)                                                                                        |
| P11-16 | ADR-11 split, test lock and evaluation isolation: kernel restart at split, train-only DuckDBs in both servers, evaluation kernel, metrics computed in main (P11 audit) |

**Deliverables:** D11-1 ADRs (as D-NNN entries plus `docs/ds/adr/`) · D11-2 zod schemas with
samples · D11-3 interface contracts · D11-4 threat model · D11-5 `docs/ARCHITECTURE.md` update ·
D11-6 context contracts (`docs/ds/06-context-contracts.md`) · D11-7 the context-engineering skill.
**Exit:** EC11-1 every §12 schema exists in zod with a valid and an invalid sample test · EC11-2
every new tool has an owner, inputs, outputs and failure modes · EC11-3 the threat model has an
attack sequence and a control for each new surface · EC11-4 every role has a context contract
with a token budget · EC11-5 plan-auditor READY.
**Learn:** ADRs, threat modelling, single-writer state, context engineering.

### P12: DS-Bench & Scorer

**Objective:** Be able to measure every metric in §7 before the features exist.
**Entry:** P11 closed (schemas exist).

| ID     | Work item                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P12-01 | Trap generator: seeded synthetic datasets, one or more traps each (the twelve categories of P12 Q2; drift is a v1.0 limitation); opaque names; fresh seeds and surface forms for the holdout                                                             |
| P12-02 | Public dataset fetcher: OpenML/HF/scikit-learn sources, licence recorded, checksum pinned (DS-13)                                                                                                                                                        |
| P12-03 | Task files: goal text, dataset, questions, tolerances; answer keys generated by code into `bench/answer-keys/` (git-ignored, never readable by the agent)                                                                                                |
| P12-04 | Reference models and baselines computed by the harness (for M-07, M-08)                                                                                                                                                                                  |
| P12-05 | Dev/holdout split of tasks; holdout seeds **and** task definitions held by maintainers (hashes committed); holdout-a used once in P20, holdout-b and a fresh holdout-c in P22                                                                            |
| P12-06 | Scorer: reads the immutable run directory (journal, key-results block, outputs, bench event log), never the agent's self-report; writes `bench/results/<phase>/<run-id>/score.json` and `summary.md`; coded task statuses; task-bootstrap intervals      |
| P12-07 | Runner: `npm run bench -- --provider <claude, openai or both> --tasks dev`; paid runs **hard-blocked in code** (approval from a maintainer-signed tag on upstream, per-contributor amount, interactive human approval id, refuses agent sessions; D-034) |
| P12-08 | Partial baseline of today's SQL analyst on the dev set (event-log metrics; the full "before" numbers come from P14's first gate)                                                                                                                         |
| P12-09 | Isolation: the agent reaches only registered dataset files (allowlist property, tested); deny rules for paid entry points                                                                                                                                |
| P12-10 | Evaluation model (§7.3): versioned rubric, judge prompt, zod-validated JSON output, `same-model` rule (D-038)                                                                                                                                            |
| P12-11 | Calibration **pilot** (10 items) to test rubric and tooling; the full 30-item calibration runs in P16 (M-17)                                                                                                                                             |
| P12-12 | Per-agent metrics (§7.2): role attribution in the journal schema; scorer breaks every run down by role                                                                                                                                                   |
| P12-13 | Score report: run-level, per-agent and rubric views side by side; diff against the previous comparable run; no agent prose                                                                                                                               |
| P12-14 | CI re-scores committed dev run directories offline (D-036)                                                                                                                                                                                               |
| P12-15 | Golden vectors from the reference env for main's metric code                                                                                                                                                                                             |
| P12-16 | Oracle passes: a scripted reference answer per task scores ≈ 100% (dev in CI; holdout by a second maintainer)                                                                                                                                            |

**Exit:** EC12-1 the scorer reproduces hand-checked scores on 3 fixture runs and CI re-scores a committed run · EC12-2 every metric M-01..M-19 and PA-01..PA-11 has a scorer function with fixture tests (later-sourced metrics listed in the P12 plan) · EC12-3 the partial baseline is recorded · EC12-4 the agent cannot read answer keys, results, the reference env or the holdout folder · EC12-5 calibration tooling works and pilot agreement is reported; no judge score is published before P16 · EC12-6 no committed file holds a holdout task, seed or key · EC12-7 the runner refuses unapproved, non-maintainer-approved, non-interactive and agent-session runs · EC12-8 oracle passes reach ≈ 100%.
**Learn:** evaluation design, leakage between eval and training, why a benchmark needs a holdout.

### P13: Compute Sandbox Spike (gate)

**Objective:** Prove a sandbox that is safe, fast enough and has the packages, or fall back.
**Entry:** P11 closed (ADR-01, ADR-02 and ADR-11 signed off).

| ID     | Work item                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P13-01 | Verify the current Pyodide version, its package list (scikit-learn, statsmodels, SciPy, pandas, pyarrow) and its Electron/Chromium compatibility (`docs-researcher`)                                                                                                |
| P13-02 | Hidden sandboxed compute window: no preload Node, own partition and `compute://` scheme, CSP `connect-src` limited to `compute:`, `session.webRequest` denies everything else, no navigation, offline package loading from `resources/`                             |
| P13-03 | Escape suite: allowlist assertion of reachable capabilities first, then cases from the threat model; local network canaries must record 0 hits; a result file for M-11                                                                                              |
| P13-04 | Limits: a timeout destroys the window; memory on `privateBytes` (500 MB growth warning, 2 GB kill (maintainer answer to P11 Q-D3, amends D-031), free-memory floor on every poll); per-output caps by `applyCaps` in main; coded statuses; a denial log of attempts |
| P13-05 | Performance on pinned, seeded workloads (1M × 50 and 250k × 200): load, groupby, OLS, logistic regression, HistGradientBoosting, random forest, ETS, halving search within D-035; cold start per lease                                                              |
| P13-06 | Packaged-app check: size added to the installer, offline start                                                                                                                                                                                                      |
| P13-07 | Child-process network guard for tests (carried since Phase 0); the compute host is a window and is covered by P13-03                                                                                                                                                |
| P13-08 | Go/no-go decision against the gate in `docs/ds/03` (values from P13 Q4); on a no-go, P13 stops and a CPython phase (P13b) follows before P14                                                                                                                        |
| P13-09 | Runtime integrity: Pyodide and packages pinned and hash-verified at build and first load (D-045)                                                                                                                                                                    |
| P13-10 | Channel ADR: minimal preload, typed envelope and pure `applyCaps` in main, an artifact class written only by main (P13 audit)                                                                                                                                       |
| P13-11 | Lease manager (3 analysis leases + 1 evaluation slot, partition pool) and the evaluation-kernel variant (P13 audit)                                                                                                                                                 |

**Exit:** EC13-1 the escape suite passes with canaries and a positive control (M-11 = 0) in dev and packaged builds · EC13-2 performance within the committed spec's gate, CPython measured on the same runner · EC13-3 every required package runs a smoke computation offline in the packaged app; integrity verified; installer growth ≤ 200 MB · EC13-4 go/no-go and compute CSP D-NNNs recorded · EC13-5 per-output caps hold in main against a hostile worker.
**Learn:** WebAssembly, browser sandboxing, why FFI is an attack surface.

### P14: `datadesk-ds`, Analysis Journal & Provenance

**Objective:** Run agent-written code safely and record every result, so that every number is
traceable.
**Entry:** P12 and P13 closed.

| ID     | Work item                                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P14-01 | `datadesk-ds` MCP server: `run_python` (inputs by dataset name, snapshot to Parquet, seed, limits), stdout/stderr/result capped, structured outputs                                                |
| P14-02 | Analysis journal: append-only, written by main's analysis controller; ids for executions and outputs; content hashes of inputs                                                                     |
| P14-03 | Provenance checker: extracts numbers from answers and reports and matches them to execution outputs; marks unverified ones                                                                         |
| P14-04 | Both orchestrators: tool allowlist, init guard, scope table, OpenAI function tools, parity test                                                                                                    |
| P14-05 | UI: code and output of each execution in the timeline/steps; provenance marks in chat and reports                                                                                                  |
| P14-06 | Analysis persistence: save and reopen an analysis (journal, artifacts, transcript from journal entries); Continue reopens the same analysis (FR-19)                                                |
| P14-07 | Budget and stops inside the controller: USD meter with per-call output caps, turns, active time, retries, stated maximum overshoot; a code-built partial report for every stop reason              |
| P14-08 | Bench: dev run on both providers; M-04 = 0 and M-19 ≥ 90% from now on; the full "before" numbers                                                                                                   |
| P14-09 | Context builder (ADR-09): tool-output shaping, references by id, the brief schema checked on every delegation, per-role budgets, tokens per role in the journal; runtime skill `delegation-briefs` |
| P14-10 | Model availability: aliases by default; "model not found" mapped to a clear message and a switch-to-default action (D-045)                                                                         |
| P14-11 | Split at `save_plan` (`commit_plan` from P19) for predictive and forecast plans (forecasts always temporal); authority-granting plan fields immutable after the first data read (P14 audit)        |
| P14-12 | CODEOWNERS and review applicability for the new security-critical paths (P14 audit)                                                                                                                |

**Exit:** EC14-1 M-04 = 0 and M-19 ≥ 90% on dev · EC14-2 M-11 = 0, M-12 = 0 · EC14-3 the parity test passes · EC14-6 controller tests · EC14-7 partial reports for every stop · EC14-8 counting-rule and env-scrub tests.
EC14-4 a reopened analysis shows the same journal · EC14-5 PA-02 = 100% (attempted delegations), PA-09 unprovenanced half = 0, and M-18 is recorded for
every role.
**Learn:** provenance, append-only logs, MCP server design, shaping what a model sees.

### P15: Data Wrangling & Derived Datasets

**Objective:** Clean and reshape data into new datasets without ever touching the originals.

| ID     | Work item                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P15-01 | `save_derived_dataset`: bytes staged by main; a keyless rewriter child writes the only file; main hashes it; the UI instance registers; the journal is the authoritative lineage; exact-file grants; conversation-private until kept |
| P15-02 | Lineage view in the sidebar (badge, "derived from", producing execution); removal reuses D-029                                                                                                                                       |
| P15-03 | Wrangler sub-agent and a `data-cleaning` skill (missingness strategies, outliers, encoding, joins, reshaping, dates)                                                                                                                 |
| P15-04 | Checks in main: silent row loss against the structured `row_change` disclosure, join explosion by key cardinality, `sampled` provenance; pandas instrumentation advisory and UI-only                                                 |
| P15-05 | Derived datasets are queryable by `run_sql` (D-009 still holds: still read-only, `allowed_paths` extended)                                                                                                                           |
| P15-06 | Bench: the gate run on the fixed dev set (tasks with `requires_derived_dataset` named in `docs/ds/05`)                                                                                                                               |

**Exit:** EC15-1 originals byte-identical (runner-recomputed hashes) · EC15-2 lineage correct (parents and hashes recomputed) for 100% of derived datasets · EC15-3 at least 3 of the 4 dev data-quality traps detected from structured `issues[]` on both providers, reported with a cluster note (P12 audit Q-K6) · EC15-4 PA-04 = 0 measured in main · EC15-5 descendants hidden after a split; hostile Parquet never reaches the keyed instance.
**Learn:** tidy data, joins, imputation and its risks.

### P16: Statistical Inference

**Objective:** Answer "is it real, and how big?" correctly. **Milestone: MVP v0.1.**

| ID     | Work item                                                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P16-01 | Statistician sub-agent and a `statistical-testing` skill: test choice by data type and design, assumptions, effect sizes, CIs, power                 |
| P16-02 | A/B testing skill: sample-ratio mismatch, peeking, CUPED (optional), practical vs statistical significance                                           |
| P16-03 | Regression skill: OLS/logistic in statsmodels, diagnostics (residuals, VIF, heteroscedasticity), interpretation                                      |
| P16-04 | Weights: detect declared weight columns; weighted estimates; the report says when weights were used                                                  |
| P16-05 | Method checks: multiple comparisons, p-hacking pattern (many tests, one reported), causal language without a design, tiny n, Simpson's paradox probe |
| P16-06 | Diagnostic charts: Q-Q, residuals, CI forest plot (Vega-Lite)                                                                                        |
| P16-07 | Full calibration (30 items, two labellers, spread over sessions); bench: inference tasks on dev; MVP gate with 3 fixed runs per provider             |

**Exit (MVP gate):** EC16-1 on dev questions whose tools exist by P16, M-01 ≥ 70%, M-02 ≥ 60% and M-03 ≥ 75%, both providers, median of 3, with bootstrap intervals · EC16-2 M-04 = 0, M-19 ≥ 90%, PA-09 unprovenanced half = 0, M-11 = 0 (per build), M-12 = 0 · EC16-3 M-09 median ≤ $0.75 with ≤ 10% cap hits and M-10 ≤ 15 min median · EC16-4 PA-02..PA-04 and PA-05 ≥ 70% from the scorer's recomputation · EC16-5 calibration recorded; no confirmed judge block (D-038).
**Learn:** hypothesis testing, effect sizes, why p-values mislead.

### P17: Machine Learning

**Objective:** Build models that are honestly evaluated, saved and reusable.

| ID     | Work item                                                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P17-01 | Split kinds chosen by code (stratified, grouped from a declared entity column; temporal and random from P14-11); `evaluate_on_test(model_id)` with a train-row pre-flight; metrics computed in main; nested CV for n < 1,000 |
| P17-02 | Modeler sub-agent and an `ml-workflow` skill: baseline (dummy) first, pipelines (no fit on test), CV, bounded tuning, metric choice, calibration                                                                             |
| P17-03 | Explanations in the analysis kernel on a validation fold (`source: kernel`); charts built by main from binned aggregates                                                                                                     |
| P17-04 | Model store: save inside the sandbox, model card (data, split, metrics, limits, intended use), list and remove in the UI                                                                                                     |
| P17-05 | Predict: refuses datasets descended from the active split source; schema check; drift; output as a derived dataset; the bench scoring dataset readable only by `predict`                                                     |
| P17-06 | Clustering and PCA with silhouette/stability, and an honest "clusters are not classes" note                                                                                                                                  |
| P17-07 | Leakage checks computed in main over the train snapshot (single-feature, post-outcome, entity, imbalance with accuracy); instrumentation advisory                                                                            |
| P17-08 | Bench: ML tasks on dev                                                                                                                                                                                                       |

**Exit:** EC17-1 M-06 = 0 (refused attempts reported separately) · EC17-2 M-07 ≥ 0.90 on dev ML tasks with intervals · EC17-3 the leaky feature excluded or disclosed on both providers; PA-06 median model ratio ≥ 0.90 with 0 lock violations · EC17-4 a saved model predicts after restart; a version mismatch shows "needs retrain".
**Learn:** the ML workflow, leakage, why the test set is sacred.

### P18: Time-Series Forecasting

| ID     | Work item                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P18-01 | Forecaster sub-agent and a `forecasting` skill: frequency detection, gaps, decomposition, seasonal-naive baseline                                                    |
| P18-02 | Models as typed specs: ETS, SARIMA, SARIMAX with calendar features or declared regressors; a code-owned `backtest` tool; prediction intervals                        |
| P18-03 | Temporal evaluation with no actuals in the evaluation kernel; refit on the full history after the lock; main-side checks (silent interpolation, look-ahead features) |
| P18-04 | Forecast fan chart                                                                                                                                                   |
| P18-05 | Bench: forecast tasks                                                                                                                                                |

**Exit:** EC18-1 non-statistical smoke gate on the pinned dev forecast tasks: M-08 ≥ 60% (refusals and horizon mismatches fail), PA-07 = 100%, 80% coverage within ±10 points on scorer-recomputed backtest folds · EC18-2 undeclared regressors refused and look-ahead attempts recorded, with M-03 ≥ 75% · EC18-3 no unresolved judge-floor breach.
**Learn:** autocorrelation, seasonality, why random splits break time series.

### P19: Critic & Method Checks

**Objective:** The agent catches its own methodological mistakes before the user does.

| ID     | Work item                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P19-01 | Check registry inventory: every main-side check from P15–P18 with a source and minimum severity, run by code at tool events (no agent tool)               |
| P19-02 | Critic: a tool-less model call made by the controller on the plan proposal and on result submission; structured, parsed by main; adjudicates causal flags |
| P19-03 | Revise loop: one round; findings close as fixed only when main's check had fired and stops firing, otherwise disclosed; limitations rendered by code      |
| P19-04 | (Dropped from v1.0 by the P19 audit: `second_opinion` would send data outside D-033's allowlist)                                                          |
| P19-05 | Bench: a fresh gate run on dev, both providers                                                                                                            |
| P19-06 | Per-role model experiment: critic role only, replaying journalled packs through two pinned models (OpenAI lane)                                           |

**Exit:** EC19-1 M-02 ≥ 70%, PA-08 recall ≥ 70% on critic-original findings · EC19-2 M-03 ≥ 80% from answer-key labels, PA-08 precision ≥ 85%, PA-01 ≥ 90% · EC19-3 every finding traces to a check id, a critic message or an `issues[]` entry in the journal.
**Learn:** LLM-as-critic vs deterministic checks, and where each fails.

### P20: Learning & Memory (self-learning)

**Objective:** The agent gets better with use, without masking problems. (DS-12, DS-14)

| ID     | Work item                                                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P20-01 | Lesson store (§12.7) in `userData/knowledge/` as an event log with `schemaVersion`; structured fields (type, effect, trigger, target, parameters); types: error fix, method, preference, parse hint (quirks live in notes) |
| P20-02 | Reflection step at the end of every analysis: code proposes lesson candidates from failed executions, method findings and corrections; the agent phrases them; code validates them                                         |
| P20-03 | Retrieval pushed by the context builder (no agent tool), rendered from structured fields into briefs and the working set (§8.5); retrieved ids recorded by code                                                            |
| P20-04 | Approval: non-suppressive lessons apply automatically (visible); suppressive lessons need the user's approval (P10 Q25)                                                                                                    |
| P20-05 | Confidence moves only when the trigger occurred; decay; merging and promotion by exact structural keys                                                                                                                     |
| P20-06 | Dataset notes: dictionary, quirks, past findings, keyed by content hash, stale when the file changes; editable in the UI                                                                                                   |
| P20-07 | "Learnings" panel: list, see source, edit, disable, delete                                                                                                                                                                 |
| P20-08 | Learning sequence: 3 dev runs from an empty store plus a lessons-off control run; holdout-a once before and after, maintainer-witnessed (M-14 report-only); lessons from holdout-a purged before P22                       |
| P20-09 | Guards: no lesson from answer keys or scores; lessons are untrusted text (an injection fixture tries to plant one)                                                                                                         |

**Exit:** EC20-1 M-13 ≥ 50% reduction (per-task failing executions), run 3 beating the lessons-off control · EC20-2 M-14 reported (report-only) · EC20-3 every lesson traces to a source · EC20-4 injected suppression and fake-correction lessons never apply without approval.
**Learn:** memory vs fine-tuning, retrieval, feedback loops that reinforce errors.

### P21: Reproducible Outputs & Analysis UI

| ID     | Work item                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P21-01 | `ReplayPlan` builder and notebook exporter: code-owned steps as generated cells, AST call allowlist, commented-out risky cells, canonical content hashes, `requirements.txt` for users                                        |
| P21-02 | Re-run harness: runs exported notebooks in a fresh compute-sandbox kernel (bench-only headless entry), never `bench/env`; the P12 scorer computes M-05 by exact equality in key results; M-05b in a CPython child is reported |
| P21-03 | Report v2 assembled by code with agent prose slots; disclosures (sampling, weights, exploratory, lineage, refit); PDF HTML built by main                                                                                      |
| P21-04 | Analysis UI: the plan card, execution cells, models, derived datasets, findings, lessons used                                                                                                                                 |
| P21-05 | Compare mode: both providers side by side with the method beside each value, cost and time; no benchmark scores in the app                                                                                                    |
| P21-06 | Kernel replay on Continue and model retraining, owned by the controller (deferred from P14 and P17)                                                                                                                           |

**Exit:** EC21-1 M-05 ≥ 90% per provider over every completed gate run, with intervals · EC21-2 every gate-run report section matches its source record, and "n/a" with a non-empty source counts as missing (PA-09 sections half) · EC21-3 e2e covers export, reopen and compare, plus the parity test · EC21-4 replay and retraining tests.
**Learn:** reproducibility, notebooks as communication.

### P22: Evaluation & Benchmarking

**Objective:** A formal, honest score on the holdout, for both providers.

| ID     | Work item                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P22-00 | Ablation switches in the bench build flavour only, before the freeze; absence asserted in the default build                                                  |
| P22-01 | Freeze: a code rc tag, then holdout-c, then a signed freeze tag carrying the freeze record (scorer, pinned ids, module-level evaluation paths, metric table) |
| P22-02 | Final runs on holdout-b and fresh holdout-c (separate passes), 3 fixed runs per provider; zero-target metrics 0 in every run, others by median; M-05 re-runs |
| P22-03 | Ablations on dev against an A/A control pair: no critic, no method checks (lessons measured by M-13/M-14)                                                    |
| P22-04 | Context ablations: no output shaping, full transcript instead of briefs, no working set; effect on M-01, M-02, M-09 and M-18                                 |
| P22-05 | Evaluation model on the holdout: re-check M-17 on 30 final-run items (D-038), then report M-16 per provider                                                  |
| P22-06 | Results report (`docs/ds/evaluation.md`) generated from committed aggregates and checked by CI                                                               |
| P22-07 | Learning sequence for M-13 and after-runs on holdout-b and holdout-c for M-14 (gated)                                                                        |

**Exit:** EC22-1 every v1.0 target met or explicitly waived with a D-NNN (M-04, M-06, M-11, M-12, PA-04,
PA-06's lock part and PA-09's unprovenanced half never waived; M-14 non-inferior or learning ships off) · EC22-2 a maintainer re-scores the holdout from the stored runs
and the tag · EC22-3 every context layer and every pipeline component has a measured effect
reported; a null result becomes a v1.x proposal.
**Learn:** ablations, variance across runs, LLM-as-judge pitfalls, honest reporting.

### P23: Hardening, Packaging & Portfolio Polish

| ID     | Work item                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P23-01 | Installer: Python runtime packaged, size budget (NFR-11), offline first run, uninstall leaves only userData                                                   |
| P23-02 | Code signing if a certificate is obtainable; otherwise document unsigned (DS-05)                                                                              |
| P23-03 | Storage hygiene: artifact, derived-dataset, model and journal cleanup UI (carried since Phase 3)                                                              |
| P23-04 | First-run onboarding: sample datasets, "try this" goals, key setup                                                                                            |
| P23-05 | Portfolio README: screenshots, demo GIF, architecture, benchmark results, security model                                                                      |
| P23-06 | Fresh-machine test: a standard user on Windows 10 and 11 installs and finishes a guided goal within 30 minutes, excluding the analysis run (P23 audit, D-NNN) |
| P23-07 | Release pipeline: maintainer-only tags, protected publish environment, draft release, attestations                                                            |
| P23-08 | Electron fuses: disable `NODE_OPTIONS` and CLI inspect, enable asar integrity, keep RunAsNode (D-045)                                                         |
| P23-09 | Diagnostics with allowlisted fields only, copied by main                                                                                                      |
| P23-10 | Upgrade and downgrade smoke over an existing `userData`                                                                                                       |

**Exit:** EC23-1 the fake-provider DS task passes on the bench flavour of the same commit with a
source-mapped bundle diff; the release asar passes the hook-free smoke, the fused-exe verification
and the escape suite (M-11 = 0), and its tree hash, recomputed from the signed freeze tag, matches ·
EC23-2 the fresh-machine test passes · EC23-3 the README results block is generated from P22 ·
EC23-4 storage, diagnostics and upgrade tests pass · EC23-5 the release pipeline refuses
non-maintainer, non-main and rc-tag releases.
**Learn:** shipping a Python runtime inside Electron.

---

## 11. Milestones

| Milestone          | Phases  | Outcome                                                                   |
| ------------------ | ------- | ------------------------------------------------------------------------- |
| **M1 Foundation**  | P10–P13 | Requirements, design, benchmark and a proven sandbox                      |
| **MVP v0.1 Trust** | P14–P16 | Runs Python safely, cleans data, does inference; every number provenanced |
| **v0.2 Modeling**  | P17–P19 | ML and forecasting, honestly evaluated; catches its own method mistakes   |
| **v0.3 Learning**  | P20–P21 | Learns from use; reproducible notebooks and reports                       |
| **v1.0**           | P22–P23 | Formally evaluated on the holdout, packaged, presentable                  |

---

## 12. Data Schemas (required fields)

Defined as zod schemas in P11 (`src/shared/ds/`), with types derived by `z.infer`.

### 12.1 Analysis

id · title · goal text · dataset ids · provider · model · plan (question type, target, unit,
metric, split, methods) · status (running / done / partial / failed) · budget (usd, turns,
wall clock) and spend · created · updated

### 12.2 Execution

id · analysis id · role · language (python / sql) · code · input dataset ids + content hashes ·
seed · started · duration · status (ok / error / timeout / memory / output_cap) · stdout (capped)
· result objects (tables, scalars, chart ids) with output ids · error class

### 12.3 Derived Dataset

id (uuid) · name · description · analysis id · conversation and lane · producing execution ids (every execution since the last kernel restart) · `parents` (dataset ids + hashes taken before and after each snapshot) · optional `parent_model_id` · `row_change` · `sampled` · `fitted_on_all_rows` · kept (with a frozen lineage copy) · journal state (pending, committed) · Parquet path · rows · columns · content hash of the final file · created (P15 audit)

### 12.4 Model Record

id · analysis id · kind (fitted model, or one fitted from a declarative `spec_id` for nested CV) · task (regression / classification / clustering / forecast) · target · features · split id and kind · CV scores (`source: kernel`) · test score (once) or nested-CV estimate · test-lock status · baseline score · threshold (agent-declared) · `headline_metric` · status (ok, needs retrain) · artifact hash · library versions · model card text (P17 audit)

### 12.5 Method Finding

id · analysis id · check id or critic · `source` (main / kernel / probe / agent / critic) · `category` (trap enum) · severity (block / warn / info; a minimum per category) · subject (column, dataset, test, claim, model) · message · evidence output ids · resolution (fixed, verified by code / disclosed / disputed / dismissed by user) (P19 audit)

### 12.6 Claim

id · analysis id · artifact (answer / report) · text span · value · matched output id ·
status (provenanced / unverified)

### 12.7 Lesson

id · `effect` (fixed enum; `relax_threshold` dropped in v1.0) · type derived from the effect (error_fix / method / preference / parse_hint) · trigger (code-mapped enums: task type, library, error class, dataset hash) · `target` (allowlisted qualname) · `parameters` (signature-checked, grammar-checked literals) · code-rendered title · scope (dataset / global) · suppressive (yes / no) · approval (auto / pending / approved / rejected) (P20 audit) · confidence · sources[] (kind, journal event hash, analysis id, removed) · created ·
last used · use count · disabled

### 12.8 Bench Task, Answer Key, Score

Task: id · split (dev / holdout) · dataset · goal · questions · trap ids · task type.
Answer key (harness-only): question id · expected value or set · tolerance · expected trap
detections · reference metric. Score: run id · task id · provider · per-metric numerator and
denominator · cost · duration · versions.

### 12.9 Context Pack (per role, per call; NFR-16)

analysis id · role · contract version · layers included (each with source ids and token count) ·
items dropped by the budget (with reason) · total tokens · budget

### 12.10 Delegation Brief

goal · dataset ids · relevant facts (with journal or output ids) · constraints · expected output
shape · budget share · size (validated against the role's contract)

### 12.11 Rubric Score (evaluation model, bench only)

(Judge model id is recorded; `same-model` flag when the judge model was used by the run.)

run id · task id · provider and model under test · judge provider and model · rubric version ·
per-criterion score (1–5) and one-line rationale · calibration status at scoring time

### 12.12 Additions agreed in the P10 answers (draft D-030..D-045)

- **Every persisted schema:** `schemaVersion` (NFR-18).
- **Analysis plan:** plan-locked fields the agent declares at its first `save_plan` (`commit_plan` from P19) (outcome column, group column, pairing key, direction, hypotheses per question, the chosen test per hypothesis, horizon and series key for forecasts); code-computed n and outcome type (`describe_design`); external design fields only in the `studyDesign` record from the UI or the bench manifest (`randomised`, weights and kind, planned allocation, screen vs confirmatory, entity column, event timestamp column, subgroups, future-known regressors), locked at the first row-returning read; revisions with reasons (P14, P16–P18 audits).
- **Key results:** also `tests[]` (`hypothesisId`, `family`, `function`, `kwargs`, `inputs`, regression `design`, cited statistic and p-value, `correction`, `pAdjusted`), `test_metrics[]` and `headline_metric`, recomputed or resolved by the scorer (P16, P17 audits).
- **Lesson:** `effect` from a fixed enum; auto-applied lessons are rendered from structured fields only.
- **Key results:** a block always present, each value cited, with `lessons_used`; `kind` is derived by the scorer and `limitations` rendered by code, not agent-written (P19, P21 audits).
- **New schemas:**
  - critic review pack;
  - analysis state card;
  - review-suite verdict (in `scripts/review/`);
  - spend approval (`bench/spend/approved.json`: phase, contributor, amount);
  - judge-block record.

---

## 13. Cross-Cutting Concerns

| Concern          | Control                                                                                   | Introduced      | Verified                   |
| ---------------- | ----------------------------------------------------------------------------------------- | --------------- | -------------------------- |
| Sandbox safety   | Sandboxed compute host, escape suite, limits                                              | P11 design, P13 | Every phase exit (M-11)    |
| Prompt injection | Data-as-data prompts, injection fixtures in DS-Bench, lesson guard                        | P12, P20        | Every phase exit (M-12)    |
| Secrets          | No key in the sandbox or its env; explicit env (rule 5)                                   | P13             | P13 tests                  |
| Privacy          | Output caps, ≤ 20-row samples                                                             | P14             | P14 tests                  |
| Cost             | USD/turn/wall-clock budgets; bench pass cap                                               | P14, P12        | Every bench run (M-09)     |
| Provenance       | Journal, provenance checker                                                               | P14             | Every bench run (M-04)     |
| Parity           | One scope table, parity test                                                              | P14             | Every phase with new tools |
| Reproducibility  | Seeds, pinned packages, notebook export                                                   | P13, P21        | M-05                       |
| Learning safety  | Approval of suppressive lessons, provenance of lessons, holdout check                     | P20             | M-14                       |
| Context          | Context contracts, context builder, brief schema, budgets                                 | P11 design, P14 | M-18, PA-02, P22 ablations |
| Evaluation       | Code scorer first; independent, calibrated evaluation model second                        | P11 design, P12 | M-17 before M-16           |
| Collaboration    | CONTRIBUTING.md, claimed work items, automated review suite with binding blockers (DS-22) | P10-08, P10-09  | DoD-8 every phase          |

---

## 14. Risk Register

| ID   | Risk                                                                                     | L   | I   | Mitigation                                                                                                                                                   | Phase         |
| ---- | ---------------------------------------------------------------------------------------- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| R-01 | Pyodide's `js` FFI reaches host APIs (sandbox escape)                                    | M   | H   | Host is a sandboxed renderer with no Node and no network; escape suite; fallback ADR                                                                         | P11, P13      |
| R-02 | Pyodide too slow or memory-bound on large tables                                         | M   | M   | DuckDB pre-aggregation and sampling; size targets; CPython fallback                                                                                          | P13           |
| R-03 | Required packages missing or lagging in Pyodide (statsmodels, pyarrow)                   | M   | M   | Verify in P13-01; the package list is part of the gate                                                                                                       | P13           |
| R-04 | The LLM states numbers it never computed                                                 | H   | H   | Provenance checker; unverified marks; M-04 = 0                                                                                                               | P14           |
| R-05 | Methodologically wrong but confident results (leakage, p-hacking)                        | H   | H   | Method checks in code, the critic, trap benchmark                                                                                                            | P15–P19       |
| R-06 | Cost blowup from code-retry loops in autonomous mode                                     | H   | M   | USD/turn/wall-clock caps; per-execution caps; retry limit per error class; lessons on repeat errors                                                          | P14, P20      |
| R-07 | Learning reinforces wrong lessons or masks problems                                      | M   | H   | Confidence decay, provenance, suppressive approval, M-14 holdout guard                                                                                       | P20           |
| R-08 | Benchmark overfitting (prompts tuned to dev tasks)                                       | M   | H   | Holdout opened only at P22; trap generator re-seeded for holdout                                                                                             | P12, P22      |
| R-09 | Provider parity doubles the agent-layer work and slows phases                            | H   | M   | One scope table, a shared parity test, OpenAI mapping templates                                                                                              | All           |
| R-10 | Untrusted model files (pickle executes code on load)                                     | M   | H   | Models are created and loaded only inside the sandbox; no import of outside model files in v1.0                                                              | P17           |
| R-11 | Installer size grows past what users accept                                              | M   | M   | Size budget NFR-11; trimmed package set                                                                                                                      | P13, P23      |
| R-12 | SDK churn (Agent SDK, OpenAI Agents SDK, MCP SDK, Pyodide)                               | H   | M   | docs-researcher before use, exact pins, D-NNN with version and URL                                                                                           | All           |
| R-13 | Scope creep (deep learning, causal inference, live DBs)                                  | H   | M   | §3.2 out-of-scope list; stretch items marked                                                                                                                 | All           |
| R-14 | Sensitive rows reach the provider through printed outputs                                | M   | H   | Output caps, sample cap, a print-size guard in the host                                                                                                      | P14           |
| R-15 | Review bandwidth (plans, PRs) becomes the bottleneck                                     | M   | M   | Recommendations on every question; plan-auditor; one-line escalations; any contributor can review                                                            | All           |
| R-16 | The evaluation model is biased (verbosity, self-preference, position) or drifts          | M   | M   | Opus judge; `same-model` scores never block; anchored rubric; κ-based calibration re-checked on change; blocks only on clear failures with peer confirmation | P12, P16, P22 |
| R-17 | Context bloat or starvation: too much context dilutes focus, too little causes guessing  | H   | H   | Context contracts and budgets, shaping, briefs, just-in-time retrieval, P22 ablations                                                                        | P11, P14      |
| R-18 | Contributors collide: the same work item, conflicting decisions, D-NNN numbering clashes | M   | M   | Claim items via issues; one phase at a time; D-NNN numbers assigned at merge; maintainer signs off decisions                                                 | All           |
| R-19 | Benchmark results from different contributors aren't comparable (keys, models, versions) | M   | M   | Scores record provider, model id and prompt/skill versions (AC-09); the comparison report refuses mismatched runs                                            | P12           |
| R-20 | Exported notebooks carry agent code that reads or writes outside the data folder         | M   | H   | Enumerated name, dispatch-string and builtin allowlists; generated I/O; commented-out risky cells (P21)                                                      | P21           |
| R-21 | Exported notebooks expose data or fetch remote content when opened                       | M   | H   | Entity-escaped generated Markdown; outputs only on opt-in; relative paths (P21)                                                                              | P21           |
| R-22 | A tampered installer is published                                                        | L   | H   | Maintainer-only tags, protected release environment, maintainer-owned packaging paths, attestations (P23)                                                    | P23           |
| R-23 | Deletion removes user files or leaves user data behind                                   | M   | H   | One roots table, id-derived paths, containment, pending-delete locks, knowledge cascade (P23)                                                                | P23           |

---

## 15. Traceability Matrix

| Requirement | Designed | Implemented   | Verified                        |
| ----------- | -------- | ------------- | ------------------------------- |
| FR-01       | P11      | P14, P19      | EC14-1, EC19-3                  |
| FR-02       | P11      | P15           | EC15-3                          |
| FR-03       | P11      | P15           | EC15-1, EC15-2                  |
| FR-04       | P11      | P13, P14      | EC13-3, EC14-2                  |
| FR-05       | P11      | P16           | EC16-1                          |
| FR-06       | P11      | P17           | EC17-1, EC17-2                  |
| FR-07       | P11      | P17           | P17-06 tests                    |
| FR-08       | P11      | P17           | EC17-4                          |
| FR-09       | P11      | P18           | EC18-1                          |
| FR-10       | P11      | P14           | EC14-1 (M-04)                   |
| FR-11       | P11      | P15–P19       | EC19-1                          |
| FR-12       | P11      | P19           | EC19-2                          |
| FR-13       | P11      | P20           | EC20-1, EC20-2                  |
| FR-14       | P11      | P20           | EC20-3                          |
| FR-15       | P11      | P21           | EC21-1 (M-05)                   |
| FR-16       | P11      | P21           | EC21-2                          |
| FR-17       | P11      | P14, P15, P21 | EC21-3                          |
| FR-18       | P11      | P14 onward    | EC14-3, P22                     |
| FR-19       | P11      | P14           | EC14-4                          |
| NFR-01      | P11      | P13           | EC13-1 (M-11)                   |
| NFR-02      | P10      | Every phase   | review suite (blocker 01), DoD  |
| NFR-03      | P11      | P13           | P13-04 tests                    |
| NFR-04      | P11      | P14           | P14-07 tests                    |
| NFR-05      | P11      | P14           | EC21-1                          |
| NFR-06      | P11      | P14           | EC12-4, P14 tests               |
| NFR-07      | P10      | P14           | P14 tests                       |
| NFR-08      | P10      | P12, P14      | M-12                            |
| NFR-09      | P11      | P13, P23      | EC13-3, EC23-1                  |
| NFR-10      | P10      | P13           | EC13-2                          |
| NFR-11      | P10      | P13, P23      | EC23-1                          |
| NFR-12      | P10      | P13           | P13 tests                       |
| NFR-13      | P11      | P20           | EC20-3, EC20-4                  |
| NFR-14      | P11      | P14           | EC14-3                          |
| NFR-15      | P10      | P21           | P21 review                      |
| NFR-16      | P11      | P14, P20      | EC11-4, EC14-5, EC22-3          |
| NFR-17      | P11      | P12           | EC12-5, P22-05                  |
| NFR-18      | P11      | P11, P14, P23 | migration fixture tests, EC23-4 |
| NFR-19      | P11      | P13, P23      | P13-09 tests, EC23-1            |

---

## 16. Open Decisions

| ID     | Decision                                              | Due                  |
| ------ | ----------------------------------------------------- | -------------------- |
| OD-01  | Metric targets (§7) confirmed or changed              | P10 exit             |
| OD-02  | Dataset size, performance and installer size targets  | P10 exit             |
| OD-03  | Method policy defaults (alpha, splits, tuning bounds) | P10 exit             |
| OD-04  | Lesson approval rules                                 | P10 exit             |
| OD-05  | Evaluation model choice, calibration size, gating     | P10 exit             |
| OD-06  | Collaboration rules (authority, review, branches)     | P10 exit             |
| OD-07  | Context budgets per role (first values)               | P10 exit, tuned P14  |
| ADR-01 | Compute host and data hand-off                        | P11 exit, proven P13 |
| ADR-02 | Process model and the analysis controller             | P11 exit             |
| ADR-03 | Journal storage                                       | P11 exit             |
| ADR-04 | Provenance algorithm                                  | P11 exit             |
| ADR-05 | Derived datasets and lineage                          | P11 exit             |
| ADR-06 | Model store and predict                               | P11 exit             |
| ADR-07 | Lesson store and retrieval                            | P11 exit             |
| ADR-08 | Provider parity mechanics                             | P11 exit             |
| ADR-09 | Context architecture (contracts, builder, briefs)     | P11 exit             |
| ADR-10 | Evaluation design (layers, judge, calibration)        | P11 exit             |
| ADR-11 | Split, test lock and evaluation isolation             | P11 exit             |
| ADR-12 | Budgets and limits                                    | P11 exit             |
| ADR-13 | Schema versioning and migrations                      | P11 exit             |

---

## 17. Definition of Done (every phase)

The CLAUDE.md per-task rules still apply (tests, `npm run check`, one conventional commit per task,
tick `ROADMAP.md`). A phase in this track is done only when, in addition:

1. Every exit criterion is met, measured with DS-Bench where applicable, with the score file
   path recorded in the phase summary.
2. `npm run check` and `npm run test:e2e` pass; the packaged smoke passes for phases that touch
   packaging or the sandbox.
3. New or changed decisions are appended to `DECISIONS.md` (D-NNN, with SDK versions and source
   URLs); the affected schemas and `docs/ARCHITECTURE.md` are updated.
4. M-11 = 0 for the build every run in the phase used (the per-build escape result, P13-03) and M-12 = 0 for every run; M-04 = 0 from P14 on.
5. The review suite (`/review-suite`, from P10-09; `code-reviewer` before then) has no open blockers, and `plan-auditor` reviewed the plan before
   the phase started.
6. The risk register is reviewed and the remaining phase sizes are re-baselined.
7. The learning-log entry and phase summary are written (`/finish-phase`).
8. Every PR into a phase branch or `main` has a committed review-suite verdict with no blocker
   fired, CI green and a peer approval from a non-author (DS-22), and was merged by a human (DS-23). Phase PRs into `main` are merged
   by a maintainer.

---

## 18. How We Plan and Work

DataDesk is a collaborative project (DS-18). These rules are written so any contributor can pick
up any phase; `CONTRIBUTING.md` (P10-08) is the short version for newcomers.

### 18.1 Roles

| Role            | Can                                                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maintainer**  | One or more people. Everything a contributor can, plus signing off phase plans and decisions (D-NNN), approving spend (`bench/spend/**`), holding holdout seeds and task definitions, and merging phase PRs into `main` |
| **Contributor** | Answer questionnaire items, claim and build work items, review others' PRs, run the benchmark with their own keys                                                                                                       |

Who holds each role is listed in `CONTRIBUTING.md`, not in the plans.

### 18.1a Agent-driven development: how the coding agents use skills

Most implementation is done by coding agents, so the workflow is encoded as **development
skills** in `.claude/skills/` that every contributor's agent loads from the repo. CLAUDE.md's
session-start routine tells each session to load the router first.

| Skill or agent                                                                         | Role in the workflow                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `using-agent-skills`                                                                   | **The router.** It maps any request to the right skill or agent and sets the operating rules (surface assumptions, stop on conflicts, code-not-agent, both providers, verify before done, scope discipline) |
| `spec-driven-development`                                                              | Writes the spec: scope check against the roadmap, then the phase plan + questionnaire, through the answer → audit → sign-off gates                                                                          |
| `/spec-designer`                                                                       | Answers a questionnaire critically, with signed answers                                                                                                                                                     |
| `plan-auditor` (agent)                                                                 | Blind review of plans, answers and deliverables                                                                                                                                                             |
| `planning-and-task-breakdown`                                                          | Turns a signed-off phase into vertical-slice tasks of size ≤ M, in `ROADMAP.md` and GitHub issues, with checkpoints                                                                                         |
| `docs-researcher`, `/add-ipc-channel`, `/add-mcp-tool`, `context-engineering` (P11-13) | Build-time skills for each kind of change                                                                                                                                                                   |
| `test-writer` (agent), `/review-suite` (reviewer agents, P10-09), `/finish-phase`      | Verify, review, close the phase                                                                                                                                                                             |

The lifecycle of a phase:
`spec-driven-development → /spec-designer → contributors → plan-auditor → sign-off →
planning-and-task-breakdown → (per task) build skills + tests → /review-suite → plan-auditor on
deliverables → /finish-phase`.

The development skills are distinct from the **runtime skills** in
`resources/agent-plugin/skills/`, which the in-app analyst uses inside the product.

### 18.2 Planning

1. **One plan and one questionnaire per phase** in `planning/plans/` (`Pn-<slug>.md`,
   `Pn-questionnaire.md`), in the format of `planning/plans/_TEMPLATE.md`.
2. **Every question has a Claude recommendation.** "Agree" is a complete answer. Any contributor
   may answer inside the `> **Answer Qn:**` blocks and signs the answer (`— @handle`). Where
   answers differ, the maintainer decides and the decision records both views.
   **Spec designer:** the project skill `/spec-designer` (`.claude/skills/spec-designer/`)
   answers every open question as a senior system architect. It checks each question against the
   decisions, the code and the other answers, challenges the recommendation, signs as
   `@spec-designer`, never overwrites a contributor's answer, and flags maintainer-only questions
   in a summary.
3. **Blind audit.** `.claude/agents/plan-auditor.md` (context-blind, read-only, senior
   architecture designer) audits each phase's plan and questionnaire before the phase starts,
   and its deliverables before sign-off. Critical and Major findings are fixed before sign-off.
   Audits are saved as `Pn-audit.md`.
4. **Decisions** from answers become D-NNN entries appended to `DECISIONS.md` at sign-off (the
   repo's append-only log). D-NNN numbers are assigned when the PR merges, to avoid clashes.
5. **Rendering:** after any edit under `planning/`, run `npm run plan:html`. The HTML lands in `planning/html/` (git-ignored, so everyone renders
   their own).

### 18.3 Building

1. **One phase at a time.** No phase starts without the maintainer's sign-off on its plan.
2. When a phase starts, its work items are copied into `ROADMAP.md` and opened as GitHub issues
   (Q43). A contributor **claims** an item by assigning the issue before starting.
3. **Branches:** `phase-N-<slug>` is the phase's integration branch. Each work item gets its own
   branch, `phase-N/<item-id>-<slug>`, and a PR into the phase branch (Q42). CLAUDE.md's per-task
   loop (tests, `npm run check`, one conventional commit, tick the box) applies inside it.
4. **Review (DS-22, DS-23):** every PR gets **two reviews**. The automated review suite (blockers
   binding, score advisory, verdict computed by code and re-checked by CI) and a **human peer who is
   not the author**. **Humans merge; agents never merge.** A human merges once the verdict, CI and the
   peer approval are in; a maintainer merges phase PRs into `main` as sign-off. Agents are held by
   **hard permission rules** (deny merging and paid runs; ask before pushes and before edits to
   protected paths) and by branch protection.
5. **Pushing (D-042):** every `git push` asks the person at the keyboard first (a settings rule,
   best-effort); `/finish-phase` prepares the push and the human approves it.
6. **Shared state:** dev answer keys are generated locally by each contributor from the committed
   generator and dev seeds; **holdout seeds and task definitions are held by maintainers** (D-036); score files are shared as PR attachments or committed
   summaries, never raw keys (P12-09, R-19).
7. **Money needs explicit approval (DS-21).** Every API cost in this roadmap and the phase plans
   is a **planned** estimate. A phase that spends API money doesn't start coding or running until
   a maintainer explicitly approves that phase's planned spend. **Paid runs are hard-blocked:** the
   runner refuses without an approval record in the protected `bench/spend/approved.json` and
   hard-stops at the approved amount, with no override flag, and coding agents are denied the paid
   commands outright.
   Agreeing to a plan or a questionnaire answer is **not** spend approval.

---

## Appendix A: Sources

- Repo audit: `planning/audit/repo-audit-2026-10-02.md`
- Q&A of 2026-10-02 and 2026-10-03: `planning/plans/P10-requirements-and-scope.md` §1
- Phase format and authoring rules: `planning/plans/_TEMPLATE.md`
