# P15 Questionnaire: Decisions Needed Before Data Wrangling

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle how derived datasets are made, checked and shown                                                                      |
| Already decided | P10 Q8, Q12, Q27, Q33; P14 Q1, Q3; D-030..D-045 (draft, `planning/decisions-draft.md`); P11–P14 as audited                   |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation |

---

**Q1. What does `save_derived_dataset` take?**
_Blocks: P15-01._

> **Recommendation (Claude):** `save_derived_dataset(variable, name, description)`: the name of a
> pandas DataFrame in the kernel, written as Parquet.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** `save_derived_dataset(variable, name, description)`, with validation before writing: string and unique column names; supported dtypes (object columns with mixed types are converted to string, and a finding is journalled); a row and size cap (Q7). The writer chain is decided by P13's package result: pyarrow, otherwise fastparquet. If neither exists, P15 is blocked until a P13 follow-up resolves it, never CSV. Writes are atomic (`.part` → rename, as for Hugging Face downloads, D-020).
>
> **Why:** Parquet keeps types; CSV would silently turn dates and categories into strings and break lineage reproducibility. Validating first stops a corrupt dataset from entering the catalog, where every later analysis would trust it.
>
> **Rejected:** a CSV fallback (type loss); writing without validation (corrupt catalog entries).
>
> **Recommendation was:** refined (validation, writer chain, atomicity).
>
> **Consequences:** P15-01 depends on the P13-01 package findings; tests for each validation error.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The writer chain is fixed: the kernel streams bytes on the artifact channel, **main** writes and hashes them, the keyless **UI instance of `datadesk-mcp`** validates, rewrites with `COPY` and registers; the journal is the authoritative lineage (Q-O4, Q-O5). Mixed-type columns are **refused**, not converted. There is no row cap, only the 2 GB size cap. Names follow the existing regex; descriptions are capped and fenced. Parents are the union of parsed snapshot sources since the last kernel restart, with hashes of the bytes read.
>
> **Audit resolution, round 2 (2026-10-03):** Superseding round 1's writer chain: main stages the bytes outside `derived/`; a **dedicated short-lived keyless rewriter child** writes the only file in `derived/<uuid>/` (explicit schema, so categoricals and time zones survive); main hashes **that final file** (Q-T2). Registration is UI-only and uuid-addressed, by a D-NNN amending D-010 and D-020 (Q-T8). The Parquet writer in the rewriter is a docs-researcher item.
>
> **Audit resolution, round 3 (2026-10-03):** The rewriter is a named child (`src/main/derived/rewriter/`) with an explicit env, a zod result and exact-file reads on the stage **and the parents' snapshots**; its key-cardinality check is code-derived from shared columns (Q-X2). Type changes from the rewrite are recorded, not claimed away (to verify with `KV_METADATA`). The UI instance doesn't validate; it registers and writes later hashes.

**Q2. How are derived datasets named?**
_Blocks: P15-01._

> **Recommendation (Claude):** A `d_` prefix plus the agent's name, unique in the catalog.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The agent proposes a display name. Code derives the SQL view name with the **same rules as `register_dataset`**, and adds a numeric suffix on collision instead of overwriting. The `d_` prefix is dropped: the "derived" flag lives in the catalog and the UI badge, not in the name.
>
> **Why:** View names have to pass the existing identifier rules (datasets are views named after themselves, D-002), so one rule set avoids a second validator. A name prefix duplicates the catalog flag and makes renaming awkward. Never overwriting means a later step can't silently replace data an earlier result was computed on.
>
> **Rejected:** a `d_` prefix (redundant with the flag); overwrite on collision (invalidates provenance).
>
> **Recommendation was:** overturned (flag instead of prefix; collision suffix).
>
> **Consequences:** P15-01 reuses the name validator.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no

**Q3. How detailed is lineage?**
_Blocks: P15-02, EC15-2._

> **Recommendation (Claude):** Dataset level: parents with their hashes, and the producing
> execution with its code. Column-level lineage later.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended (dataset level). The derived dataset's own content hash is also stored, so the scorer and notes (P10 Q27) can identify it, and the producing execution's plan revision (P14 Q4) is recorded too.
>
> **Why:** Dataset-level lineage plus the exact code is enough to reproduce and audit. Column-level lineage would need parsing arbitrary pandas, a large effort with fragile results.
>
> **Rejected:** column-level lineage in v1.0 (cost far beyond its value).
>
> **Recommendation was:** kept (own hash and plan revision added).
>
> **Consequences:** §12.3 fields; EC15-2 checks every field is present.
>
> **Revisit if:** users ask "where did this column come from" often.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Lineage records every execution since the last restart (not one), parents from parsed sources, `sampled`, `fitted_on_all_rows` and an optional `parent_model_id`. The field is named `parents` everywhere (§12.3). EC15-2 checks correctness (parents and hashes recomputed), not field presence.
>
> **Audit resolution, round 3 (2026-10-03):** Parents carry the `split_id` of their snapshot; a train-only derived dataset is exempt from hiding only within the same split record. EC15-2 checks that the task's expected parents are a **subset** of the recorded parents, with extras reported.

