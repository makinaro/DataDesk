# P10 Questionnaire: Decisions Needed Before Analyst Requirements Are Written

| Field              | Value                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose            | Close every open choice in the advanced-analysis roadmap. Each answer becomes a D-NNN entry in `DECISIONS.md` at P10 sign-off                                                                                                                                                                          |
| Already decided    | DS-01..DS-23 in `P10-requirements-and-scope.md` §1: scope, sandboxed Python, portfolio product, collaboration, context engineering, evaluation layers, both providers, fully autonomous, budget, privacy, outputs, self-learning                                                                       |
| How to answer      | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation. "Defer to P11" is valid where noted. Then re-render with `npm run plan:html`                                                                                             |
| Sign-off copy rule | When answers become D-NNN entries, the lines under an answer supersede its decision body, and **the latest Maintainer decision line wins**. Maintainer answers to audit questions (Q-A, Q-B, Q-C) are recorded under the questions they change, so the questionnaire is the single source for sign-off |

**Blocks** marks the work item or exit criterion that cannot be finished without the answer.

---

## A. Users and Product

**Q1. Who is the user other than you?** It sets how much the agent explains and how much
statistics the UI assumes. Options: (a) a data-literate analyst who knows what a p-value is;
(b) a non-technical user who needs plain-language conclusions; (c) both, with an
"explain more" toggle.
_Blocks: P10-02 (FR-16, NFR-15), P21-04._

> **Recommendation (Claude):** (a) for v1.0. Write the answer in plain language and put the
> technical detail (test, assumptions, CI) one click away. A real non-technical mode needs its
> own UX work, which is a v1.x item.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The primary reader is a data-literate analyst (a). Every answer and report still opens with a 1–3 sentence plain-language headline, and the technical detail (test, assumptions, CI, code) sits one click below it.
>
> **Why:** DS-03 makes this a portfolio product that strangers try, so the first screen must make sense to a non-statistician. The rubric (§7.3, "clarity for the intended reader") needs one target reader, or M-16 can't be calibrated. The headline-then-detail shape serves both at almost no cost.
>
> **Rejected:** (b) a separate non-technical mode doubles the prompts and the evaluation; (c) a toggle gives two outputs to score and calibrate.
>
> **Recommendation was:** refined (added the mandatory headline, which makes (a) safe for casual users).
>
> **Consequences:** FR-16 and the report format skill get a "headline" section; the P21-04 UI shows the headline first; the Q35 rubric anchors "clarity" to an analyst reader.
>
> **Revisit if:** user feedback or M-16 clarity scores show non-technical users can't act on the headline.
>
> **Confidence:** Medium · **Needs maintainer:** no

**Q2. Should the UI show the Python code the agent runs?**
_Blocks: P14-05, P21-04._

> **Recommendation (Claude):** Yes, read-only and collapsed by default, with Copy. Each step
> shows its code and capped output. It is the main trust signal for an analyst and the main
> learning value for you. It is never editable in v1.0, because edited code would break
> provenance.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Yes. Each execution shows its code, input dataset ids, seed, status and duration, read-only and collapsed by default, with Copy. The UI shows the **full local output** (up to 1 MB per execution); only the model sees the shaped, capped output (Q10).
>
> **Why:** Code is the primary trust signal and the main learning value (CLAUDE.md). The UI is local, so showing full outputs there doesn't breach DS-09, which limits what reaches the provider, not the user. Read-only keeps provenance (NFR-06) intact: edited code would produce numbers the journal never ran.
>
> **Rejected:** hiding the code (no way to audit, no learning value); editable cells (break provenance and reproducibility, and pull a notebook editor into scope).
>
> **Recommendation was:** refined (full output in the UI vs capped output for the model; metadata shown with the code).
>
> **Consequences:** P14-05 renders execution cells from the journal; "re-run with edits" happens only through the notebook export (P21-01).
>
> **Revisit if:** users ask to tweak and re-run inside the app often enough to justify a provenance-safe "fork execution" design.
>
> **Confidence:** High · **Needs maintainer:** no

**Q3. Should notebooks be written to teach?** The exported `.ipynb` could be (a) minimal code
only, or (b) code plus Markdown cells explaining why each step exists and what to look for.
_Blocks: P21-01, NFR-15._

> **Recommendation (Claude):** (b), generated from the journal plus the plan, with explanations
> drawn from the skills. Code-generated where possible, so it cannot claim things the journal
> doesn't show.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Teaching notebooks (b), built in three layers: (1) code cells copied verbatim from the journal; (2) "why this step" Markdown from **fixed templates** keyed by step type (profile, split, CV, test, forecast…), owned by the skills; (3) one "Analyst notes" cell holding the final answer text, with its provenance marks. No other free LLM prose.
>
> **Why:** Code must generate anything that claims what was done ("code, not the agent", §8.3). Templates teach consistently and can't hallucinate a step; the analyst's own words appear once, clearly labelled. The notebook must also run top to bottom (M-05), so explanations live only in Markdown cells.
>
> **Rejected:** (a) code only (loses the learning value); LLM-written explanations per cell (unverifiable, and they drift from the code).
>
> **Recommendation was:** refined (templates plus a single labelled prose cell, instead of "explanations drawn from the skills").
>
> **Consequences:** P21-01 needs a template library per step type; NFR-15 gets an acceptance test that every code cell has a preceding template cell.
>
> **Revisit if:** the templates read too generic in the M-16 clarity scores.
>
> **Confidence:** High · **Needs maintainer:** no

**Q4. Positioning.** _Decided (DS-17):_ DataDesk stays **a local AI data analyst**. The new
statistics, ML, forecasting and self-learning capabilities are part of the analyst; nothing is
renamed. No answer needed.

---

## B. Autonomy and Budget

**Q5. Fully autonomous (DS-06): should the agent still publish its analysis plan as the first
artifact, without waiting?** You would see it appear and could press Stop if it's wrong.
_Blocks: FR-01, P14._

> **Recommendation (Claude):** Yes, non-blocking. It costs one short message, gives the critic
> something to check against, and makes a wrong framing visible early instead of after $1 is spent.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Yes, non-blocking. The plan is a **structured artifact**, zod-validated against §12.1's plan fields (question type, target, unit, metric, split, methods) plus an estimated cost. It is published before any `run_python` call. Later changes are recorded as plan revisions in the journal.
>
> **Why:** DS-06 forbids waiting, but a visible framing lets the user press Stop before money is spent. A structured plan is what lets code score PA-01 (plan task type vs answer key) and gives the critic a fixed thing to check (P19). Free-text plans can be neither measured nor checked.
>
> **Rejected:** no plan (wrong framings are found only at the end); a blocking approval (contradicts DS-06).
>
> **Recommendation was:** refined (plan is schema-validated and versioned, with an estimated cost).
>
> **Consequences:** §12.1 gains a plan-revision list (propose at sign-off); P14 adds a "plan before execution" guard in `datadesk-ds`, so `run_python` is refused until a plan exists.
>
> **Revisit if:** the plan step costs more than 5% of the median analysis spend.
>
> **Confidence:** High · **Needs maintainer:** no

**Q6. What else stops a run besides $1?** Today there are `maxBudgetUsd` and `maxTurns`.
Proposed additions: a wall-clock cap per analysis, and a retry cap per error class (the same
error 3 times stops that approach).
_Blocks: NFR-04, P14-07, R-06._

> **Recommendation (Claude):** Add both: 15 minutes of wall clock (matches M-10 MVP) and 3
> retries per error class. Any stop writes a partial report from the journal, so the money spent
> still produces something.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Add a **20-minute wall-clock cap per analysis** (setting, 5–60) and a **retry cap of 3 per error class**. Error class = tool + exception type + a hash of the normalised message, computed by code. The analysis budget is **$1 (DS-08) enforced by the analysis runtime**; the existing per-conversation `maxBudgetUsd` (default $2) and per-message `maxTurns` (default 30) stay, and the lowest limit wins. Any stop writes a partial report from the journal.
>
> **Why:** A cap equal to the MVP median target (15 min, M-10) would kill about half of all runs by design; caps must sit above targets. The code defaults (`src/shared/agent.ts`) are per conversation, not per analysis, so both levels are needed. Classifying errors in code keeps the retry rule deterministic.
>
> **Rejected:** 15-minute cap (equals the median target); retry counting by the model (unreliable); replacing the conversation budget (breaks existing settings).
>
> **Recommendation was:** refined (20 min, not 15; error class defined; the two budget levels reconciled).
>
> **Consequences:** NFR-04 and P14-07 use these numbers; M-09 needs a cap-hit rate (see Q21).
>
> **Revisit if:** more than 10% of dev runs hit the wall-clock cap after P14.
>
> **Confidence:** High · **Needs maintainer:** no

**Q7. Which models by default?** $1 per analysis does not fit Opus-class models for every
step. Options: (a) one model for everything, as today (Sonnet default); (b) per-role models (a
stronger one for the lead and critic, a cheaper one for the wrangler and profiler).
_Blocks: P11-11, M-09._

