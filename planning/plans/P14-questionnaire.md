# P14 Questionnaire: Decisions Needed Before `datadesk-ds`, Journal & Provenance

| Field           | Value                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle the tool surface, outputs, persistence and UI of the trust layer                                                           |
| Already decided | D-030..D-045 (draft, `planning/decisions-draft.md`); P10 Q5, Q6, Q10, Q37, Q38; P11 Q1–Q4, Q7–Q9, Q11 (audited); P13 Q6 (audited) |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation      |

---

## A. Tools

**Q1. Which tools does `datadesk-ds` expose in P14?**
_Blocks: P14-01._

> **Recommendation (Claude):** `save_plan`, `run_python(code, inputs)`, `get_output(id, offset,
limit)` and `restart_kernel`.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The four tools, with `run_python(code, inputs)` where each input is `{ dataset, select? }`. `select` is an optional read-only SELECT (validated by the D-009 statement-type guard) for filtering, pre-aggregation or the stratified sample required above 1M rows (P10 Q8). `get_output(id, path?, offset, limit)` returns slices within the 8 KB cap. No tool writes files in P14 (`save_derived_dataset` is P15).
>
> **Why:** Without `select`, the only way to shrink a large table would be loading it all into Python first, the exact failure P10 Q8 forbids. Reusing the D-009 guard means no new SQL surface. Leaving file writes out keeps P14's threat surface to execution only.
>
> **Rejected:** a separate `snapshot_dataset` tool (an extra round trip for every input); free SQL in `inputs` without the guard (a write and escape surface).
>
> **Recommendation was:** refined (`select` per input, `path` addressing in `get_output`).
>
> **Consequences:** P14-01; snapshots keyed by query + source hashes (P11 Q2).
>
> **Revisit if:** agents struggle to express inputs; then add examples to the skill, not more tools.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The sample threshold follows **D-031** (50M cells, 200 columns), enforced in main from the snapshot's Parquet metadata. Sources are derived by **parsing the `select`**, so a JOIN to another file shows up in the cache key and the recorded inputs; sampling must be seeded (`REPEATABLE`); cache keys include the split id. `get_output` debits the same row budget as `run_python`.
>
> **Audit resolution, round 2 (2026-10-03):** SQL results are journalled as `sql` executions with output ids, so they're citable. Sources come from the bound plan with views expanded (API verified by docs-researcher); cache keys include the sampling seed; the stratification key is the plan's grouping column or a simple seeded sample, disclosed in `sampling`.
>
> **Audit resolution, round 3 (2026-10-03):** The source-parsing API is **not yet verified** (the round-2 line overstated it); it stays a docs-researcher item, as does DuckDB's sampling determinism with several threads (`threads=1` until verified). D-031 sampling is decided from the source's counts **before** `COPY`, inside the `COPY`. SQL constants are folded with `json_serialize_sql`, so `SELECT 42.7` can't launder a number.

**Q2. How are random seeds handled?**
_Blocks: P14-01, NFR-05._

> **Recommendation (Claude):** The host sets one seed per analysis (NumPy and Python `random`)
> before each execution and records it; the agent can pass `random_state` explicitly.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** One **analysis seed**, plus a **per-execution seed = hash(analysis seed, execution seq)**. The host sets NumPy's and Python's global RNGs to it before each execution and records it. The ML and stats skills require an explicit `random_state` anyway. The notebook export sets the recorded seed at the top of each cell.
>
> **Why:** Re-seeding to the **same** seed before every execution makes successive random operations repeat the same sequence: two bootstraps would draw identical resamples, a silent statistical error. Deriving per-execution seeds keeps every cell reproducible while independent.
>
> **Rejected:** the same seed before every execution (correlated randomness); no host seeding (irreproducible when the agent forgets `random_state`).
>
> **Recommendation was:** overturned (per-execution derived seeds).
>
> **Consequences:** P14-01; P21-01 export inserts the seed lines; an M-05 test with two bootstraps checks the draws differ and replay matches (a P21-01 fixture).
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The per-execution seed is the first 4 bytes of SHA-256(analysis seed ‖ seq). It also seeds `np.random.default_rng()` called without a seed and DuckDB's `setseed`; replays reuse recorded seeds.