**Q4. What does the `data-cleaning` skill cover?**
_Blocks: P15-03._

> **Recommendation (Claude):** Missingness strategies, dtype fixes, deduplication, outliers,
> categorical encoding, joins, reshaping, dates and time zones, text normalisation.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The recommended topics plus three rules the skill states as non-negotiable: (1) **every filter, dedup or join reports row counts before and after**; (2) imputation is fitted on training rows only once a split exists (it defers to the ML skill); (3) locale traps: decimal commas, day-first dates, and time zones (stored in UTC, displayed in local time). Each topic has a short worked example built on `bench`-style synthetic data, never on a benchmark task.
>
> **Why:** The count rule is what makes silent row loss visible to both the user and the Q5 checks. Locale traps are the most common real-world cleaning bugs. Examples from benchmark tasks would leak the benchmark into the prompt (R-08).
>
> **Rejected:** a topic list without rules (the agent "covers" topics and still drops rows silently).
>
> **Recommendation was:** refined (three rules, examples kept off the benchmark).
>
> **Consequences:** P15-03; the context-engineering checklist applies (P10 Q39).
>
> **Revisit if:** benchmark failures cluster on one topic.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Naive timestamps stay naive unless the source declares a zone; any conversion is recorded. In predictive analyses, cleaning that must reach test rows is written as pipeline steps (enforced in P17, Q-O3).

**Q5. How are wrangling mistakes detected?**
_Blocks: P15-04, PA-04._

> **Recommendation (Claude):** Checks run on the saved derived dataset: compare its row count and
> keys to its parents, and flag a large difference.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **Instrument the kernel.** The host wraps the key pandas operations (`merge`/`join`, `dropna`, `drop_duplicates`, `astype`/`to_numeric`/`to_datetime`, `fillna`, `query`/boolean filters on `DataFrame.__getitem__`) to log row counts, key uniqueness and NaN-introduction counts per execution into the journal. Code then raises findings for: join explosion (output rows > max input rows unless the plan declares one-to-many); non-unique join keys; row loss not mentioned in the answer or plan; coercion creating NaN in > 1% of a column; imputation statistics computed before a split exists. The recommended "compare the saved dataset to its parents" check stays as a second layer.
>
> **Why:** Comparing only the final saved dataset misses everything done in intermediate frames that are never saved, which is where most wrangling bugs live. Instrumentation sees each operation as it happens, and stays deterministic code ("code, not the agent").
>
> **Rejected:** final-dataset comparison only (misses intermediate steps); parsing the agent's code (fragile).
>
> **Recommendation was:** overturned (instrumentation of operations, not just final comparison).
>
> **Consequences:** P15-04 adds `instrumentation.py`, loaded in the kernel before each analysis; the escape suite checks it can't be used to reach the host; operations outside pandas aren't seen (a documented limit; the critic covers them).
>
> **Revisit if:** instrumentation slows executions by more than 10% on 1M rows.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded by roadmap §8.3 principle 7: kernel instrumentation is **advisory** (`source: kernel`) and never feeds PA-04, trap detections or lessons (Q-O1). Scored checks run in main from artifact facts: silent row loss (no matching `issues[]` entry, not prose), join explosion with **no plan opt-out**, and the `sampled` disclosure. Imputation-before-split fires only in predictive plans.
>
> **Audit resolution, round 2 (2026-10-03):** Row-change disclosure moves out of `issues[]` into a per-save `row_change` field checked against the rewriter's counts; join explosion uses key cardinality, so correct melts and one-to-many joins don't fire (Q-T5). The `advisory` field is UI-only and never reaches the model (Q-T7).
>
> **Audit resolution, round 3 (2026-10-03):** PA-04 is scored against the **expected row count in the code-generated answer key**, not the agent's own `expected_rows` (Q-X1); `row_change` is shown in the lineage UI.

**Q6. How is content hashing introduced for existing datasets?**
_Blocks: P15-06._

