# P15 Plan: Data Wrangling & Derived Datasets

| Field     | Value                                                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P15 of P10–P23 (roadmap §10)                                                                                                                                                                              |
| Milestone | MVP v0.1 Trust                                                                                                                                                                                            |
| Objective | Clean and reshape data into new datasets without ever touching the originals                                                                                                                              |
| Entry     | P14 closed; **the maintainer's approval of this phase's planned API spend (D-034) before the gate session (5)**                                                                                           |
| Spend     | Planned **≈ $24**: one dev run per provider at the gate on the fixed 12-task dev set (D-036), no judge calls                                                                                              |
| Size      | M (5 sessions)                                                                                                                                                                                            |
| Branch    | `phase-15-wrangling`                                                                                                                                                                                      |
| Inputs    | ADR-05, ADR-11 · P10 Q12, Q27 · P14 Q1, Q3 · P13-10 artifact channel · `docs/ds/04-method-policy.md`                                                                                                      |
| Outputs   | D15-1 `save_derived_dataset` · D15-2 catalog v2 (ids, lineage cache, hashes) · D15-3 wrangler sub-agent + `data-cleaning` skill · D15-4 wrangling checks · D15-5 sidebar lineage UI · D15-6 bench results |
| Status    | Audited (3 rounds, `P15-audit.md`); all findings fixed; maintainer defaults pending (Q-O, Q-T, Q-X); awaiting sign-off                                                                                    |

**Rule for the phase:** derived data and its honesty checks. No statistics or models. Work-item ids
follow the plan's own order (roadmap P15-06 "Bench" is P15-07 here, because hashing was added as
P15-06 by P10 Q27).

**Who does what (P15 audit, A1):**

1. `datadesk-ds` relays the request; the kernel streams the Parquet bytes on P13's **artifact
   channel**.
2. Main's controller journals `derived_pending` and **stages** the bytes under the analysis
   folder (outside `derived/`), fsynced.
3. A **dedicated, short-lived keyless rewriter child** (`src/main/derived/rewriter/`, an
   `ELECTRON_RUN_AS_NODE` child with an explicitly built env and no keys, rule 5; a DuckDB with
   exact-file read access to the stage file **and the parents' snapshots** main lists, and write
   access to `derived/<uuid>/` only, where `<uuid>` is made by code; write grants under
   `allowed_directories` are a docs-researcher item) validates the schema, rewrites the file with
   `COPY`, and returns a zod-validated result: row count, column types, and the **key-cardinality
   check**: for every column set the saved file shares with two or more parents, whether those
   columns are many-to-many in the parents (code-derived, no agent declaration). Type changes the
   rewrite causes (pandas categoricals, zone-aware timestamps; to verify with `KV_METADATA`) are
   **recorded**, not claimed away. It is the **only writer** in `derived/<uuid>/`; the UI
   instance's DuckDB is never used for this. A kill or a 5-minute timeout gives `derive_failed`.
   Stages and the temporary second copy count against the 2 GB cap. The rewrite is **defence in
   depth**: DPAPI keys are same-user secrets, so the threat model records the residual risk (and
   that HF-downloaded Parquet already reaches the keyed instance, D-020); the rewriter is its own
   threat-model surface.
4. Main **hashes the final file** and journals `derived_committed` with that hash and the
   rewriter's result.
5. The **UI instance of `datadesk-mcp`** registers the catalog entry and owns deletion, through a
   UI-only, uuid-addressed registration (`DATADESK_UI_TOOLS=1`, real-path inside `derived/`
   checked), recorded in a D-NNN amending D-010 and D-020 (Q-T8); a test proves the agent instance
   lacks it. It is also the catalog writer for hashes main computes later (main sends them through
   its client).