**Q3. What does the model receive from an execution?**
_Blocks: P14-01, P14-09._

> **Recommendation (Claude):** Captured stdout (capped) plus a `result` variable the code sets,
> serialised: scalars as is, DataFrames as shape plus the first 20 rows, everything else by
> output id.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** stdout capped at 2 KB, plus `result` serialised by the host. Scalars come back as is; DataFrames as shape, dtypes and the first 20 rows × first 12 columns, noting the rest. Every leaf value is **addressable** as `out:<id>#<path>` (e.g. `out:7f3a#mean`, `out:7f3a#rows[3].price`), so citations can point at the exact number. The total is shaped to 8 KB by the context builder, and anything cut is fetchable by id.
>
> **Why:** A 20 × 50 table alone can exceed 8 KB, so columns must be capped too. Addressable leaves make P11 Q4's citation check precise: it verifies the cited value, not "some number somewhere in an output".
>
> **Rejected:** printing whole frames (blows the budget, and against DS-09 above 20 rows); output-level citations only (ambiguous matches).
>
> **Recommendation was:** refined (column cap and addressable leaves).
>
> **Consequences:** P14-01 serialiser; P14-03 checker resolves paths; the `delegation-briefs` and lead prompts teach the citation form.
>
> **Revisit if:** agents often fetch the same cut columns (then raise the column cap).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Shaping moves out of the kernel: the kernel returns a bounded raw payload and the controller's **egress shaper** counts row-equivalents structurally (records in lists and dicts, string lines, stdout lines), so a dict of rows or a CSV string can't bypass the cap. All D-033 caps apply: 20 rows per call across result, stdout and `get_output`; 200 per analysis; 2 KB stdout; 1 KB tracebacks; 200-character cells; 48 KB per analysis.
>
> **Audit resolution, round 2 (2026-10-03):** Counting rules close the remaining bypasses: a string leaf counts `max(lines, ceil(chars/200))`; every element of any sequence or mapping counts; stdout lines are truncated at 200 characters; traceback, stderr and DuckDB error lines are counted. `get_output` refuses ids from another analysis.
>
> **Audit resolution, round 3 (2026-10-03):** Superseding round 2's "every element counts": a **row** is a record in a table-like container; a mapping of named scalars (a dict of statistics) is one aggregate, so aggregates don't exhaust the budget (Q-Q1). The **48 KB byte cap** is the real bound on packed strings, recorded as a residual in R-14. `datadesk-mcp` tools get their model-bound output from the shaper.

**Q4. How is "plan before execution" enforced?**
_Blocks: P14-01, FR-01._

> **Recommendation (Claude):** `run_python` refuses with a clear error until `save_plan` has
> stored a valid plan for the analysis.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended. `run_python` refuses until a zod-valid plan exists, and the error names the missing fields. A later `save_plan` creates a new **revision** (journalled with a reason) instead of overwriting. Each execution records the plan revision it ran under.
>
> **Why:** Revisions let the critic and the scorer see whether the agent changed its plan after seeing results, which is a p-hacking signal (P16-05) a silent overwrite would hide.
>
> **Rejected:** a soft warning instead of a refusal (the plan is then skipped under budget pressure).
>
> **Recommendation was:** refined (revisions with reasons, linked to executions).
>
> **Consequences:** §12.1 plan revisions (from P10 Q5); P19 can use the revision trail as a method check.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The plan guard lives in the controller, not the relay. Fields that grant authority (`direction`, `target`, split, declared constants) are **immutable after the first data-reading execution**; a revision may add questions only (Q-L7). Declared constants come from an enumerated policy schema.
>
> **Audit resolution, round 2 (2026-10-03):** Fields lock at the first **data-reading call**, not execution. A direction declared after any read of the outcome's dataset is ignored (two-sided); for predictive plans, pre-plan reads of the split source are disclosed and counted as a lock violation on the bench (Q-N1). Code chooses temporal vs random at `save_plan` (D-035, Q-N6). Post-read questions are exploratory. Plan constants are limited to D-035's values unless the user quoted another (Q-N2).
>
> **Audit resolution, round 3 (2026-10-03):** Authority fields are **set once at the first `save_plan`**, never changed; only **row-returning** pre-plan reads of the split source count as lock violations (schema reads excluded, Q-Q3). Questions in **any** plan written after a row-returning read of the outcome are exploratory unless the user named them (Q-Q4). Forecast plans are always temporal and refused without a detectable time column; one detector serves app and bench (Q-Q5).