> **Recommendation (Claude):** Hash every dataset in the catalog at the first start after the
> update.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **Lazy**: compute a dataset's hash on first use after the update, stream it with progress, and mark the entry "hashing…" until it's done. New registrations hash at registration. On every session start, compare size + mtime cheaply and re-hash only on a change, which also fixes stale row counts (audit A-10).
>
> **Why:** Hashing every dataset at first launch could take minutes for users with many large files, and would block the app on an update. Lazy hashing spreads that cost over real use. The size + mtime check makes change detection cheap.
>
> **Rejected:** hashing everything at first start (blocking); hashing only new datasets (existing ones never get notes or lessons keyed correctly).
>
> **Recommendation was:** overturned (lazy migration with change detection).
>
> **Consequences:** catalog schema v2 with a fixture-tested migration (P11 Q8).
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Parent hashes come from the bytes read at snapshot time, so same-size or mtime-preserving edits can't make lineage or stale notes wrong (Q-O7). A call needing a pending hash waits ≤ 30 s, then fails with `hash_pending`.
>
> **Audit resolution, round 2 (2026-10-03):** "Bytes read" can't be hashed when DuckDB opens the file itself, so main hashes the source **before and after** each snapshot and refuses on a mismatch; a snapshot waits up to 5 minutes for a pending hash, and `hash_pending` doesn't count toward retries (Q-T9).
>
> **Audit resolution, round 3 (2026-10-03):** A snapshot's hash wait counts toward active time, not the 120 s execution limit; a cache hit with unchanged size and mtime skips the re-hash. Summary row for Q6 is superseded (hashing before and after each snapshot).

**Q7. How much derived data is allowed?**
_Blocks: P15-01._