6. **Lineage authority:** the journal is authoritative while the analysis exists; **"Keep" copies
   a frozen lineage record into the catalog entry**, so kept datasets survive deletion of their
   analysis (Q-T4); on Keep the view name is re-checked against global names and suffixed if it
   collides. **Reconcile is computed by main from the journals** (Q-X6) and executed by the UI
   instance: a file journalled `derived_committed` but unregistered is **re-registered**; only
   `pending` stages and rewriter outputs with no committed record are deleted; it never removes a
   catalog entry (a missing file is shown as "missing"); actions are journalled in
   `userData/logs/reconcile.jsonl`.
7. **Retention (Q-X5):** derived datasets follow D-043: they live as long as their analysis (or
   forever once kept); there is no time-based deletion.

**Scored facts come from main (roadmap §8.3 principle 7):** kernel instrumentation only produces
advisory findings tagged `source: kernel`. PA-04, trap detections and lessons use main-computed
artifact facts and the structured `issues[]` only.

---

## 1. Inherited Decisions and Inputs

| Source         | What it forces in P15                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-043, P10 Q12 | Parquet under `userData/datasets/derived/<id>/`; no approval; orphan-safe lineage; D-029 delete rule extended; 2 GB per analysis incl. snapshots |
| P10 Q27        | Content-hash identity                                                                                                                            |
| D-031          | ≤ 50M cells and ≤ 200 columns in Python; sampling above either must be disclosed (the `sampled` check, P15-04)                                   |
| D-009, D-010   | `allowed_paths` = exactly the registered files: derived datasets get **exact-file** grants, never a folder grant                                 |
| P11-16, ADR-11 | After a split, the split source is train-only and its lineage descendants are **hidden entirely** (no row mapping exists)                        |
| P14 Q1, Q3     | Parsed `select` sources; addressable outputs; the controller's caps                                                                              |
| P10 Q33        | PA-03 and PA-04 become gates from this phase                                                                                                     |

## 2. Session Plan

| Session | Work items               | Output                                                                              |
| ------- | ------------------------ | ----------------------------------------------------------------------------------- |
| 1       | P15-01, P15-06 (hashing) | `save_derived_dataset` with the commit protocol; catalog v2, hashing and migration  |
| 2       | P15-04                   | Main-side checks; advisory kernel instrumentation                                   |
| 3       | P15-03                   | Wrangler role (both providers) and skill                                            |
| 4       | P15-02, P15-05           | Sidebar lineage; derived datasets in both DuckDBs with exact-file grants and hiding |
| 5       | P15-07, audit            | Gate run (paid); summary                                                            |

## 3. Work Item Breakdown

### P15-01 `save_derived_dataset`