## B. Persistence and Budget

**Q5. What does reopening a saved analysis restore?**
_Blocks: P14-06, FR-19._

> **Recommendation (Claude):** Use the Agent SDK's session resume for Claude and the replayed
> history for OpenAI, so the conversation continues where it stopped.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Reopen shows the analysis read-only from the journal: plan, execution cells, artifacts and the final answers. **Continue** starts a **new session on either provider** seeded with the code-built state card (P10 Q38). The kernel's state is rebuilt by **replaying the journal's execution sequence on demand**, before the first new execution, with progress shown and a time limit. If the replay fails, the agent is told through the state card to start fresh.
>
> **Why:** SDK session resume depends on transcript files inside the isolated CLI config dir, replays the whole transcript (cost) and exists only on Claude, so the two providers would diverge (NFR-14). The state card is cheaper and symmetric. The stateful kernel (P13 Q6) means "continue" also needs Python state, which only a journal replay can rebuild faithfully.
>
> **Rejected:** SDK resume plus OpenAI history replay (asymmetric, costly, and still no kernel state); continuing without kernel state (the agent's variables vanish silently).
>
> **Recommendation was:** overturned (state card plus on-demand kernel replay).
>
> **Consequences:** P14-06; replay reuses P21-01's exact-sequence logic early; an e2e test reopens and continues.
>
> **Revisit if:** replay times exceed a minute for typical analyses (then offer "continue without state").
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** **Continue reopens the same analysis** with its spent budgets, split record and test lock, on a fresh kernel, and the state card says so; kernel replay is deferred to P21 (it can't reproduce interrupted cells, per the P13 audit). Reopen also shows the **transcript** from journal entries, meeting FR-19 (Q-L1, Q-L2). An exclusive lock stops two Continues at once.
>
> **Audit resolution, round 2 (2026-10-03):** A "New analysis" action is built here; kernel replay moves to P21 (P21-06 after the P21 audit). The data-read flag persists per conversation in the journal and survives Continue (Q-N5).
>
> **Audit resolution, round 3 (2026-10-03):** `second_opinion` and `search_columns` are gated on the **data-read flag**, held in a conversation record that every new analysis in the conversation inherits (Q-Q6).

**Q8. Who writes the partial report when a budget stops a run?**
_Blocks: P14-07, NFR-04._

> **Recommendation (Claude):** Code, from a template filled from the journal: plan, completed
> steps, provenanced results so far, and what was not done.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, by code with no model call. It states the stop reason (budget, wall clock, retry class, user stop), the plan, completed steps, provenanced results so far (with marks), unanswered plan questions, and the spend. It is saved like any report.
>
> **Why:** At a budget stop there's no budget left for an LLM call, and a code template can't invent results. The user still gets value for the money spent.
>
> **Rejected:** an LLM-written summary (exceeds the cap, and could add unprovenanced claims).
>
> **Recommendation was:** kept (stop reason and spend added).
>
> **Consequences:** P14-07; a test per stop reason.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Every stop gets a code-built report: budget, active time, turns, the $2 conversation cap, retry class, user stop, provider outage, ENOSPC, `host_crashed`/`unavailable` and `compute_busy` past the queue, each with a test. The report is written through `datadesk-mcp`'s artifact writer, so there's one writer.
>
> **Audit resolution, round 2 (2026-10-03):** Main is the **single writer of the artifact store**: reports, charts and partial reports relay to it, so a partial report survives the loss of `datadesk-mcp` and waits in memory under ENOSPC (Q-N3).
>
> **Audit resolution, round 3 (2026-10-03):** Main as the single artifact writer reverses part of D-016; a superseding D-NNN is recorded at P14 sign-off.

## C. UI

**Q6. Where do execution cells appear?**
_Blocks: P14-05._

> **Recommendation (Claude):** In each turn's steps (Results-first layout) and in the timeline
> drawer (Chat-first), code collapsed by default.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, and also per lane in Compare view. Each cell shows status, duration, inputs (dataset + select), seed and a link to "outputs" (full local output, P10 Q2). Failed cells are shown with their error class, not hidden.
>
> **Why:** Showing failures is honest and teaches; hiding them would make a 20-cell analysis look like a 3-cell one. Compare view needs cells to compare _how_ the two providers worked, not just their answers.
>
> **Rejected:** a separate "code" tab (breaks the turn context); hiding failed cells (misleading).
>
> **Recommendation was:** refined (metadata, failures shown, Compare view).
>
> **Consequences:** P14-05; component tests with a fake journal.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no

**Q7. How are provenance marks shown?**
_Blocks: P14-05, FR-10._

> **Recommendation (Claude):** Verified numbers get a subtle dotted underline that opens the
> source output; unverified numbers get a warning marker with "not traced to a computation".

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Verified numbers render normally, but are keyboard-focusable and hoverable, opening their source value and output. Screen readers get the text "traced to output …". Unverified numbers get a visible ⚠ icon **with a text label**. Each answer shows a badge such as "14 of 14 numbers traced".
>
> **Why:** Underlining every verified number clutters text that is mostly numbers, and colour or underline alone fails accessibility (the Phase 9 UI is ARIA-careful). The badge gives the trust summary at a glance.
>
> **Rejected:** underline every number (noise); marking only unverified numbers with no summary (trust isn't visible).
>
> **Recommendation was:** refined (accessible marks, per-answer badge).
>
> **Consequences:** P14-05; `ChatMarkdown` renders citation markers; accessibility tests.
>
> **Revisit if:** usability feedback says the hover is undiscoverable.
>
> **Confidence:** Medium · **Needs maintainer:** no

**Q10. Is the structured answer block produced only in benchmark mode?**
_Blocks: P14-05, P12-03._

> **Recommendation (Claude):** Yes, only in benchmark mode, so normal answers stay prose.

> **Answer Q10:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **Always** produce a structured **Key results** block (JSON validated by zod, each value cited), rendered in the UI as a table under the answer. In benchmark mode the task only adds the required question ids as keys, so the scorer reads the same block users see.
>
> **Why:** If the block exists only in benchmark mode, the benchmark measures a prompt users never run, so the scores don't describe the product. Users also benefit from a cited summary table, and the provenance badge (Q7) counts it.
>
> **Rejected:** bench-only blocks (measurement drift); prose-only answers (unscorable without an LLM, P10 Q20).
>
> **Recommendation was:** overturned (always on; bench adds ids only).
>
> **Consequences:** P14-05; P12-03's task format maps to the block keys; P21-03's report includes it.
>
> **Revisit if:** key results feel forced for exploratory questions (then allow an empty block with a reason).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The scorer uses the value **resolved by code from each citation**; an uncited or mismatched entry counts as unanswered, so M-01 doesn't grade the agent's transcription. The block was already required by roadmap §12.12 and P12-03, so this answer changes nothing upstream.
>
> **Audit resolution, round 2 (2026-10-03):** P12 is amended (P12-06): numeric answers are scored on code-resolved citation values, categorical answers from enum fields, and oracle passes write their outputs as journal entries (Q-N4).

## D. Models

**Q9. How is a retired model id handled (P14-10)?**
_Blocks: P14-10._

> **Recommendation (Claude):** On session start, list the provider's models and warn if the
> configured model is missing.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** No model-listing call. Claude defaults to **aliases** (`sonnet`, today's default), which never retire as names. For a pinned id on either provider, the "model not found" error is mapped to a clear message with a one-click "switch to the default" action, and the OpenAI model list (`OPENAI_MODELS`) is reviewed at every release.
>
> **Why:** Listing models at every session start is an extra network call and depends on a listing API, for an event that happens a few times a year. Aliases already solve the common case, and good error mapping solves the rest.
>
> **Rejected:** listing models at startup (cost and an extra dependency); doing nothing (a cryptic failure when a model retires).
>
> **Recommendation was:** overturned (error mapping plus aliases instead of listing).
>
> **Consequences:** P14-10; a test with a fake 404 for both providers.
>
> **Revisit if:** a provider retires aliases.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Removing an id from `OPENAI_MODELS` ships with a settings migration (NFR-18). The resolved snapshot id behind each alias is journalled per message, for P12's comparability and D-038's `same-model` rule.
>
> **Audit resolution, round 2 (2026-10-03):** The meter prices by the **resolved snapshot id**, since an alias can move to a snapshot with a different price. SDK error shapes for "model not found" are a docs-researcher item.

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                            | Recommendation | Confidence | Needs maintainer |
| --- | ------------------------------------------------------------------------------ | -------------- | ---------- | ---------------- |
| Q1  | Four tools; inputs take an optional guarded `select`; addressable `get_output` | refined        | High       | no               |
| Q2  | Per-execution seeds derived from the analysis seed                             | **overturned** | High       | no               |
| Q3  | stdout 2 KB + `result` with 20 rows × 12 columns; addressable leaves           | refined        | High       | no               |
| Q4  | Plan refusal; revisions with reasons linked to executions                      | refined        | High       | no               |
| Q5  | Reopen read-only; continue via state card + on-demand kernel replay            | **overturned** | Medium     | no               |
| Q8  | Code-built partial report with stop reason and spend                           | kept           | High       | no               |
| Q6  | Cells with metadata, failures shown, also in Compare view                      | refined        | High       | no               |
| Q7  | Accessible marks; ⚠ with a label; "n of n traced" badge                        | refined        | Medium     | no               |
| Q10 | Key-results block always on; bench adds ids only                               | **overturned** | High       | no               |
| Q9  | Aliases + mapped "model not found" errors; no listing call                     | **overturned** | High       | no               |

**Totals:** 10 answered · 1 kept · 5 refined · 4 overturned · 0 need the maintainer.

**Overturned recommendations:**

- Q2: re-seeding to one seed before every execution makes random operations repeat.
- Q5: SDK resume is Claude-only, costly, and doesn't restore Python state.
- Q10: a bench-only answer block means the benchmark measures a prompt users never run.
- Q9: listing models each session is a recurring call for a rare event.

**For the maintainer:** none in this phase.

**Cross-question changes made in the consistency pass:**

- Q3's addressable leaves are what Q7's marks and P11 Q4's checker resolve.
- Q5's replay reuses the exact-sequence logic from P13 Q6 and P21-01. **Superseded by the P14 audit:** replay is deferred to P21; Continue reopens the same analysis on a fresh kernel.
- Q10 changes P12-03's task format to map onto the key-results block.

**Facts verified:**

- In code: `model: 'sonnet'` alias default in `src/shared/agent.ts`.
- **To verify:** SDK error shapes for an unknown model (P14-10).