> **Recommendation (Claude):** 2 GB per analysis; a warning above 10 GB in total.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended: 2 GB per analysis (`save_derived_dataset` refuses above it, with a clear error the agent can act on), and a UI warning above 10 GB in total, pointing at the storage view. Both are settings.
>
> **Why:** The per-analysis cap bounds what a looping autonomous run can write (the disk-exhaustion attack in the P11 threat model). The total warning respects that this is the user's data.
>
> **Rejected:** no cap (a runaway loop fills the disk); a hard global cap (deletes or blocks the user's own work).
>
> **Recommendation was:** kept.
>
> **Consequences:** P15-01; a test that the cap refuses cleanly.
>
> **Revisit if:** typical analyses approach 2 GB.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The 2 GB per-analysis cap covers derived files and snapshots together.

**Q8. Are derived datasets visible to later analyses?**
_Blocks: P15-05._

> **Recommendation (Claude):** Yes, like any dataset, marked as derived.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Yes, marked as derived, with the producing analysis named. `list_datasets` shows a `derived_from` field so the agent knows a dataset isn't raw.
>
> **Why:** Reusing cleaned data across analyses is the point of saving it. The marker stops the agent from treating a cleaned or sampled table as ground truth without saying so.
>
> **Rejected:** hiding derived data from other analyses (forces re-cleaning, wastes budget).
>
> **Recommendation was:** kept (the `derived_from` field added).
>
> **Consequences:** P15-05; the `list_datasets` output schema bumps its version.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: derived datasets are **private to their conversation and lane** until the user marks them "Keep" (Q-O6). Grants are exact-file (D-009), and after a split every lineage descendant of the split source is **hidden entirely** in both DuckDBs, since no row mapping exists (Q-O2).
>
> **Audit resolution, round 2 (2026-10-03):** Agent instances pull their visibility set from the controller before every build and fail closed without it (Q-T3). "Keep" copies a frozen lineage record into the catalog, so kept data survives analysis deletion; reconcile never removes catalog entries (Q-T4). Un-kept data is deleted with its conversation or after 30 days.
>
> **Audit resolution, round 3 (2026-10-03):** Hiding walks journal and frozen catalog lineage transitively across analyses (Q-X3); the visibility set also filters `list_datasets` and `get_schema`. Reconcile is computed by main from the journals and re-registers committed files (Q-X6). Retention follows D-043, with no time-based deletion (Q-X5). The refusal covers forecast plans too (Q-X4).

**Q9. Which tools does the wrangler get?**
_Blocks: P15-03._

> **Recommendation (Claude):** `run_python`, `save_derived_dataset`, `get_schema`, `profile_column`,
> `sample_rows`, `get_output`. No charts, no registration.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, plus `make_split` is **not** granted (splits belong to the modeler, P17), and the wrangler's context contract (8k) includes the profile summary in its working set.
>
> **Why:** A wrangler that can split data could create train/test partitions outside the test-lock tool, a leakage path. Keeping splits with one role keeps the test lock enforceable.
>
> **Rejected:** giving the wrangler charts (out of scope) or splits (leakage risk).
>
> **Recommendation was:** refined (split excluded explicitly; working set named).
>
> **Consequences:** P15-03 scope-table row; the parity test covers it.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no

**Q10. What are this phase's gate values?**
_Blocks: EC15-3._

> **Recommendation (Claude):** PA-03 ≥ 60% and PA-04 = 0 on dev.

> **Answer Q10:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** PA-03 ≥ 60% (the MVP value of M-02, so the profiler gate matches the run-level gate); **PA-04 = 0**, measured from Q5's instrumentation (a silent row loss or broken lineage in any dev task fails the gate). The inherited gates continue: M-04 = 0, PA-02 = 100%, parity, M-11 = M-12 = 0.
>
> **Why:** PA-04 is a correctness bar, not a quality aspiration, so zero is right; and it is measurable only because Q5 makes row changes observable.
>
> **Rejected:** a lenient PA-04 (silent data loss is the worst wrangling failure).
>
> **Recommendation was:** kept (the measurement source named).
>
> **Consequences:** EC15-3.
>
> **Revisit if:** instrumentation false positives make PA-04 flaky (then tighten the detection, not the gate).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** PA-04 is measured in main on dev tasks whose task file requires a derived dataset (0/0 fails); PA-03 counts the profiler role's structured `issues[]`; both per provider. Inherited gates include M-19 ≥ 90% and PA-09's unprovenanced half. The dev set stays the fixed 12 tasks (D-036); spend ≈ $24 (Q-O8).
>
> **Audit resolution, round 2 (2026-10-03):** PA-04 runs on dev tasks flagged `requires_derived_dataset` (a P12-03 field added here, ≥ 2 tasks). PA-03 counts the profiler's structured `profile_issues[]` (Q-T6). A predictive plan on an all-rows derived dataset is refused with an actionable error, not swapped for its lineage root (Q-T1).
>
> **Audit resolution, round 3 (2026-10-03):** PA-03 comes from a `report_profile` tool on both providers, capped at 12 entries, schema in P11-09, matching category and subject, with precision reported beside it (Q-X7).

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                                                               | Recommendation     | Confidence | Needs maintainer           |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------ | ---------- | -------------------------- |
| Q1  | Bytes staged by main; a keyless rewriter child writes the only file; main hashes it; UI-only registration (audit) | refined (audit)    | Medium     | **yes (Q-T2, Q-T8)**       |
| Q2  | Register-dataset naming rules; suffix on collision; no prefix                                                     | **overturned**     | High       | no                         |
| Q3  | Dataset-level lineage + own hash + plan revision                                                                  | kept               | High       | no                         |
| Q4  | Topics + count, imputation and locale rules; examples off-benchmark                                               | refined            | High       | no                         |
| Q5  | Instrumentation advisory and UI-only; row loss via `row_change`; join explosion by key cardinality (audit)        | overturned (audit) | High       | **yes (Q-O1, Q-T5, Q-T7)** |
| Q6  | Hashes before and after each snapshot; background registration hashing (audit)                                    | refined (audit)    | High       | **yes (Q-T9)**             |
| Q7  | 2 GB per analysis, 10 GB warning, both settings                                                                   | kept               | High       | no                         |
| Q8  | Conversation-private until Keep; visibility pulled from the controller; exact-file grants (audit)                 | overturned (audit) | High       | **yes (Q-O6, Q-T3, Q-T4)** |
| Q9  | Recommended tools; no splits, no charts                                                                           | refined            | High       | no                         |
| Q10 | PA-03 from `profile_issues[]`; PA-04 in main on `requires_derived_dataset` tasks (audit)                          | refined (audit)    | High       | **yes (Q-T6)**             |

**Totals:** 10 answered · 4 kept · 3 refined · 3 overturned · 0 need the maintainer. The audit raised Q-O1..Q-O8 and Q-T1..Q-T9 (`P15-audit.md`).

**Overturned recommendations:**

- Q2: a `d_` prefix duplicates the catalog flag, and overwriting would invalidate earlier results.
- Q5: checking only the saved dataset misses mistakes in intermediate frames.
- Q6: hashing everything at first start blocks the app after an update.

**For the maintainer:** none in the first pass; see `P15-audit.md` for the audit questions.

**Cross-question changes made in the consistency pass:**

- Q10's PA-04 measurement depends on Q5's instrumentation. **Superseded by the audit:** PA-04 is measured in main.
- Q9 keeps splits out of the wrangler so P17's test lock holds.

**Facts verified:**

- **To verify:** the Parquet writer available in Pyodide (P13-01).
- **To verify:** the instrumentation's overhead (P15-04).