> **Recommendation (Claude):** (a) for MVP, keeping the existing setting. Add per-role models in
> P19 only if the benchmark shows the critic or lead underperforming. Measure first, then spend.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** One model for every role in MVP (Claude: `sonnet`, OpenAI: `gpt-5.4-mini`, today's defaults). But the scope table gains a **per-role model field now**, set to `inherit`, so per-role models later are a data change, not a refactor. Per-role models are trialled in P19 only against benchmark evidence.
>
> **Why:** We can't know which role underperforms until PA-01..PA-11 exist (P12). The SDK `AgentDefinition` already takes `model` (`subagents.ts` sets `model: 'inherit'`), so the hook is cheap and keeps the two providers symmetric (NFR-14).
>
> **Rejected:** per-role models now (spend before measurement); a stronger model everywhere (breaks the $1 budget, Q37 arithmetic).
>
> **Recommendation was:** refined (adds the per-role field from the start).
>
> **Consequences:** P11-09 scope-table schema; P19 adds an experiment comparing critic and lead models on PA-08 and PA-01.
>
> **Revisit if:** PA-08 or PA-01 miss target while M-09 has headroom.
>
> **Confidence:** High · **Needs maintainer:** no

---

## C. Compute and Data

**Q8. How big must data get in v1.0?** Pyodide runs in 32-bit WebAssembly (a few GB of memory
at most, single-threaded). DuckDB has no such limit.
_Blocks: NFR-10, P13 gate._

> **Recommendation (Claude):** Target files up to 1M rows × 50 columns (or 500 MB) end to end.
> Bigger files still work through DuckDB, which aggregates or samples before Python sees them,
> and the agent says when it sampled.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Python works on full tables up to **1M rows × 50 columns (about 400 MB in pandas memory)**. Above that, the compute host refuses a full load and the agent must aggregate or take a **stratified sample of ≤ 1M rows through DuckDB**. The journal records the sample fraction, and a method check fails any report that doesn't disclose it. DuckDB itself keeps the existing 2 GB file limit (`DATADESK_MAX_FILE_BYTES`).
>
> **Why:** Pyodide is wasm32 (≤ 4 GB address space, single-threaded); pandas operations make 2–3× copies, so ~400 MB of frame is a realistic ceiling. File size in MB is a poor proxy (CSV vs Parquet differ ~5×), so the limit counts rows × columns. Silent sampling would change answers without notice, so disclosure is enforced by code, not by the prompt.
>
> **Rejected:** "500 MB file" as the limit (format-dependent); no limit (out-of-memory crashes mid-analysis); sampling without a disclosure check (hidden accuracy loss).
>
> **Recommendation was:** refined (row × column limit, enforced refusal, code-checked disclosure).
>
> **Consequences:** the P13-05 benchmark uses exactly this size; P15 adds the "sampled" method check; NFR-10 is measured on this table.
>
> **Revisit if:** P13 shows load + HistGradientBoosting on 1M × 50 exceeds the 120 s execution limit (then lower to 500k rows).
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Limit = **≤ 50M cells and ≤ 200 columns** (both bounds); above either, the host refuses a full load and the sampling rule applies.

**Q9. Which Python packages ship?** Every package adds installer size.
_Blocks: P13-01, NFR-09, NFR-11._

> **Recommendation (Claude):** NumPy, pandas, SciPy, statsmodels, scikit-learn, and pyarrow (for
> Parquet) if Pyodide has it. No matplotlib in the app (charts stay Vega-Lite). Nothing
> installable at runtime.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Ship NumPy, pandas, SciPy, statsmodels (with patsy), scikit-learn (with joblib and threadpoolctl), and pyarrow if Pyodide provides it, with fastparquet or Arrow IPC from DuckDB as the fallback. Nothing else, and no runtime installs. Installer growth budget (NFR-11): **≤ 200 MB on disk**, measured in P13-06.
>
> **Why:** Each package is size, an attack surface and a parity burden, so ship only what FR-04..FR-09 need. NFR-11 needed a number. Whether pyarrow and the exact versions exist in the current Pyodide release is **not verified here** and is routed to P13-01 (docs-researcher).
>
> **Rejected:** matplotlib or seaborn in the app (charts stay Vega-Lite, Q11); pmdarima, Prophet, XGBoost, LightGBM (Q16, Q18); a "full Pyodide" bundle (hundreds of MB of unused packages).
>
> **Recommendation was:** refined (named transitive dependencies, fallback for Parquet, numeric size budget).
>
> **Consequences:** P13-01 verifies the list; P13-06 measures against 200 MB; the reference CPython env for notebooks (P21-02) pins the same versions.
>
> **Revisit if:** the measured size exceeds 200 MB or a required package is missing from Pyodide (then the CPython fallback ADR is triggered).
>
> **Confidence:** Medium · **Needs maintainer:** no

**Q10. Per-execution limits?**
_Blocks: NFR-03, P13-04._

> **Recommendation (Claude):** 120 s wall clock, a 2 GB memory ceiling (or Pyodide's maximum),
> and 20 KB of text output returned to the model (the full output stays in the journal). Numbers
> are re-checked in the P13 spike.

> **Answer Q10:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Per execution: **120 s wall clock** (the host kills the compute window); memory **soft cap 2 GB, hard kill at 3 GB**, measured by the host from the renderer's process metrics; **8 KB of shaped text to the model** (≈ 2k tokens), with tables limited to ≤ 20 rows (DS-09). Everything else is stored in the journal and referenced by output id.
>
> **Why:** 20 KB (≈ 5k tokens) per execution would use a third of a specialist's whole context budget in one call (Q37). Pyodide can't enforce a memory cap itself, so the host must measure and kill, and the wasm32 4 GB ceiling is the last line. The time limit matches the per-analysis cap (Q6): about ten long executions fit in 20 minutes.
>
> **Rejected:** 20 KB output (breaks the context budgets); unlimited memory (the whole app becomes unresponsive); a limit set inside Python (bypassable by agent-written code).
>
> **Recommendation was:** overturned (output cap cut to 8 KB for context reasons; enforcement placed in the host).
>
> **Consequences:** NFR-03 numbers; P13-04 implements kill-and-record; P14-09's context builder shapes outputs to 8 KB.
>
> **Revisit if:** P14 shows agents re-requesting outputs often (cap too small), measured as fetch-by-id calls per task.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Only **structured `result` objects** carry rows to the model, and code counts them: **≤ 20 rows per call and ≤ 200 rows per analysis**. stdout gets its own **2 KB** cap (so `print(df.to_csv())` can't carry rows). The soft cap at 2 GB = a warning in the next output plus a forced `gc.collect()`. `docs/ds/03` lists an **egress allowlist**: the chosen provider; Hugging Face Hub search and details only when the HF token is set (query text only, never data values); `second_opinion` only when the user turns it on. This is the NFR-07 exception list.
>
> **Audit resolution, round 2 (2026-10-03):** A **per-analysis output budget of 48 KB across every channel** (stdout, stderr, tracebacks and results together), counted by code. Tracebacks are capped at 1 KB each. **Cell values are truncated at 200 characters** before they leave the sandbox. The soft memory cap is defined on **growth**: a warning when memory grows by > 500 MB in one execution, and a suggestion to restart the kernel above 2 GB, shown once. Hugging Face tools after user data is in context: **Q-B6**.
>
> **Maintainer decision, audit Q-B (2026-10-03):** **Q-B6:** after the **first data-reading tool call** in a session (`sample_rows`, `run_sql`, `run_python`, `profile_column`, `get_output`), **every remote Hugging Face call** (`hub_repo_search`, `hub_repo_details`, `hf_fs`) needs per-call user approval showing the exact strings sent, on both providers. This is a recorded exception to DS-06's no-check-ins rule.
>
> **Audit resolution, round 3 (2026-10-03):** **Row limits count lines, not just bytes (R3-8):** stdout reaching the model is capped at **20 lines per execution**, and those lines count toward the **200-row per-analysis budget** alongside structured results. When the budget is used up, outputs become **id-only** (the model sees shapes and output ids; values stay local).

**Q11. Charts: Vega-Lite only in the app, and matplotlib only inside exported notebooks?**
_Blocks: P16-06, P17-03, P21-01._

> **Recommendation (Claude):** Yes. Vega-Lite is already secured (D-016, D-028) and
> theme-aware. Notebooks are for running elsewhere, where matplotlib is the norm.

> **Answer Q11:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Vega-Lite only in the app. **Exported notebooks use Altair**, which produces Vega-Lite, to rebuild each chart from the same spec and data, so the notebook chart is the app chart. No matplotlib anywhere.
>
> **Why:** Altair is Python's Vega-Lite API, so one chart definition serves both places. This removes a second charting system and a whole class of "the notebook chart differs from the app" bugs, which also helps M-05 reproducibility. The app keeps D-016 and D-028's sanitised, CSP-safe pipeline unchanged.
>
> **Rejected:** matplotlib in notebooks (a second chart implementation per chart type that can drift); embedding images (not reproducible).
>
> **Recommendation was:** overturned (Altair instead of matplotlib).
>
> **Consequences:** the P21-02 reference env adds `altair`; P21-01 exports `alt.Chart.from_dict(spec)` cells, with the data written next to the notebook.
>
> **Revisit if:** some chart types can't round-trip through Altair (verify in P21).
>
> **Confidence:** Medium · **Needs maintainer:** no

**Q12. Derived datasets: where do they live and when do they go away?**
_Blocks: P15-01, P15-02, P23-03._

> **Recommendation (Claude):** Parquet under `userData/datasets/derived/<id>/`. They appear in
> the sidebar with a "derived" badge and their lineage, persist across restarts, and are removed
> like any dataset (D-029 rules: DataDesk-owned files are deleted). Removing a dataset that has
> descendants warns first.

> **Answer Q12:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Parquet under `userData/datasets/derived/<id>/`, registered without an approval prompt (the data is already approved, and the folder is DataDesk-owned). Derived datasets show a "derived" badge and lineage, persist across restarts, and count in the storage view (Q32). Removing a dataset with descendants offers "remove only this" (descendants keep their lineage marked "parent removed") or "remove with descendants". D-029's delete rule is extended: files are deleted only when their real path is inside the derived folder.
>
> **Why:** The approval in D-010 protects reading a _new_ file from the user's disk; derived data comes only from already-approved sources, so a prompt would be noise. Lineage must never point at nothing silently (NFR-06).
>
> **Rejected:** temporary in-memory tables (lost on restart, break FR-19 reopen); storing derived data next to the user's files (writes outside DataDesk's folders).
>
> **Recommendation was:** refined (no-approval rationale, orphan-lineage rule, D-029 extension).
>
> **Consequences:** P15-01 and P15-02; the threat model (P11-10) adds "agent fills the disk with derived data", covered by Q32's storage view and a per-analysis derived-size cap set in P11.
>
> **Revisit if:** derived storage grows past a few GB in normal use.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The two changes to D-010 (no approval prompt for derived data) and D-029 (an extended delete rule) get their own D-NNN at sign-off, referencing both. The disk cap is numeric: 2 GB per analysis (P15 Q7), with atomic `.part` → rename writes so a full disk fails cleanly without a half-written dataset.

---

## D. Method Policy

**Q13. Inference defaults?**
_Blocks: P10-05, P16._

> **Recommendation (Claude):** α = 0.05 two-sided unless the goal states a direction. Always
> report an effect size and a 95% CI, not just p. Holm correction when more than one test
> answers the same question. Check assumptions and fall back to a non-parametric test when
> they fail.

> **Answer Q13:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** α = 0.05, two-sided unless the plan records a directional hypothesis **before** any test runs. Always report an effect size with a 95% CI. For two means use **Welch's t by default**, not Student's. Choose rank-based or bootstrap methods **up front** from the data's shape (skew, outliers, n), **not** by running a normality test first. Holm correction within a family (tests answering one plan question); Benjamini–Hochberg for exploratory screens of ≥ 10 comparisons. When the data declares weights, use weighted estimators with robust standard errors and say so.
>
> **Why:** "Test the assumptions, then switch tests" is a two-stage procedure that distorts error rates, and normality tests reject everything at large n. Welch costs nothing when variances are equal. Defining a "family" by plan question makes the correction deterministic and checkable in code (P16-05).
>
> **Rejected:** assumption-test-then-switch (statistically unsound); Bonferroni (needlessly conservative); no correction (p-hacking trap in DS-Bench).
>
> **Recommendation was:** refined (Welch default, choice before testing, family definition, BH for screens).
>
> **Consequences:** `docs/ds/04` method policy; P16-01 skill content; P16-05 checks the "family" count against the journal.
>
> **Revisit if:** DS-Bench inference tasks show systematic disagreement with the answer keys' acceptable method sets.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** In the benchmark, multiple-comparison **families come from the task's answer key**, not the agent's plan, so they can't be gamed. "Declared weights" = weights declared by the user, an accepted dataset note, or the task (P16 Q5).

**Q14. Causal language: should the agent be blocked from saying "X causes Y" on observational
data?**
_Blocks: P16-05, P19._

> **Recommendation (Claude):** Yes, as a method check. Causal verbs are allowed only when the
> plan records a randomised design (an A/B test). Otherwise the check flags them and the report
> says "associated with".

> **Answer Q14:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Yes. A deterministic check flags causal wording (a maintained list: "causes", "leads to", "drives", "effect of", "impact of", "because of", and so on) in answers and reports unless the plan records a randomised design. A flagged sentence must be rewritten ("is associated with") or carry an explicit caveat. The critic decides ambiguous hits, and a false-positive dismissal is recorded.
>
> **Why:** Keyword matching alone over-flags ("the effect size"), so the code does the detection (recall) and the critic does the adjudication (precision), which is measured by M-03. Natural experiments and quasi-experimental designs are out of scope (§3.2), so "randomised" is the only exemption.
>
> **Rejected:** prompt-only instructions (unmeasurable); hard-blocking any causal verb (too many false positives, e.g. "effect size").
>
> **Recommendation was:** refined (code detects, critic adjudicates, dismissals journalled).
>
> **Consequences:** P16-05 check with a word list and exemptions; M-03 counts dismissed flags; a DS-Bench trap with a confounder tests it.
>
> **Revisit if:** the causal check's precision (M-03 slice) falls below 70%.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Every critic dismissal of a causal flag **stays visible in the report**, with its reason. M-03 validity comes **only from answer-key-labelled flags**, never from the critic's adjudication.
>
> **Audit resolution, round 2 (2026-10-03):** M-03's denominator counts flags whose subject the key doesn't label as **invalid**, and the key is versioned so a reviewer can add a real issue the generator didn't plant (a new key version, recorded).
>
> **Audit resolution, round 3 (2026-10-03):** **Key revisions (R3-12):** a key can only be revised from **dev** runs, never in the PR that decides a gate. A revision is applied to **every** compared run (old scores are recomputed), and **holdout keys are frozen** when generated.

**Q15. ML protocol?**
_Blocks: P17-01, P17-02, M-06._

> **Recommendation (Claude):** A 80/20 train/test split (stratified for classification, grouped
> or temporal when the data says so). 5-fold CV on train for every choice. The test set is
> scored **once** per model family (the code-enforced lock). A dummy baseline is always reported
> alongside.

> **Answer Q15:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Split 80/20 train/test (stratified for classification; grouped when ids repeat; temporal when a time column is the index of the task), and record the split as tool state. Do all model **selection** with 5-fold CV on the training set, using pipelines so nothing is fitted on validation folds. The test set is scored **exactly once per analysis**, on the single final model; `evaluate_on_test` refuses a second call for that split. Always report a dummy baseline. If n < 1,000, use repeated CV (5×5) as the headline estimate with its spread, and score the test set only if it holds ≥ 200 rows.
>
> **Why:** "Once per model family" lets the agent look at the test set three times and keep the best, which is test-set selection, the leakage M-06 exists to stop. Small data makes a single 20% test set too noisy to report alone.
>
> **Rejected:** once per model family (selection on test); a three-way 60/20/20 split (wastes data when CV exists); no test set (no unbiased final estimate).
>
> **Recommendation was:** overturned (once per analysis on the final model, not once per family; small-n rule added).
>
> **Consequences:** the roadmap glossary "test-set lock" and PA-06 wording ("per model family") must change at sign-off; P17-01 implements the lock per split id.
>
> **Revisit if:** users need to compare finalists on the test set; then use a second, separately locked split, never a second look.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** (1) **Data-level invariant:** once a split exists, every snapshot of that dataset made for `run_python` excludes the test row ids, so the agent can't reach test rows by reloading the source (implemented with P17 Q1). (2) For n < 1,000: **nested CV** (outer 5 folds for the estimate, inner folds for selection), with **no separate test set**, and the "≥ 200 rows" rule is removed. (3) CV folds are **group-aware** (`GroupKFold`) when a group column exists and **time-ordered** (`TimeSeriesSplit`) when the task is temporal. "Temporal" = the plan names a time column as the ordering of the target.
>
> **Audit resolution, round 2 (2026-10-03):** **"Temporal" is decided by code**, not by the plan: a datetime column that is sortable relative to the target makes the task temporal unless the **user** overrides it. In the benchmark, the answer key decides.
>
> **Audit resolution, round 3 (2026-10-03):** **"Temporal" defined (R3-22):** a column with a datetime dtype, or with ≥ 95% of values parseable as dates, that spans more than one period and is the time the target was observed. In autonomous runs the code's decision stands; the user can override it afterwards on the plan card and re-run.

**Q16. Which model families in v1.0?**
_Blocks: P13-01, P17-02._

> **Recommendation (Claude):** Linear/logistic (regularised), decision tree, random forest,
> HistGradientBoosting, k-NN; k-means and PCA for unsupervised. These are all scikit-learn, so no
> extra packages. XGBoost and LightGBM only if P13 shows they run in the sandbox.

> **Answer Q16:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** scikit-learn only: regularised linear and logistic regression (Ridge, Lasso, ElasticNet, LogisticRegression), decision tree, random forest, HistGradientBoosting, k-NN; KMeans, AgglomerativeClustering and PCA for unsupervised work; statsmodels GLM for interpretable inference (P16). **XGBoost and LightGBM are excluded from v1.0 even if Pyodide has them.**
>
> **Why:** HistGradientBoosting covers the boosting use case with native missing-value and categorical support, so extra libraries add size (NFR-11), surface and parity work without a measurable gain on DS-Bench. Keeping the "if P13 shows they run" door open invites scope creep (R-13).
>
> **Rejected:** XGBoost/LightGBM conditional (scope creep, size); SVMs and neural nets (slow in single-threaded wasm, little gain on tabular data).
>
> **Recommendation was:** refined (closed the conditional door; added ElasticNet, agglomerative clustering, GLM).
>
> **Consequences:** P17-02 skill lists exactly these; the P13-05 perf test includes HistGradientBoosting and RandomForest.
>
> **Revisit if:** M-07 misses target on ML tasks because of model capacity, as shown by the reference model using a family we lack.
>
> **Confidence:** High · **Needs maintainer:** no

**Q17. How much tuning?**
_Blocks: P17-02, M-09._

> **Recommendation (Claude):** At most 20 configurations per model family and 3 families per
> task, with randomised search, inside the per-analysis budget. More tuning rarely beats a
> better feature and burns the $1.

> **Answer Q17:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Tuning is **time-boxed, not count-boxed**: at most 40% of the analysis wall clock (8 of 20 min), using successive halving (`HalvingRandomSearchCV`) over ≤ 3 families. On tables over 200k rows, tune on a stratified 200k sample, then refit the chosen model on the full training set. Each fit's time is journalled.
>
> **Why:** "20 configurations × 5 folds × 3 families" is 300 fits; on 1M rows in single-threaded wasm that can take hours, far beyond the 20-minute cap (Q6). Fits cost wall clock, not tokens, so time is the binding constraint. Successive halving gets most of the tuning gain for a fraction of the fits.
>
> **Rejected:** a fixed count of 20 configurations (ignores data size); no tuning (M-07 suffers); full grid search (combinatorial blow-up).
>
> **Recommendation was:** overturned (a time budget and halving replace the fixed count).
>
> **Consequences:** P17-02 skill; `HalvingRandomSearchCV` needs `sklearn.experimental` (verify in P13-01); P13-05 measures fit times.
>
> **Revisit if:** P17 benchmark shows tuning gains below 1% of the metric (then halve the time box).
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Each search runs **≤ 100 s inside one execution** (under the 120 s limit). The 8-minute tuning box is spread over **at most 4 searches** in separate executions, using the stateful kernel (P13 Q6) to keep the results between them.

**Q18. Forecasting defaults?**
_Blocks: P18._

> **Recommendation (Claude):** Always a seasonal-naive baseline. ETS and SARIMA from
> statsmodels. A rolling-origin backtest with at least 3 folds. 80% and 95% prediction intervals.
> MASE as the headline metric.

> **Answer Q18:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Always fit a seasonal-naive baseline. Models are ETS (statsmodels) and SARIMA chosen from a **small fixed grid by AIC** (statsmodels has no auto-ARIMA, and pmdarima is not shipped), plus regression on calendar features. Backtest with a rolling origin using as many folds as the history allows, up to 5 (minimum 2; with fewer, the report says the forecast is unvalidated). Produce 80% and 95% intervals, report their **empirical backtest coverage**, and use MASE (scaled by seasonal naive) as the headline metric.
>
> **Why:** "At least 3 folds" is impossible on short histories, so the rule must degrade honestly instead of failing. Interval coverage on the backtest is what shows whether the intervals mean anything, and is missing from the recommendation.
>
> **Rejected:** auto-ARIMA libraries (not available or verified offline); Prophet (heavy, not in Pyodide); point forecasts without intervals (overconfident).
>
> **Recommendation was:** refined (fixed SARIMA grid, fold rule for short series, coverage check).
>
> **Consequences:** P18-01 and P18-02; a DS-Bench forecast trap with a short history tests the "unvalidated" disclosure.
>
> **Revisit if:** the SARIMA grid's fit time breaks the 120 s execution limit.
>
> **Confidence:** High · **Needs maintainer:** no

---

## E. Benchmark (DS-Bench)

**Q19. How many tasks, and how are they split?**
_Blocks: P10-06, P12-05, DS-08 arithmetic._

> **Recommendation (Claude):** 24 tasks: 14 synthetic-trap and 10 public. Split 16 dev / 8
> holdout, stratified by task type (wrangling, inference, ML, forecasting). 16 dev tasks × ~$0.90
> fits the $15 pass. The holdout is opened only in P22.

> **Answer Q19:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **20 tasks**: 12 synthetic-trap and 8 public, stratified across wrangling, inference, ML and forecasting. Split **12 dev / 8 holdout** (3 dev and 2 holdout per type). The holdout is opened only in P22, and its trap generator uses a fresh seed.
>
> **Why:** The arithmetic in the recommendation fails. 16 dev tasks at a median near $1 (M-09 MVP) is $16 before the evaluation model's cost, over the $15 pass (DS-08, §7.3). With 12 dev tasks: 12 × ~$1 + judge ≈ $13 ≤ $15. Fewer tasks per type are noisier, which is why the results report variance across 3 runs in P22.
>
> **Rejected:** 24 tasks / 16 dev (breaks the budget); raising the pass budget to fit 16 dev tasks (a money decision, offered to the maintainer below).
>
> **Recommendation was:** overturned (budget arithmetic).
>
> **Consequences:** P12-05 split; the P20 learning sequence (3 dev passes) costs ~$39 per provider, a separate budget line (Q23).
>
> **Revisit if:** the maintainer raises the pass budget to $20, which allows 16 dev tasks.
>
> **Confidence:** Medium · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Accepted as a **planned cost** only. The actual spend needs the maintainer's explicit approval at the start of the phase that incurs it, before any paid run or the code that triggers one (DS-21).
>
> **Audit resolution (2026-10-03):** P20's use of holdout-a is the only exception to "holdout opened only in P22". **M-14 is report-only in P20** (4 tasks is too few to gate). The **lesson store is reset** before P22 runs. Gate statistics are **Q-A6**.
>
> **Audit resolution, round 2 (2026-10-03):** Gate statistics: **Q-B5**. Lessons from P20's holdout-a runs are **purged by provenance** before P22; dev lessons are kept, so P22 measures the warm agent users would get.
>
> **Maintainer decision, audit Q-B (2026-10-03):** **Q-B5:** every gate uses a **fixed number of runs decided in advance** (1 for ordinary gates; 3 for P16 and P22), with **no retry-on-near-miss**; this supersedes P12 Q7's noise rule. The task-bootstrap 95% interval is reported with every gate result.

**Q20. How are numeric answers scored?**
_Blocks: P10-03, M-01._

> **Recommendation (Claude):** The tolerance is set per question in the answer key. The default
> is a 1% relative tolerance for estimates, an exact match for counts, and a CI overlap rule for
> intervals. A task scores per question, never all-or-nothing.

> **Answer Q20:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The agent must end every benchmark task with a **structured answer block** (JSON: question id → value), which the scorer reads; each value must also be provenanced to an execution (M-04). Tolerance comes from the answer key per question: **exact** for counts and categories; an **acceptable range** for method-dependent estimates (the key computes the value under each acceptable method and allows the span plus 0.5%); **absolute tolerance** near zero. Intervals score only when the point estimate is within tolerance **and** the interval width is within 0.67–1.5× the reference width. Scoring is per question.
>
> **Why:** A flat 1% relative tolerance is too tight where several valid methods give slightly different answers, and meaningless near zero. "CI overlap" rewards wide, useless intervals. Without a structured block the scorer would have to parse prose, which puts an LLM back into scoring.
>
> **Rejected:** flat 1% (unfair to valid alternatives); CI overlap (rewards vagueness); LLM extraction of answers (violates "code, not the agent").
>
> **Recommendation was:** overturned (structured answers; acceptable-set tolerances; interval-width rule).
>
> **Consequences:** P12-03 task format; the lead's system prompt gets a benchmark-mode output contract; `docs/ds/02` defines the rules.
>
> **Revisit if:** the agent fails to emit valid answer blocks in more than 5% of tasks (fix the contract, not the scorer).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** M-04 alone is met by marking everything unverified, so add **M-19 provenanced fraction**: provenanced claims ÷ numeric claims, **≥ 90% MVP, ≥ 95% v1.0** (propose at sign-off). M-02 counts detections only from structured fields (P12 Q6). M-08 is scored on the **held-back horizon in the answer key**, not the agent's own backtest. M-07 is defined as higher-is-better (reference ÷ agent for loss metrics).
>
> **Audit resolution, round 2 (2026-10-03):** M-19's denominator = **every numeric token code extracts from the rendered final answer and report** (with the same exemptions as P11 Q4), never the agent's own claim records.
>
> **Audit resolution, round 3 (2026-10-03):** M-19 extraction also normalises **spelled-out numbers** ("forty-two") and counts **values inside chart specs and key-results tables** (R3-21).

**Q21. Do you accept the metric targets in roadmap §7?** (MVP: accuracy ≥ 70%, trap recall ≥
60%, 0 unprovenanced claims, ≤ $1 and ≤ 15 min per task. v1.0: accuracy ≥ 85%, trap recall ≥
80%, notebook reproducibility 100%, repeated mistakes −50%.)
_Blocks: EC10-2._

> **Recommendation (Claude):** Agree for now, with an explicit re-baseline after P12's baseline
> run and P13's spike. Targets set before any measurement are guesses, and the roadmap says so.

> **Answer Q21:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Accept the targets **provisionally**, with two corrections and a fixed re-baseline. (1) M-09 becomes "median cost ≤ $0.75 **and** ≤ 10% of runs hit the $1 cap" (MVP). A median "≤ $1" is meaningless when $1 is the cap, since capped runs end at $1 by construction. (2) M-10's 15-minute median stays, with the 20-minute cap from Q6. Re-baseline every target once, after P12's baseline run and P13's spike; after that, targets change only by D-NNN.
>
> **Why:** A target equal to a hard cap measures the cap, not the agent. Targets set before measurement are guesses, but they must freeze after the re-baseline so phases can't drift them to pass.
>
> **Rejected:** accepting as is (M-09 untestable); setting no targets until P13 (P10-03 needs numbers to plan against).
>
> **Recommendation was:** refined (M-09 corrected; a freeze rule added).
>
> **Consequences:** roadmap §7 M-09 wording at sign-off (propose at sign-off); EC10-2.
>
> **Revisit if:** the P12 baseline shows the SQL-only analyst already near a target, in which case the target is too low.
>
> **Confidence:** Medium · **Needs maintainer:** no

**Q22. Who writes the answer keys?**
_Blocks: P12-03, NFR-06._

> **Recommendation (Claude):** Code only. The trap generator computes the true answer from the
> seed it generated the data with. Public-dataset keys come from a harness script that you review
> once. No LLM ever writes or sees an answer key.

> **Answer Q22:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Code only. Synthetic keys are computed by the generator from its own seed. Public-dataset keys are computed by a harness script in a **pinned CPython reference environment** (not the app sandbox), and **two contributors review that script** before first use. Keys are generated locally (git-ignored), but their **SHA-256 hashes are committed**, so every contributor can prove they score against identical keys. No LLM writes or reads a key.
>
> **Why:** Keys generated locally on different library versions could silently differ between contributors (R-19). Committed hashes make that detectable without committing the keys. A reference environment separate from the sandbox avoids grading the sandbox with itself.
>
> **Rejected:** committed keys (they leak into any agent-reachable clone); LLM-assisted keys (circular); one-person review of the public-key script (single point of error).
>
> **Recommendation was:** refined (pinned reference env, committed hashes, two reviewers).
>
> **Consequences:** P12-03 and P12-09; Q44 relies on key hashes; P21-02's reference env is reused.
>
> **Revisit if:** the reference env's versions must change (keys are regenerated and the hashes updated by D-NNN).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Wording clarified: no LLM **in the analysis path** reads or writes keys. The **evaluation model reads keys by design** (§7.3), bench-only and outside the app. The private-paths hook gains `bench/answer-keys/` (P10-07). Who holds holdout seeds is **Q-A5**.
>
> **Audit resolution, round 2 (2026-10-03):** Holdout keys are **generated by a maintainer on their own machine** from the maintainer-held seeds, only when P20 or P22 runs them. Holdout passes are run or witnessed by a maintainer (**Q-B4**).
>
> **Maintainer decision, audit Q-B (2026-10-03):** **Q-B4 and custody:** CI re-scores dev runs only; holdout runs are run or witnessed by a maintainer. Holdout **task definitions** (dataset + questions) are kept **outside the repo with a maintainer** too, with only their hashes committed, because public holdout tasks are reproducible from public data (R3-11).

**Q23. Is the $15 per benchmark pass per provider, or for both together?**
_Blocks: P12-07, DS-08._

> **Recommendation (Claude):** Per provider. A "both" pass costs up to $30, and the runner
> prints the projected cost and asks before starting.

> **Answer Q23:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** $15 **per provider pass**, including that pass's evaluation-model cost. A "both" pass is ≤ $30. The runner prints the projected cost from the last run's per-task medians, refuses to start above the cap without `--confirm`, and stops cleanly when the cap is reached. Learning sequences (P20, 3 passes) and holdout passes (P22, 3 per provider) are budgeted separately per phase.
>
> **Why:** Per provider keeps the two lanes independent and comparable. Including the judge stops evaluation cost from leaking past the cap. The separate phase budgets make the real total visible: P20 ≈ $39–45 per provider, P22 ≈ $30 per provider.
>
> **Rejected:** $15 for both providers together (halves each lane's tasks and breaks Q19); an uncapped runner (cost blowup, R-06).
>
> **Recommendation was:** kept (cost projection, judge inclusion and phase budgets made explicit).
>
> **Consequences:** P12-07 runner; P20 and P22 plans state their pass budgets.
>
> **Revisit if:** actual costs per pass exceed projections by more than 25%.
>
> **Confidence:** High · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Accepted as a **planned cost** only. The actual spend needs the maintainer's explicit approval at the start of the phase that incurs it, before any paid run or the code that triggers one (DS-21).
>
> **Audit resolution (2026-10-03):** The runner writes a committed **spend ledger `bench/spend/<phase>.jsonl`** and refuses once the phase total would exceed the amount approved for that phase. `--confirm` only confirms a projection within the approved amount, never an overrun. Who approves overruns is **Q-A3**.
>
> **Maintainer decision, audit Q-B (2026-10-03):** **Q-B3, hard block in code:** see DS-21. The paid runner reads approvals from the remote phase branch, refuses non-interactive runs and agent sessions, needs the approval id typed by a human, and refuses any task the remaining approved amount can't cover. There is no override flag. Approval entries name phase, contributor and amount (pending Q-C1).
>
> **Maintainer decision, audit Q-C (2026-10-03):** **Q-C1:** every spend approval names **phase, contributor and amount** (e.g. "P16, @handle, $40"). Each contributor's runner enforces only its own entry.

---

## F. Self-Learning (DS-14)

**Q24. What may the agent learn from?** Candidates: (a) its own failed executions (wrong
pandas API, dtype errors); (b) method-check and critic findings; (c) your corrections in chat
("that column is in thousands"); (d) your thumbs-up or thumbs-down on answers.
_Blocks: P20-01, P20-02._

> **Recommendation (Claude):** (a), (b) and (c) in v1.0. (d) needs a rating UI and gives weak
> signals; add it later if the benchmark shows a gap. Never from benchmark answer keys or scores
> (NFR-13).

> **Answer Q24:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Lessons come from (a) failed executions, (b) method-check and critic findings, and (c) user corrections. A correction counts **only from text the user typed in the chat box**, never from tool output, data values or dataset cards. (d) 👍/👎 ratings are collected as a live evaluation signal (§7.0 layer 4) but are **not** a lesson source in v1.0. Lessons never come from answer keys, scores or the evaluation model's rationales.
>
> **Why:** Prompt-injected data can impersonate a user correction ("note from the user: column X is clean"). Restricting the source by message role is a code-level guard (NFR-13), not a prompt rule. Ratings are too coarse to say _what_ to learn, but they are useful for measuring.
>
> **Rejected:** ratings as a lesson source (weak and ambiguous); learning from judge rationales (it would learn to please the judge).
>
> **Recommendation was:** refined (source-by-role guard; ratings kept for evaluation only; judge rationales excluded).
>
> **Consequences:** P20-02 checks the message role; P20-09 injection fixture "fake user correction inside a CSV cell".
>
> **Revisit if:** M-13 stalls and correction lessons dominate the useful ones; then consider ratings.
>
> **Confidence:** High · **Needs maintainer:** no

**Q25. Which lessons apply automatically, and which need your approval?**
_Blocks: P20-04, OD-04, EC20-4._

> **Recommendation (Claude):** Lessons that **add** care apply automatically and are visible in
> a Learnings panel (e.g. "parse dates in this file with dayfirst=True", "check for duplicate
> customer ids"). Lessons that **suppress** a check, a warning or a step always wait for your
> approval (e.g. "ignore the leakage warning on column X"). Rejected lessons are kept as
> rejected, so they are not proposed again.

> **Answer Q25:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Every lesson carries a typed **effect** from a fixed enum, assigned by code from the lesson's structured fields: `parse_hint`, `prefer_method`, `add_check` and `add_caveat` **apply automatically** (visible in the Learnings panel); `skip_check`, `dismiss_warning`, `change_default` and `relax_threshold` **need approval**. Anything code can't map to an additive effect **defaults to needing approval** (fail closed). Lessons can never change the test-set lock, the provenance rule or sandbox limits, even with approval. Rejected lessons are kept as rejected.
>
> **Why:** The recommendation leaves "adds care vs suppresses" to judgement on free text, and an injected lesson can be _phrased_ as care ("always treat column X as leak-free"). A typed effect assigned by code is something an injection can't talk its way around, and the fail-closed default covers what the enum doesn't recognise.
>
> **Rejected:** classifying lesson text with an LLM (injectable); approval for every lesson (fatigue, and approvals turn into clicks).
>
> **Recommendation was:** refined (typed effect enum, fail-closed default, unchangeable invariants).
>
> **Consequences:** §12.7 adds an `effect` field (propose at sign-off); EC20-4's fixture tests the "care-phrased suppression" case.
>
> **Revisit if:** more than 30% of lessons end up pending approval (the enum is too coarse).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Auto-applied lessons are **rendered into context by code from structured fields only** (effect, target, parameters). Any agent-phrased text appears only in the fenced advisory block, never in the instruction layer. `prefer_method` may only choose **within the method policy's acceptable set** (P16 Q2); anything outside it is `change_default` and needs approval.

**Q26. Do lessons stay with one dataset, or apply everywhere?**
_Blocks: P20-03._

> **Recommendation (Claude):** Both, typed: dataset lessons apply only to that dataset (by
> content hash); execution and method lessons are global. Retrieval injects at most ~10 lessons
> per analysis, ranked by relevance and confidence, so context and cost stay bounded.

> **Answer Q26:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Typed scope. Dataset lessons apply only to that dataset's content hash. Execution and method lessons start as **dataset-scoped** and become **global only after the same lesson is confirmed on ≥ 2 distinct datasets**. Retrieval injects at most **8 lessons and ≤ 1.5k tokens** per role call, ranked by relevance × confidence.
>
> **Why:** A lesson learned on one dataset ("dates are day-first") is often a quirk, not a rule. Promoting it globally after one sighting would quietly corrupt other analyses (R-07). The token cap matches the working-set budget in Q37.
>
> **Rejected:** global from the start (over-generalisation); dataset-only forever (the agent never improves on generic mistakes such as pandas API errors).
>
> **Recommendation was:** refined (promotion rule; numbers aligned to Q37).
>
> **Consequences:** P20-03 and P20-05; M-13 measures repeats across datasets as well.
>
> **Revisit if:** M-13 shows the same generic error repeating across datasets because promotion is too slow.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** "Same lesson" for promotion = the same trigger and effect with matching structured fields (target and parameters), checked by code, not by text similarity.

**Q27. How are per-dataset notes keyed, and what happens when the file changes?**
_Blocks: P20-06, A-10._

> **Recommendation (Claude):** Keyed by dataset name plus content hash. When the hash changes, the
> notes are kept but marked stale until the agent re-checks them or you confirm them.

> **Answer Q27:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Notes are keyed by **content hash** (SHA-256 computed at registration, streamed), with the file path and, for Hugging Face, repo + revision + file as secondary keys. When the hash changes, notes are kept but marked **stale**, shown with a badge, and **not injected into the agent's context** until a contributor or the agent re-validates them. Registration hashing also fixes stale row counts (audit A-10).
>
> **Why:** Names change and are reused, so the hash is the only stable identity of _this data_. Stale facts in context are worse than no facts, because the agent would apply a dictionary that no longer matches.
>
> **Rejected:** name + hash as the primary key (renames orphan notes); keep stale notes active (wrong facts in context).
>
> **Recommendation was:** refined (hash primary; stale notes excluded from context).
>
> **Consequences:** P15 or P20 adds registration hashing (a catalog schema change, P11-09); P20-06.
>
> **Revisit if:** hashing large files slows registration noticeably (then hash in the background and mark "pending").
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Only the **user** re-validates stale notes. The agent may propose a re-validation, which the user accepts.

---

## G. Providers

**Q28. How strict is "both from day one" (DS-04)?** A feature could (a) ship only when both
providers pass its tests and benchmark tasks, or (b) ship on Claude first within the phase, with
OpenAI in the same phase before sign-off.
_Blocks: NFR-14, every phase exit._

> **Recommendation (Claude):** (b) within a phase, with (a) as the phase **exit** rule. Build on
> one provider, finish on both, and sign off only when the parity test and both benchmark runs
> pass. `second_opinion` stays as an optional cross-provider critic (P19-04).

> **Answer Q28:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** (b) inside a phase, (a) at the phase exit. Build on either provider first; the phase can't exit until the shared parity test (one scope table, same tools, limits and approvals) passes and **both providers' dev benchmark runs meet the phase's gates**. M-15 (the accuracy gap) is reported, not gated. A provider that can't support a capability gets an explicit D-NNN waiver from the maintainer, never a silent gap.
>
> **Why:** Strict per-feature parity would serialise every task on two SDKs; exit-level parity keeps DS-04's promise at the point where it matters. The waiver path stops one SDK's missing feature from blocking a phase indefinitely while keeping the gap visible.
>
> **Rejected:** strict (a) per feature (doubles cycle time); deferring OpenAI to later phases (contradicts DS-04).
>
> **Recommendation was:** kept (added the waiver path and the "gates on both" wording).
>
> **Consequences:** every phase's exit checklist includes "parity test + both providers' gates"; NFR-14.
>
> **Revisit if:** waivers accumulate (more than 2), which signals that parity is costing more than it returns.
>
> **Confidence:** High · **Needs maintainer:** no

---

## H. Process and Repo

**Q29. The working tree's `package-lock.json` has 90 lines of `libc` fields removed (audit A-07).
Revert it, or commit it?**
_Blocks: P10-07._

> **Recommendation (Claude):** Revert it (`git checkout package-lock.json`). CI uses Node 24's
> npm. Pin the npm version in `package.json` `packageManager`/`engines` so every machine writes
> the same lockfile.

> **Answer Q29:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Revert the drift now (`git checkout package-lock.json`). In P10-07, find which npm version writes the `libc` fields, then pin it in `package.json` (`"packageManager": "npm@<that version>"` plus `engines.npm`), and align CI's npm to the same version.
>
> **Why:** The lockfile drift comes from a mix of npm versions. It isn't harmful, but it churns diffs and the CI cache key (`hashFiles('package-lock.json')`), and with several contributors it would recur on every install. `package.json` currently pins Node only (verified), so nothing stops the drift.
>
> **Rejected:** commit the drift (it just moves the churn to whoever has the other npm); ignore it (repeats with every contributor).
>
> **Recommendation was:** refined (the exact npm version is to be verified first, not assumed to be "Node 24's npm").
>
> **Consequences:** P10-07 task; CONTRIBUTING.md states the npm version (P10-08).
>
> **Revisit if:** the pinned npm can't install on CI's Node.
>
> **Confidence:** High · **Needs maintainer:** no

**Q30. How much review time do the contributors have per week in total, and should reviewers
read every plan or rely on the auditor?**
_Blocks: roadmap §9 sizes, R-15._

> **Recommendation (Claude):** Contributors read the questionnaires (the decisions) and skim the
> plans. The `plan-auditor` reads every plan in full and raises only one-line questions for
> Critical and Major findings. Give a combined hours-per-week figure, and the phase sizes are
> re-baselined from it.

> **Answer Q30:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Proposed default, to be confirmed: **~10 review hours per week in total across contributors**, with the S/M/L sizes kept as they are. Reviewers read the questionnaires' Spec-Designer Summary and every answer flagged "Needs maintainer", and skim the plans. The `plan-auditor` reads everything in full and escalates only Critical and Major issues.
>
> **Why:** Sizes in roadmap §9 assume review capacity roughly like this. The answers now carry their reasoning, so reviewers need only check the disagreements, the overturned recommendations and the maintainer items, not all 44 answers.
>
> **Rejected:** reading every plan in full each phase (the bottleneck in R-15); auditor only, with no human reading (decisions without an owner).
>
> **Recommendation was:** kept (pointed reviewers at the summary and flagged items).
>
> **Consequences:** re-baseline §9 sizes once real hours are known.
>
> **Revisit if:** phases wait on review for more than a week.
>
> **Confidence:** Low · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** About **1 hour per week for reading plans** (possibly more), so reviewers read each questionnaire's Spec-Designer Summary and the flagged items, not whole plans. **PR review is automated** by review agents (DS-22), so human review time is not the bottleneck for code.
>
> **Audit resolution (2026-10-03):** Summary row and maintainer list updated to match the maintainer decision.

**Q31. If no code-signing certificate is available by P23, is an unsigned v1.0 acceptable?**
_Blocks: P23-02._

> **Recommendation (Claude):** Yes, with the README's existing SmartScreen notes and a published
> SHA-256 checksum. Signing becomes a v1.x item.

> **Answer Q31:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Yes, an unsigned v1.0 is acceptable. Each release publishes `SHA256SUMS.txt`, and the README's SmartScreen instructions are kept. Before P23, price a low-cost cloud signing service against a traditional certificate, so signing can be a quick v1.x step.
>
> **Why:** DS-05 makes signing nice-to-have. Checksums give integrity, and signing only adds publisher identity, which matters for strangers installing (DS-03) but doesn't block v1.0.
>
> **Rejected:** blocking v1.0 on signing (a money and time dependency outside the code); dropping checksums too (no integrity check at all).
>
> **Recommendation was:** refined (added the price comparison step).
>
> **Consequences:** P23-02; README release notes.
>
> **Revisit if:** SmartScreen or antivirus blocks a meaningful share of testers.
>
> **Confidence:** High · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Skipped for now. v1.0 ships unsigned with published checksums; signing is revisited at P23.

**Q32. Saved analyses (FR-19): keep them forever, or with a retention limit?**
_Blocks: P14-06, P23-03._

> **Recommendation (Claude):** Forever, until you delete them, with a storage view in Settings
> showing the size per analysis. They are local and yours, and auto-deleting someone's work is
> worse than using disk.

> **Answer Q32:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Keep saved analyses until the user deletes them. Settings → Storage shows the size per analysis and per kind (journal, derived datasets, models, artifacts), with delete per analysis and "delete everything derived from dataset X". There is no automatic expiry. Uninstall keeps `userData`, as today.
>
> **Why:** Silently deleting someone's work is worse than using disk; this is a local tool, and disk is cheap and visible. Journals hold code and ≤ 20-row samples of the user's own data, so they stay local only, and deletion must be complete (journal, derived data, models and artifacts together).
>
> **Rejected:** retention limits (lose work); keeping data without a storage view (invisible growth, audit A-09).
>
> **Recommendation was:** refined (per-kind view and cascade delete).
>
> **Consequences:** P14-06 and P23-03; a cascade-delete test.
>
> **Revisit if:** the median `userData` size of testers exceeds 5 GB.
>
> **Confidence:** High · **Needs maintainer:** no

---

## I. Evaluation (DS-20, roadmap §7)

**Q33. Are the per-agent metrics (PA-01..PA-11) gates, or reported only?**
_Blocks: P12-12, phase exits from P14 on._

> **Recommendation (Claude):** Reported in every score report, but gating only where a role's
> own phase introduces it (e.g. PA-04 gates P15, PA-06 gates P17). Making all of them gates from
> day one would block phases on roles that don't exist yet.

> **Answer Q33:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** All per-agent metrics are reported from P12. Each becomes a **gate in the phase that introduces its role, and stays a gate afterwards**: PA-02 and PA-09 (provenance) from P14, PA-03 and PA-04 from P15, PA-05 from P16, PA-06 from P17, PA-07 from P18, PA-01 and PA-08 from P19. PA-10 and PA-11 remain report-only.
>
> **Why:** A gate that turns off after its phase lets later phases regress it unnoticed. Mapping each gate to a phase makes the exit checklists mechanical. Cost and error-count metrics (PA-10, PA-11) are diagnostics, not quality bars.
>
> **Rejected:** all gates from day one (blocks on roles that don't exist yet); report-only throughout (no protection against regressions).
>
> **Recommendation was:** refined (explicit phase map; "once a gate, always a gate").
>
> **Consequences:** each phase plan's exit checklist lists its inherited PA gates; P12-12 builds the per-role breakdown.
>
> **Revisit if:** a PA gate blocks a phase for reasons outside that phase's scope (then a D-NNN may scope it).
>
> **Confidence:** High · **Needs maintainer:** no

**Q34. Which model is the evaluation model?**
_Blocks: P12-10, NFR-17._

> **Recommendation (Claude):** The other provider from the run being scored: an OpenAI model
> judges Claude runs and a Claude model judges OpenAI runs, each a strong model at temperature 0.
> If only one key is available, use a different model family of the same provider, and mark the
> score "same-provider". Pinned by full model id, recorded in every rubric score (§12.11).

> **Answer Q34:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Cross-provider judging by default: an OpenAI model judges Claude runs and a Claude model judges OpenAI runs. The exact judge model ids are pinned in P12-10 after a docs-researcher check. Use temperature 0 where the model supports it; otherwise score twice and average, flagging criteria where the two scores differ by more than 1. A contributor with only one key gets **same-provider, different-family** judging, marked `same-provider`. Calibration (M-17) is measured **separately per judge configuration**, and scores from different configurations are never mixed.
>
> **Why:** Self-preference bias is real, so independence matters (NFR-17). Some current reasoning models don't accept a temperature parameter, so the plan can't assume it (not verified here; routed to P12-10). Mixing judge configurations would make M-16 meaningless across contributors (R-19).
>
> **Rejected:** same model as the run (self-preference); a human-only rubric (doesn't scale to every run).
>
> **Recommendation was:** refined (double-scoring fallback, per-configuration calibration, no mixing).
>
> **Consequences:** P12-10 and P12-11; §12.11 records the judge configuration (already present).
>
> **Revisit if:** cross-provider judging costs more than 10% of a pass.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution, round 2 (2026-10-03):** EC10-7 needs a Maintainer decision line here, collected with Q-B1..Q-B6.
>
> **Maintainer decision (2026-10-03):** **For now, Claude only.** The evaluation model is a Claude model, a **different model from the analyst's** where possible (e.g. a stronger model judging), and scores are marked `same-provider`. Cross-provider judging can be added later by a new decision.
>
> **Audit resolution, round 3 (2026-10-03):** A Claude-only judge needs an **Anthropic key for OpenAI-lane passes too**; `CONTRIBUTING.md` says so, and the judge's cost is added to the per-pass arithmetic (R3-20). Whether the judge must always differ from every model the run used: **Q-C2** (R3-10).
>
> **Maintainer decision, audit Q-C (2026-10-03):** **Q-C2: the evaluation model is Claude Opus** (exact model id pinned in P12-10). Analyst runs default to Sonnet, so the judge is a different model. If any role in a run used Opus, that run's judge score is labelled `same-model` and **cannot block** under Q36 option B.

**Q35. How big is the calibration set, and who labels it?**
_Blocks: P12-11, M-17._

> **Recommendation (Claude):** 24 outputs (one per task, mixed quality, including deliberately
> weak ones), labelled independently by at least two contributors with the rubric. Where they
> disagree by more than 1, they discuss and settle. The judge must then agree within ±1 on ≥ 80%.
> About 2–3 hours of labelling in total.

> **Answer Q35:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **30 calibration items** from dev-task outputs of both providers, including deliberately weaker outputs from ablated runs (no critic, no lessons) so the scores spread across the scale. Two contributors label each item independently with the rubric; disagreements greater than 1 point are discussed and settled. The judge passes when, **per criterion**, it is within ±1 of the settled label on ≥ 80% of items **and** quadratic-weighted Cohen's κ ≥ 0.6.
>
> **Why:** On a 5-point scale where most outputs cluster at 3–4, "within ±1" is reached largely by chance, so on its own it is a weak bar. κ corrects for chance agreement. One item per task (24) is also no longer possible after Q19's 20 tasks, and more varied items calibrate better. Labelling costs about 3–4 hours per labeller.
>
> **Rejected:** ±1 agreement only (chance-inflated); a single labeller (their quirks become the "truth").
>
> **Recommendation was:** overturned (κ added; item count and sourcing changed).
>
> **Consequences:** M-17's definition changes (propose at sign-off); P12-11; this needs two contributors' time.
>
> **Revisit if:** the two humans can't reach κ ≥ 0.6 with each other; then the rubric anchors need rewriting first.
>
> **Confidence:** Medium · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Agree, with the labelling spread over several sessions instead of one sitting.

**Q36. Can the evaluation model's score ever block a phase?**
_Blocks: EC12-5, every phase exit._

> **Recommendation (Claude):** No. It is reported next to the code metrics (M-16), and a drop of
> more than 0.5 between runs triggers a human look, but only code-scored metrics gate. LLM
> judges are useful and noisy; gating on one invites tuning the analyst to the judge.

> **Answer Q36:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** No. The evaluation model never gates a phase. M-16 is published only while M-17 holds. A drop of more than 0.5 between comparable runs (same judge configuration) triggers a human review of a sample. Prompt or skill changes are never justified by judge rationales alone; they need a code-scored metric or human-labelled evidence.
>
> **Why:** LLM judges are noisy and gameable; letting one gate would push the analyst toward the judge's tastes (Goodhart). Its job is to light up quality regressions that code metrics miss, and a human confirms them.
>
> **Rejected:** gating on M-16 (gameable); not running the judge at all (prose quality goes unmeasured).
>
> **Recommendation was:** kept (added the "no changes justified by judge alone" rule).
>
> **Consequences:** EC12-5 and the §7.0 table stay as written.
>
> **Revisit if:** after several phases, M-16 correlates strongly with human labels and code metrics; then it could become a soft gate by D-NNN.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution, round 2 (2026-10-03):** EC10-7 needs a Maintainer decision line here, collected with Q-B1..Q-B6.
>
> **Maintainer decision (2026-10-03):** **Option B: blocks on clear failures.** The evaluation model can block a phase only when **all three** hold: (1) its calibration against human labels passed (M-17); (2) a floor set in advance is breached: any rubric criterion averages **below 2.5/5**, or the overall score drops **more than 0.5** from the last comparable run (same judge configuration); (3) a human peer reviews the flagged outputs and confirms. Otherwise it reports only. Code-scored metrics keep gating as before. Supersedes the decision body above and P16 Q9 where they say "never gates".
>
> **Audit resolution, round 3 (2026-10-03):** **Blocking record (R3-17):** the floor is evaluated on the phase gate's **dev task set** (median over its fixed runs). "Drop > 0.5" means the drop exceeds 0.5 **and** the task-bootstrap intervals of the two runs don't overlap. Confirmation is a committed `bench/results/<phase>/judge-block.json` written by a peer **who did not run the pass**, naming the outputs reviewed.

---

## J. Context Engineering (DS-19, roadmap §8.5)

**Q37. What are the first per-role context budgets?** Tuned with measurements in P14 and P22.
_Blocks: P11-12, NFR-16, OD-07._

> **Recommendation (Claude):** Start at: lead analyst 40k input tokens per turn after compaction;
> profiler, wrangler, statistician, modeler and forecaster 16k each; critic 12k; report writer
> 12k; dataset scout 8k. Working-set items (lessons, notes) take at most 2k of any budget. These
> are starting points to measure against, not limits to defend.

> **Answer Q37:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** First budgets, in input tokens per call after shaping: lead analyst **16k**; profiler, wrangler, statistician, modeler and forecaster **8k**; critic **6k**; report writer **8k**; dataset scout **4k**. The working set (lessons and notes) takes ≤ 1.5k of any budget, and one execution output ≤ 2k (Q10). The stable prefix (system prompt and skills) is prompt-cached.
>
> **Why:** The recommended 40k lead budget fails the $1 cap. At an assumed ~$3 per million input tokens for a Sonnet-class model, 40k × ~30 turns is about $3.60 per analysis before sub-agents. 16k × ~20 turns plus the sub-agents lands near $1 even before caching. Price per token is **not verified here** (assumed), and is routed to P11-11 together with real measurements in P14.
>
> **Rejected:** 40k lead / 16k specialists (about 3.5× over budget); no budgets (context bloat, R-17).
>
> **Recommendation was:** overturned (budget arithmetic against DS-08).
>
> **Consequences:** OD-07; ADR-09; Q10's 8 KB output cap; M-18 measures against these numbers from P14.
>
> **Revisit if:** P14 measurements show M-01 or PA metrics fall because roles are starved, as shown by fetch-by-id rates and failed tasks.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The **Claude lead budget is report-only** until P11 verifies what DataDesk can control on the Claude path (the CLI owns the transcript, and its system prompt and tool schemas aren't measured). M-18 for the Claude lead is report-only in v1.0 unless that is resolved.

**Q38. How is long conversation history handled?**
_Blocks: P11-12, P14-09._

> **Recommendation (Claude):** Compact when the lead passes 70% of its budget: keep the plan,
> decisions, numbers with their output ids, and open questions as a structured summary, and drop
> raw tool output (it is in the journal and can be fetched by id). Use the SDKs' own compaction
> only if it can be made to keep that structure; verify in P11.

> **Answer Q38:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Provider-specific, with one shared artifact. **OpenAI path:** DataDesk replays history itself (`openaiOrchestrator`), so DataDesk compacts. At 70% of the lead budget, earlier turns are replaced by a structured **analysis state card** (plan, decisions, numbers with output ids, open questions) built by code from the journal. **Claude path:** the Agent SDK's CLI owns the transcript, so we rely on its auto-compaction and inject the same state card every 10 turns and after any compaction. P11 verifies which compaction controls the SDK exposes.
>
> **Why:** The recommendation assumes DataDesk can rewrite the history on both providers, but on Claude the CLI holds the transcript (D-013), so we can only steer it. Building the state card from the journal ("code, not the agent") means compaction never loses a number or a decision.
>
> **Rejected:** our own compaction on both providers (not possible on Claude without leaving the SDK); no compaction (long analyses overflow).
>
> **Recommendation was:** overturned (provider-specific mechanism; state card built by code).
>
> **Consequences:** ADR-09 (P11-12) documents both paths; P14-09 builds the state card; §12 gains a state-card schema (propose at sign-off).
>
> **Revisit if:** the SDK exposes a pre-compaction hook or custom summaries, which would allow one mechanism for both.
>
> **Confidence:** Medium · **Needs maintainer:** no

**Q39. Where does the contributor `context-engineering` skill apply?**
_Blocks: P11-13._

> **Recommendation (Claude):** On every change to a system prompt, sub-agent definition, runtime
> skill, tool description or tool output format. The PR template gets a box "context checklist
> followed", and the plan-auditor checks new roles for a context contract. It is also usable on
> its own (`/context-engineering`) when designing a new role.

> **Answer Q39:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** It applies to every change to: system prompts, sub-agent definitions and the scope table, runtime skills, tool descriptions, tool output formats, and context-builder rules. Enforcement has three parts: (1) a PR-template checkbox; (2) the `code-reviewer` agent flags any diff under `src/main/agent/**`, `resources/agent-plugin/**` or `src/mcp-server/**` tool descriptions that lacks the checklist; (3) a **unit test per tool asserting its maximum output size ≤ its contract** (code). It can also be invoked on its own when designing a new role.
>
> **Why:** A checklist nobody verifies decays. The size test turns the most important rule (budgets) into a failing test, and the reviewer check covers the rest.
>
> **Rejected:** a guideline only (unenforced); review by the plan-auditor only (it audits plans, not every PR).
>
> **Recommendation was:** refined (code-reviewer path rule and output-size tests added).
>
> **Consequences:** P11-13 skill; P10-08 PR template; the code-reviewer agent prompt is updated in P11.
>
> **Revisit if:** the checklist starts producing more review noise than it catches.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Enforcement moves from `code-reviewer` to review-suite criterion **08-context-and-cost** (P10-09).

---

## K. Collaboration (DS-18, roadmap §18)

**Q40. Who decides when contributors' answers or opinions differ?**
_Blocks: P10-08, roadmap §18.1._

> **Recommendation (Claude):** The maintainer decides, after the different views are written in
> the answer block. The D-NNN entry records the alternatives, as `DECISIONS.md` already requires.
> Security rules (CLAUDE.md 1–6) change only with the maintainer's explicit sign-off and a new
> D-NNN.

> **Answer Q40:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The maintainer decides, after the differing views are written in the answer block. The D-NNN records the alternatives and who held them (by handle). Work isn't blocked by an open disagreement unless the item is a one-way door: a security rule, a data format persisted in `userData`, or a benchmark freeze. Security rules (CLAUDE.md 1–6) change only by the maintainer's explicit sign-off and a new D-NNN. Who holds the maintainer role is listed in `CONTRIBUTING.md`.
>
> **Why:** One final decision-maker avoids deadlock. Reversible choices can proceed and be revised, while one-way doors must wait, which spends caution only where it matters.
>
> **Rejected:** majority vote (meaningless with a small team); decisions by whoever implements first (silent drift).
>
> **Recommendation was:** refined (one-way-door rule; recording who held which view).
>
> **Consequences:** P10-08 `CONTRIBUTING.md`; roadmap §18.2.
>
> **Revisit if:** the team grows past ~5 active contributors.
>
> **Confidence:** High · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Agree.

**Q41. What is the review rule for PRs?**
_Blocks: P10-08 (branch protection), DoD-8._

> **Recommendation (Claude):** One approval from someone other than the author, plus CI green,
> for every PR into a phase branch or `main`. A phase PR into `main` also needs the
> `code-reviewer` agent's report with no open blockers, and the maintainer's approval.

> **Answer Q41:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Every PR needs CI green and one approval from someone other than its author, **including the maintainer's own PRs**. A phase PR into `main` also needs the `code-reviewer` report with no open blockers, plus the maintainer's approval (or, when the maintainer is the author, another contributor's approval plus the maintainer's sign-off comment). Enforce with GitHub branch protection or rulesets on `main` and `phase-*`. If the repository's plan can't enforce that on a private repo (**not verified here**), enforce it by convention plus a CI job that fails when a PR's review state isn't "approved".
>
> **Why:** "No self-merge" matters most for the maintainer, who otherwise is the single point of failure. Branch protection on private repositories depends on the GitHub plan, so the rule needs a fallback that doesn't rely on paid features.
>
> **Rejected:** approval only for phase PRs (item-level bugs pile up); two approvals (impractical for a small team).
>
> **Recommendation was:** refined (no self-merge for the maintainer; enforcement fallback).
>
> **Consequences:** P10-08 branch protection task; a check of the repository's visibility and plan.
>
> **Revisit if:** review latency regularly exceeds 3 days.
>
> **Confidence:** Medium · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** **Not adopted.** No human approval is required to merge a work-item PR. Instead, every PR must pass the automated review suite (no blocker fired, verdict committed) and CI (DS-22). Phase PRs into `main` are still merged by the maintainer, as phase sign-off.
>
> **Audit resolution (2026-10-03):** Summary row updated. The audit raised that DS-22 depends on required status checks and on protection for sensitive paths: **Q-A1, Q-A2**.
>
> **Maintainer decision, audit Q-A1 (2026-10-03):** review stays automated, but **every PR is merged by a human**; agents never merge (DS-23). Protected paths also need a maintainer's approval through CODEOWNERS.
>
> **Maintainer decision, audit Q-B2 (2026-10-03):** **Peer review is required**: every PR needs approval from a human who is not its author, in addition to the agent review suite. A human merges.
>
> **Audit resolution, round 3 (2026-10-03):** Of the maintainer lines above, **the latest wins**: agent review + **human peer review** (Q-B2); a human merges; agents never merge (Q-A1).

**Q42. Branch model: work-item branches into a phase branch, or straight into `main`?**
_Blocks: P10-08, roadmap §18.3._

> **Recommendation (Claude):** Work-item branches (`phase-N/<item-id>-<slug>`) into the phase
> branch (`phase-N-<slug>`), and one phase PR into `main` at `/finish-phase`. It keeps the
> existing one-PR-per-phase review and lets two people work on one phase without stepping on
> each other.

> **Answer Q42:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Work-item branches `phase-N/<item-id>-<slug>` are cut from and merged into the phase branch `phase-N-<slug>` with squash merges (one conventional commit per item, matching CLAUDE.md). The phase branch merges into `main` once, at `/finish-phase`, with a merge commit, as the existing phase PRs do. At phase start, the phase branch is cut from the latest `main`.
>
> **Why:** Squash per item keeps CLAUDE.md's "one commit per task" true even when an item took several commits. The single phase PR keeps the phase-level review and learning-log rhythm that phases 0–9 used.
>
> **Rejected:** straight to `main` (no phase-level review point); long-lived personal branches (merge pain).
>
> **Recommendation was:** refined (merge strategies and cut points specified).
>
> **Consequences:** `CONTRIBUTING.md`; `/finish-phase` reads the squashed item commits for the summary.
>
> **Revisit if:** phases grow so long that the phase branch drifts far from `main` (then merge `main` in weekly).
>
> **Confidence:** High · **Needs maintainer:** no

**Q43. Where is work tracked?**
_Blocks: P10-08, roadmap §18.3._

> **Recommendation (Claude):** GitHub Issues, one per work item, created from `ROADMAP.md` when
> a phase starts, with labels `phase-N`, `type` and `needs-decision`, plus a simple GitHub
> Project board (Todo, In progress, In review, Done). `ROADMAP.md` checkboxes stay the source of
> truth for "done".

> **Answer Q43:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** GitHub Issues, one per work item, **generated by a script** from the phase's `ROADMAP.md` checklist with the `gh` CLI (idempotent: matched by item id). Labels: `phase-N`, `type:*`, `needs-decision`. A PR closes its issue with `Closes #n`. A Project board is optional. `ROADMAP.md` stays the source of truth for "done".
>
> **Why:** Issues created by hand drift from the roadmap; a script keeps one source of truth and makes "claim by assigning" possible. The board adds overhead a small team may not need.
>
> **Rejected:** a mandatory Project board (ceremony); tracking only in `ROADMAP.md` (no way to claim items or see who is doing what).
>
> **Recommendation was:** refined (scripted, idempotent issue sync; board optional).
>
> **Consequences:** P10-08 adds a small issue-sync script.
>
> **Revisit if:** issues and `ROADMAP.md` disagree more than once per phase.
>
> **Confidence:** High · **Needs maintainer:** no

**Q44. How are benchmark costs and results shared?**
_Blocks: P12-07, R-19, AC-09._

> **Recommendation (Claude):** Each contributor runs with their own keys and pays for their own
> runs. The contributor who claimed a benchmark-gated exit runs the official pass, and its score summary
> (no answer keys) is committed under `bench/results/` with the provider, model ids and versions.
> Comparisons across contributors are refused when those don't match.

> **Answer Q44:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Each contributor runs with their own keys and pays for their own runs. The **official** pass for a benchmark-gated exit is run by the contributor who claimed that exit, with pinned models and a clean config. Its score summary (no answer keys) is committed under `bench/results/<phase>/` together with provider, model ids, prompt and skill versions, and the **answer-key hashes** (Q22). The comparison report refuses runs whose key hashes or configuration differ.
>
> **Why:** Committed key hashes are what make results from different machines comparable without sharing keys (R-19). Official passes need a clear owner so no one double-pays or skips.
>
> **Rejected:** a shared team API key (secrets sharing, and against the "keys stay with their owner" spirit of CLAUDE.md rule 1); only the maintainer runs benchmarks (bottleneck).
>
> **Recommendation was:** refined (key hashes and pinned config in each committed summary).
>
> **Consequences:** P12-07 and P12-13; `CONTRIBUTING.md` explains the cost expectations.
>
> **Revisit if:** costs fall unevenly enough that contributors want a shared budget.
>
> **Confidence:** Medium · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Accepted as a **planned cost** only. The actual spend needs the maintainer's explicit approval at the start of the phase that incurs it, before any paid run or the code that triggers one (DS-21).
>
> **Audit resolution (2026-10-03):** "Clean config" = the frozen config hash from the tag (P22 Q1). With no human code review, **run journals** (synthetic and public data only) are committed alongside each official summary, and **CI re-scores them offline** with the deterministic scorer, so a summary can't be fabricated.
>
> **Audit resolution, round 2 (2026-10-03):** Which runs CI can re-score: **Q-B4** (recommended: dev runs only; holdout runs witnessed by a maintainer). Per-contributor spend allocations: **Q-B3**.
>
> **Audit resolution, round 3 (2026-10-03):** CI re-scoring of public dev tasks needs P12's `uv` reference environment and dataset download in CI (P12-02, P12-06). Re-scoring proves the summary matches the journal, not that the journal came from a real run; that residual risk is covered by human peer review (R3-18).

---

## L. Wrap-up

**Q45. Anything missing?** Anything you expected in a local AI data analyst that this roadmap
doesn't cover (e.g. SQL databases, text columns, geospatial data, a scheduled re-run)?
_Blocks: P10-01._

> **Recommendation (Claude):** Nothing to add for v1.0. Each of those is a clean v1.x phase on
> top of the sandbox and journal.

> **Answer Q45:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Add three missing pieces to the roadmap at sign-off: (1) **schema versioning and migrations for everything persisted in `userData`** (catalog, journals, lessons, notes, model store, settings), with a version field in every §12 schema from P11 and migration tests from P14; (2) **integrity of the bundled Python runtime**: hashes of Pyodide and its packages pinned at build time and verified at load (P13); (3) **model deprecation handling**: a startup check that pinned model ids still exist, with a clear message and fallback (P14, P23). SQL databases, text-heavy columns, geospatial data and scheduled runs stay v1.x.
>
> **Why:** A portfolio product that others install will be upgraded, and without versioned schemas the first update can break saved analyses (FR-19). The runtime bundle is a new supply-chain surface. Pinned model ids will retire during the project's life (R-12).
>
> **Rejected:** adding SQL databases or geospatial now (scope creep, R-13); leaving migrations to P23 (by then every phase has written unversioned data).
>
> **Recommendation was:** overturned (three gaps found).
>
> **Consequences:** propose at sign-off: P11-15 schema versioning, P13-09 runtime integrity, P14-10 model availability check; new NFRs for upgrade safety and supply-chain integrity.
>
> **Revisit if:** none; these are table stakes for an installable product.
>
> **Confidence:** High · **Needs maintainer:** no

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                                                                          | Recommendation | Confidence | Needs maintainer |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------- | ---------------- |
| Q1  | Data-literate analyst; every answer opens with a plain-language headline                                                     | refined        | Medium     | no               |
| Q2  | Code shown read-only; full output in the UI, capped output to the model                                                      | refined        | High       | no               |
| Q3  | Teaching notebooks: journal code + template explanations + one labelled analyst cell                                         | refined        | High       | no               |
| Q5  | Non-blocking, schema-validated, versioned plan before any `run_python`                                                       | refined        | High       | no               |
| Q6  | 20-min wall clock, 3 retries per error class, $1 analysis budget alongside the $2 conversation cap                           | refined        | High       | no               |
| Q7  | One model for all roles; per-role model field added now (`inherit`)                                                          | refined        | High       | no               |
| Q8  | Python on ≤ 50M cells and ≤ 200 columns; above that a DuckDB stratified sample with code-checked disclosure (audit)          | refined        | Medium     | no               |
| Q9  | Six packages + named dependencies; ≤ 200 MB installer growth; versions verified in P13-01                                    | refined        | Medium     | no               |
| Q10 | 120 s; memory 2 GB soft / 3 GB kill by the host; 8 KB to the model                                                           | **overturned** | Medium     | no               |
| Q11 | Vega-Lite in the app; Altair (same spec) in notebooks; no matplotlib                                                         | **overturned** | Medium     | no               |
| Q12 | Derived Parquet in userData, no approval, orphan-safe lineage, D-029 extended                                                | refined        | High       | no               |
| Q13 | Welch default, method chosen before testing, Holm per family, BH for screens, weights                                        | refined        | High       | no               |
| Q14 | Code flags causal wording; critic adjudicates; dismissals stay visible; M-03 from labelled flags only (audit)                | refined        | High       | no               |
| Q15 | Test scored once per analysis; data-level invariant; nested CV for small n; group- and time-aware folds (audit)              | **overturned** | High       | no               |
| Q16 | scikit-learn families only; XGBoost/LightGBM excluded from v1.0                                                              | refined        | High       | no               |
| Q17 | Tuning time-boxed (≤ 40% of wall clock) with successive halving; tune on ≤ 200k rows                                         | **overturned** | Medium     | no               |
| Q18 | Seasonal naive + ETS + SARIMA grid; fold rule for short series; interval coverage                                            | refined        | High       | no               |
| Q19 | 20 tasks: 12 dev / 8 holdout (budget arithmetic)                                                                             | **overturned** | Medium     | **yes**          |
| Q20 | Structured answer block; acceptable-set tolerances; interval-width rule                                                      | **overturned** | High       | no               |
| Q21 | Targets provisional; M-09 fixed (median ≤ $0.75 and ≤ 10% cap hits); freeze after re-baseline                                | refined        | Medium     | no               |
| Q22 | Code-only keys; pinned reference env; committed key hashes; two reviewers                                                    | refined        | High       | no               |
| Q23 | $15 per provider pass including the judge; phase-level budgets for P20/P22                                                   | kept           | High       | **yes**          |
| Q24 | Learn from failures, findings, and typed user corrections only; ratings for evaluation only                                  | refined        | High       | no               |
| Q25 | Typed lesson effects assigned by code; suppressive and unknown need approval; invariants untouchable                         | refined        | High       | no               |
| Q26 | Lessons promoted to global after 2 datasets; ≤ 8 lessons / 1.5k tokens                                                       | refined        | High       | no               |
| Q27 | Notes keyed by content hash; stale notes kept but excluded from context                                                      | refined        | High       | no               |
| Q28 | Build on one provider, exit on both; D-NNN waiver path                                                                       | kept           | High       | no               |
| Q29 | Revert the lockfile; pin the npm version after verifying which writes `libc`                                                 | refined        | High       | no               |
| Q30 | **Maintainer:** ~1 h/week on plans; PRs get agent review plus human peer review (DS-22)                                      | kept           | —          | decided          |
| Q31 | Unsigned v1.0 with SHA256SUMS; price cloud signing before P23                                                                | refined        | High       | **yes**          |
| Q32 | Keep analyses until deleted; per-kind storage view; cascade delete                                                           | refined        | High       | no               |
| Q33 | PA gates from the phase that introduces the role, permanently; PA-10/11 report-only                                          | refined        | High       | no               |
| Q34 | **Maintainer:** Claude Opus judges; a same-model run can't block (Q-C2)                                                      | refined        | —          | decided          |
| Q35 | 30 varied items, two labellers, ±1 ≥ 80% **and** weighted κ ≥ 0.6                                                            | **overturned** | Medium     | **yes**          |
| Q36 | **Maintainer:** option B. The judge blocks only when calibrated, a pre-set floor is breached, and a non-runner peer confirms | **overturned** | —          | decided          |
| Q37 | Budgets 16k lead / 8k specialists / 6k critic / 4k scout (cost arithmetic)                                                   | **overturned** | Medium     | no               |
| Q38 | DataDesk compacts on OpenAI; Claude relies on SDK compaction plus a code-built state card                                    | **overturned** | Medium     | no               |
| Q39 | Context checklist enforced by the PR template, review criterion 08 and output-size tests (audit)                             | refined        | High       | no               |
| Q40 | Maintainer decides; work proceeds except on one-way doors                                                                    | refined        | High       | **yes**          |
| Q41 | **Maintainer (latest):** agent review + human peer review; a human merges; agents never merge (DS-22, DS-23)                 | **overturned** | —          | decided          |
| Q42 | Squash item branches into the phase branch; one merge-commit phase PR                                                        | refined        | High       | no               |
| Q43 | Issues generated from `ROADMAP.md` by script; board optional                                                                 | refined        | High       | no               |
| Q44 | Own keys; official pass by the exit's claimant; committed summaries with key hashes                                          | refined        | Medium     | **yes**          |
| Q45 | Add schema migrations, runtime integrity, model-deprecation handling                                                         | **overturned** | High       | no               |

**Totals:** 44 answered · 4 kept · 30 refined · 10 overturned · 8 need the maintainer.

**Overturned recommendations:**

- Q10: a 20 KB output per execution would use a third of a specialist's context budget; cut to 8 KB.
- Q11: Altair reproduces the app's Vega-Lite chart exactly; matplotlib would be a second chart system.
- Q15: "once per model family" lets the agent pick the best of three on the test set (leakage).
- Q17: 300 fits on 1M rows in single-threaded wasm can't fit a 20-minute cap; tuning is time-boxed instead.
- Q19: 16 dev tasks at ~$1 plus the judge exceeds the $15 pass.
- Q20: a flat 1% tolerance and CI overlap are unfair or gameable; prose parsing would put an LLM into scoring.
- Q35: "within ±1" on a 5-point scale is largely chance; weighted κ added.
- Q37: a 40k lead context × ~30 turns is about $3.60 per analysis against the $1 budget.
- Q38: on Claude the Agent SDK's CLI owns the transcript, so DataDesk can't compact it directly.
- Q45: upgrades, the runtime supply chain and model retirement were unplanned.

**For the maintainer:** all answered on 2026-10-03 (see the Maintainer decision lines). Money items are planned costs, approved per phase (DS-21). The blind audit raised six new questions (Q-A1..Q-A6), listed in `planning/pending.md` and `P10-audit.md`.

**Cross-question changes made in the consistency pass:**

- Q10 output cap (8 KB ≈ 2k tokens) aligned to the Q37 budgets (specialist 8k).
- Q26 working-set cap (1.5k tokens, ≤ 8 lessons) aligned to Q37.
- Q17's tuning time box derived from Q6's 20-minute cap.
- Q19 task count drives Q23 (budget) and Q35 (calibration items drawn from 12 dev tasks × 2 providers plus ablations).
- Q15 changes roadmap wording ("test-set lock … per model family" in §4 and PA-06) at sign-off.
- Q21's M-09 rewrite reflects Q6's hard cap.

**Facts verified:**

- In code: `DEFAULT_AGENT_SETTINGS` ($2 per conversation, 30 turns per message, `sonnet`, `gpt-5.4-mini`) in `src/shared/agent.ts`.
- In code: `model: 'inherit'` in `src/main/agent/claude/subagents.ts`.
- In code: `DATADESK_MAX_FILE_BYTES` 2 GB, `DATADESK_MAX_ROWS` 500 and `DATADESK_QUERY_TIMEOUT_MS` 15 s in `src/mcp-server/config.ts`.
- In code: `package.json` pins Node only, and CI uses Node 24.
- In code: the OpenAI path replays history itself (`docs/ARCHITECTURE.md`).
- **Not verified, routed:** the Pyodide package list and versions, including pyarrow and `HalvingRandomSearchCV` (P13-01).
- **Not verified, routed:** judge model ids and temperature support (P12-10).
- **Not verified, routed:** Claude per-token prices (P11-11).
- **Not verified, routed:** Agent SDK compaction controls (P11-12).
- **Not verified, routed:** the npm version that writes `libc` lockfile fields (P10-07).
- **Not verified, routed:** branch protection availability for the repository's GitHub plan (P10-08).