- [ ] `save_derived_dataset(variable, name, description, row_change)` per the commit protocol above (Q1, Q2); `row_change` is a structured disclosure `{expected_rows, reason: filter | aggregate | dedupe | join | reshape | other}` checked by main against the rewriter's counts (Q-T5); main accepts artifact chunks only while a save request is pending; the 2 GB per-analysis cap counts derived files, stages and snapshots together (Q7)
- [ ] Validation in the kernel is advisory (mixed-type object columns can't be written to Parquet anyway, so the kernel refuses them before streaming); the rewriter validates the schema; the UI instance doesn't validate
- [ ] `name` follows the existing name regex; **column names** follow `^[A-Za-z_][A-Za-z0-9_ ]{0,63}$`; `description` ≤ 200 printable characters, no newlines; all three are **fenced as data** in every context pack and shown with the derived badge; name-collision suffixes are computed only within the dataset's visibility scope, so they never reveal another conversation's dataset
- [ ] **Lineage parents** = the union of the parsed `select` sources (P14-01) of every snapshot loaded into the kernel since its last restart, plus every execution since that restart; parent hashes are taken from the **bytes read at snapshot time**; the record also carries `sampled`, `fitted_on_all_rows` (from the plan type: true unless a split existed) and an optional `parent_model_id` (P17 Q6)
- [ ] ENOSPC or a kill mid-stream: the stage is deleted, `artifact_failed`, journalled

**Done when:** EC15-1 and EC15-2 hold, and a crash at each step of the protocol is reconciled at startup.

### P15-02 Lineage in the UI

- [ ] Badge, parents, the producing executions and their code; a `sampled` badge; the **`row_change` disclosure**; removal options (P10 Q12)

### P15-03 Wrangler and skill

- [ ] Scope-table row (Q9); skill `data-cleaning` (Q4); context contract
- [ ] In predictive analyses, cleaning that must apply to test rows is written as **pipeline steps** (the skill says so; P17 owns the enforcement)

### P15-04 Wrangling checks

- [ ] **Main-side, scored:** silent row loss is scored on the bench against the **expected row count (with tolerance) of each required derived dataset in the code-generated answer key** and the parents' counts from main (Q-X1); in the app, a save whose rows differ from `row_change` raises a finding; join explosion: the rewriter's code-derived key-cardinality check finds many-to-many shared columns in the parents (Q-X2); `sampled` provenance (a derived dataset from a sampled snapshot can't pass as raw)
- [ ] **Advisory, `source: kernel`:** pandas instrumentation (merges with `validate=`, many-to-many keys, NaN introduction, imputation on the target; imputation before a split can only fire in plans revised to predictive, since predictive plans split first); reloaded after every kernel restart; findings travel in the envelope's `advisory` field, which is **UI-only**: the shaper never sends it to the model, and it is capped at 8 KB (Q-T7)
- [ ] **Profiler output:** the profiler calls a **`report_profile` tool** (on both providers) whose `profile_issues[]` (category, subject) is zod-validated (schema added to P11-09), **capped at 12 entries**, attributed by correlation id and journalled; PA-03 = dev data-quality traps whose category **and** subject appear in it ÷ the dev data-quality traps, with its **precision reported beside it** (Q-X7)
- [ ] Advisory text is rendered as data inside a fixed "from analysis code" frame, never as app text
- [ ] A method-check registry in `src/main/checks/registry.ts`, which P16 extends

**Done when:** each main-side check has a positive and a negative fixture.

### P15-05 Derived data in SQL

- [ ] Both DuckDBs (the agent instance of `datadesk-mcp` and `datadesk-ds`'s snapshot DuckDB) get **exact-file grants** for derived datasets. Before **every** build, the agent instance **pulls its visibility set** from the controller over the pipe, and **fails closed** (serves nothing) without it; the set also filters `list_datasets` and `get_schema`. The controller computes hiding by walking **journal lineage and frozen catalog lineage, transitively, across analyses** (Q-X3); a test kills and respawns the instance mid-analysis (Q-T3)
- [ ] Derived datasets are **private to their conversation and lane** until the user marks them "Keep" (an IPC channel and a UI-only tool, rule 3) (Q-O6); the controller passes the conversation and lane id to the instances; removal first rebuilds the DuckDBs without the file (no EBUSY on Windows)
- [ ] A predictive **or forecast** `save_plan` on a derived dataset with `fitted_on_all_rows` is **refused** with an actionable error ("re-derive inside the pipeline after the split") (Q-T1, Q-X4); this also refuses row-wise-only derivations, an accepted cost recorded with the decision. Each parent records the **`split_id`** of the snapshot it came from; a derived dataset made from train-only snapshots is exempt from hiding **only within the same split record** (H1)
- [ ] Values copied out of SQL and hard-coded into Python don't appear in lineage: a v1.0 limitation, stated in `docs/ds`

### P15-06 Hashing

- [ ] Registration hashing in the background, with progress; lazy migration of existing entries. **Parent hashes:** main hashes a source **before and after** each snapshot `COPY` and refuses the snapshot on a mismatch (Q-T9); a snapshot-cache hit with unchanged size and mtime since the last hash skips the re-hash (the cost is part of P14's budget). A snapshot waits up to 5 minutes for a pending hash, with progress; the wait counts toward active time, not the 120 s execution limit; `hash_pending` doesn't count toward the retry classes; a crash mid-hash restarts it
- [ ] Catalog v2 schema in `src/shared/ds/` (uuid ids, lineage cache, hashes), migrated by main's registry before the children start (P11-05)

### P15-07 Bench

- [ ] The gate run on the fixed dev set: PA-03, PA-04, EC15-3 and the inherited gates (Q10); the runner recomputes full content hashes for EC15-1

## 4. Deliverable Map

| Deliverable | File path                                                                                                                                                                                                                    | Produced by | Satisfies      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------- |
| D15-1       | `src/main/analysis/controller/derived.ts`; `src/main/derived/rewriter/` (the keyless rewriter child, its zod result schema and tests); `src/mcp-server/derived/` (UI-only registration and reconcile execution)              | P15-01      | EC15-1, EC15-2 |
| D15-2       | `src/shared/ds/catalog.ts` (v2) + migration fixtures                                                                                                                                                                         | P15-06      | EC15-2         |
| D15-3       | `src/main/agent/claude/subagents.ts` row; `resources/agent-plugin/skills/data-cleaning/`                                                                                                                                     | P15-03      | EC15-3         |
| D15-4       | `src/main/checks/registry.ts`, `src/main/checks/wrangling.ts`, `src/main/compute/instrumentation.py`                                                                                                                         | P15-04      | EC15-3, EC15-4 |
| D15-5       | `src/renderer/src/components/DatasetSidebar/` lineage                                                                                                                                                                        | P15-02      | DoD-2          |
| D15-6       | `bench/results/p15/`                                                                                                                                                                                                         | P15-07      | EC15-3         |
| D15-7       | Tests under `tests/main/{analysis,checks,derived}/`, `tests/mcp-server/derived/`; `docs/ds/07` and `08` rows (including the rewriter surface); `docs/ARCHITECTURE.md`; D-NNNs for Q5, Q6 and Q-T8 (amending D-010 and D-020) | all         | DoD-2, DoD-3   |

## 5. Exit Checklist

| EC / DoD  | Check                                                                                                                                                                                                                                                     | Evidence             | State |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----- |
| EC15-1    | Originals are byte-identical after every task (the runner recomputes full hashes)                                                                                                                                                                         | e2e + bench          | Open  |
| EC15-2    | Lineage is **correct** for every derived dataset: the task file's expected parents are a **subset** of the recorded parents (none missing; extras reported separately); parent hashes match a recomputation; the journal and catalog agree                | bench + unit         | Open  |
| EC15-3    | ≥ 3 of the 4 dev data-quality traps detected from structured `issues[]` on both providers, reported with the cluster bootstrap note (P12 Q-K6); PA-03 ≥ 60% per provider                                                                                  | `bench/results/p15/` | Open  |
| EC15-4    | PA-04 = 0 per provider: no required derived dataset outside the answer key's expected-rows tolerance without a disclosed `row_change` reason, on the dev tasks with `requires_derived_dataset: true` (P12-03, ≥ 2 tasks named in `docs/ds/05`); 0/0 fails | `bench/results/p15/` | Open  |
| EC15-5    | After a split, descendants are hidden in both DuckDBs (test); agent-crafted Parquet is never opened by the keyed instance before the rewrite (test)                                                                                                       | unit + e2e           | Open  |
| Inherited | M-04 = 0, M-19 ≥ 90%, PA-02 = 100%, PA-09 unprovenanced half = 0; parity; M-11 = M-12 = 0                                                                                                                                                                 | bench                | Open  |
| DoD 1–8   | As roadmap §17                                                                                                                                                                                                                                            | —                    | Open  |

## 6. Phase Risks

| Risk                                                  | Mitigation                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Instrumentation misses operations done outside pandas | It is advisory; scored checks come from main's artifact facts; the critic (P19) second |
| Disk growth from derived data                         | Per-analysis and global caps (Q7); conversation-private datasets; storage view in P23  |
| Catalog migration breaks existing users               | Fixture-tested migration (P11 Q8)                                                      |
| Hostile Parquet reaches a keyed process               | Staging plus the keyless rewriter child; the residual DPAPI risk recorded              |

## 7. Hand-off to P16

- Derived datasets as inputs for inference
- The method-check registry, which P16 extends
- The rule that kernel findings are advisory (P16 Q3 and P17/P18 instrumentation follow it)
