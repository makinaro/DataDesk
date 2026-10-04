# P20 Plan: Learning & Memory (self-learning)

| Field     | Value                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P20 of P10–P23 (roadmap §10)                                                                                                                                                                                                                                                                                                                                                |
| Milestone | v0.3 Learning                                                                                                                                                                                                                                                                                                                                                               |
| Objective | The agent gets better with use, without masking problems (DS-12, DS-14)                                                                                                                                                                                                                                                                                                     |
| Entry     | P19 closed; **the maintainer's spend approval for this phase before session 6**, as a maintainer-signed tag (P12 Q-K1, which replaces D-034's approval source; D-034's amount rules still apply)                                                                                                                                                                            |
| Spend     | Planned **≈ $200** approval: the worst case of ≈ $148 (per provider, three dev runs plus a lessons-off control run, 4 passes ≤ $15 each, ≈ $120 in all; holdout-a before and after, 4 tasks each per provider at ≤ $1.75 a task with double judging, ≈ $28; maintainer-run or witnessed) plus headroom for **one voided sequence** on one provider (≈ $60) (Q-AF3, round 3) |
| Size      | L (8 sessions)                                                                                                                                                                                                                                                                                                                                                              |
| Branch    | `phase-20-learning`                                                                                                                                                                                                                                                                                                                                                         |
| Inputs    | ADR-07 · D-033, D-036, D-037 · P10 Q24–Q27 · P11-07, P11 Q6 · P12-05/07 (`--sequence`, custody) · P14-09 (briefs, context builder) · P16 (`studyDesign`) · P19 (finding sources) · roadmap §8.3 principles 5 and 7                                                                                                                                                          |
| Outputs   | D20-1 lesson store · D20-2 reflection step · D20-3 retrieval via the context builder · D20-4 approvals and Learnings panel · D20-5 dataset notes · D20-6 learning-sequence results                                                                                                                                                                                          |
| Status    | Audited (3 rounds, `P20-audit.md`); maintainer defaults pending (Q-AB, Q-AF, Q-AG)                                                                                                                                                                                                                                                                                          |

**Rule for the phase:** memory and retrieval only. Nothing learned changes model weights, method
policy thresholds, the test lock, provenance rules or sandbox limits (P10 Q25). So
`relax_threshold` is **dropped** from the v1.0 effect enum. An approved `skip_check`,
`dismiss_warning` or `change_default` lesson only adds fenced advisory text ("the user has accepted
this risk" or "the user prefers …") and a report note: **the check still fires, its finding stays
visible and no D-035 default changes**; only the user dismisses findings (P19 Q7) (Q-AF1, Q-AG2).

**Structured lessons (D-037, P20 audit rounds 1–3):** a lesson is a record of structured fields:
`effect` from the fixed enum (assigned by code) and `type` **derived from it** (`error_fix`,
`method`, `preference`, `parse_hint`), `trigger` (code-mapped enums: task type, library, error
class, dataset hash for dataset-scoped lessons), `target` and `parameters`, a `title`
**rendered by code** from those fields (BM25 indexes it), and `sources[]` (`{kind,
journalEventHash, analysisId?, removed}`, one per merged source). `target` comes **only from an
allowlist of library qualnames resolved by code** (never an agent-defined function or column
name); `parameters` must exist in the function's declared signature (never `**kwargs`); literal
values are kept only when they match a per-parameter grammar, otherwise they become typed
placeholders. **Additive is an allowlist, not a deny-list (round 3, G1):** the mapping table in
`src/shared/ds/lessons.ts` lists the (qualname, parameter, value grammar) triples known to be
additive (`encoding` codec names, `sep` single characters, `decimal`, a date `format` of
strftime tokens); **every other parameter** (`skiprows`, `usecols`, `na_values`, `dayfirst`,
`nrows`, `skipfooter`, `dtype`, `fillna`, `errors`, `on_bad_lines`, `dropna` and so on) and
every bare `except` makes the lesson **suppressive and pending** (P10 Q25 fails closed).
**Auto-applied (additive) lessons are rendered into context from these fields only**; the agent's
phrasing is **never** put in model context, **even after approval** (UI only, Q-AB4 as reworded).
`prefer_method` may only choose within the method policy's acceptable set, and a `prefer_method`
lesson whose source is an **assumption-check finding** is suppressive (D-035: the method is chosen
before testing, never by an assumption test). **Merging and promotion use exact structural keys**
(Q-AB5); the promotion key **excludes the dataset hash**, and `parse_hint` lessons are **never
promoted** to global scope. The same table defines each lesson type's trigger precondition (for
example, a `read_csv` on that dataset hash).

**Ownership (Q-AB1, Q-AB2):** dataset **quirks** live only in notes; parse hints that change how a
file is read are `parse_hint` lessons. **Weights** and every other external design field live only
in the `studyDesign` record (P16): notes show a read-only view, and an agent proposal can only
open the Study design panel.

---

## 1. Inherited Decisions and Inputs

| Source            | What it forces in P20                                                                                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-037, P10 Q24    | Sources: failed executions, main-sourced findings and confirmed critic-original findings (P19 Q-AI2), corrections the user typed through the "Correct this" action; never ratings, keys, scores, judge rationales or `source: kernel`/`probe`/`agent` findings (principle 7, P19) |
| D-037, P10 Q25    | Typed effect enum assigned by code; suppressive or unknown effects need approval; invariants untouchable; additive effects rendered from structured fields only                                                                                                                   |
| P10 Q26 (audited) | Dataset-scoped first; global after ≥ 2 datasets by structural key; ≤ 8 lessons / 1.5k tokens per call                                                                                                                                                                             |
| D-037, P10 Q27    | Notes keyed by content hash; stale notes kept but excluded from context; only the user re-validates a stale note                                                                                                                                                                  |
| P11-07, P11 Q6    | Structural filter, then BM25 on capped title and trigger fields, ties by confidence then recency; no embeddings                                                                                                                                                                   |
| D-036, P12-05/07  | Holdout-a used once in P20 as one before/after pair, run or witnessed by a maintainer, aggregate-only results; `--sequence` carries only the lesson store; holdout-a lessons purged by provenance before P22                                                                      |
| D-033             | Lesson and note text counts against the per-analysis byte budget                                                                                                                                                                                                                  |
| P16, P19 Q7       | `studyDesign` owns weights; dismissals are not a lesson source (P19 audit)                                                                                                                                                                                                        |

## 2. Session Plan

| Session | Work items     | Output                                                                     |
| ------- | -------------- | -------------------------------------------------------------------------- |
| 1       | P20-01         | Lesson store: event log, schema with `schemaVersion`, effect mapping table |
| 2       | P20-02         | Reflection: code candidates, AST fields, phrasing role, validation         |
| 3       | P20-03, P20-05 | Retrieval by push; confidence, decay and structural merging                |
| 4       | P20-04, P20-07 | Approvals and the Learnings panel                                          |
| 5       | P20-06, P20-09 | Dataset notes; injection guards and fixtures                               |
| 6–7     | P20-08         | Learning sequence with a control run; holdout-a before/after (paid)        |
| 8       | P20-10, audit  | Holdout-a purge; summary                                                   |

## 3. Work Item Breakdown

### P20-01 Lesson store

- [ ] `userData/knowledge/lessons.jsonl` as an **event log** (create, update confidence, merge, disable, soft-delete, source removed), folded on read, with `schemaVersion` and migrations (D-045); a single writer queue in main serialises compare lanes; a torn last line is truncated on open; ENOSPC fails visibly (Q8)
- [ ] The **candidate → effect mapping table** in `src/shared/ds/lessons.ts`, with the structured-field schema (§12.7 bump)

**Done when:** fold, migration and crash fixtures pass.

### P20-02 Reflection

- [ ] At the end of each analysis, code extracts candidates (Q1), each keyed by the hash of its source journal event so a crash re-derivation doesn't duplicate: (a) an error class followed by a successful execution answering the **same plan question id**; (b) resolved main-sourced findings, and critic-original findings **confirmed** by the user or by a later main check on the same subject (P19 Q-AI2); (c) a **"Correct this"** correction, where the user picks the effect, the target from a list and the scope in a small structured form; a correction about what the data **means** becomes a **note proposal** instead (Q-AF2)
- [ ] Code AST-parses both cells into `target` and `parameters` (Q2) under the rules in the header; the tool-less **phrasing call** receives the structured fields and the placeholder diff only, has its own role row in roadmap §8.1 with a 2k-token budget (**a new D-NNN at sign-off**, since D-039 lists no such role; Q-AG6) and a parity test, and its cost is **reserved at analysis start** inside the $1 and journalled
- [ ] No reflection runs during holdout runs. **Crash recovery:** an analysis left `running` or `failed` by a crash is marked on the next start, and reflection runs **once** for it over its journal, keyed by source event hash (so a second recovery adds nothing)

**Done when:** each candidate class has a fixture, including an injected column name that must not reach a rendered lesson.

### P20-03 Retrieval

- [ ] **Pushed by the context builder only** (no agent tool, Q-AB6): rendered from structured fields into the briefs and, for the lead, at session start and on the state-card cadence (P14-09); only lessons that are `auto` or `approved` and not disabled or deleted are eligible; code records the retrieved ids in the context pack (§12.9); `lessons_used` is display-only and must be a subset; **each distinct lesson, and each accepted note, is debited from D-033's byte budget once per analysis**, not per call (Q-AF5); retrieval is **read-only in holdout runs** (no confidence or last-used updates)

### P20-04 Approvals

- [ ] Pending queue; approve or reject; rejected lessons kept as rejected; each approval shows the scope and the source finding

### P20-05 Confidence and merging

- [ ] Confidence moves **only when the lesson's trigger precondition occurred** in the analysis, in the role whose context held it, as **delta events** (+0.1 if the targeted error class or finding didn't recur; −0.2 if it did or if a finding on the lesson's target followed); unused for 60 days, then −0.1 per further 30 days; **below 0.2 the lesson is disabled**; a user edit sets confidence to 0.9 (and re-derives the effect, Q6); merging by exact structural key (Q4, Q5)

### P20-06 Dataset notes

- [ ] `userData/knowledge/notes/<content-hash>.json` with `schemaVersion`, written by main's single writer queue **atomically** (temp file, then rename); pending proposals in `notes/pending.jsonl`; the catalog's dataset id → previous hash map drives staleness. **Notes are structured records (Q-AG5):** dictionary entries keyed to **catalog column names**, with unit and type from enums and a description capped at 200 characters; quirks from an **enum**; past findings with provenance by finding id. **Agent proposals carry only the structured fields**; free-text descriptions are **typed by the user** only. The user accepts or edits (Q9); accepted notes are **fenced as data** in context; notes can't carry `studyDesign` fields or suppressions (enforced by the schema, not by filtering prose); weights appear read-only from `studyDesign`; a dev fixture with an **accepted planted note** must keep M-12 = 0

### P20-07 Learnings panel

- [ ] List, filter, source, edit, disable, **soft-delete** (so a deleted rejection isn't re-proposed); pending badge (Q6); diffs and links rendered as text (D-026); zod IPC channels (rule 3); a deleted analysis leaves its lessons' source marked "removed"

### P20-08 Learning sequence

- [ ] Per provider: three dev runs from an empty store in a fixed order (`--sequence`); the store is **snapshotted after run 3**; then a **lessons-off control run 3′** (retrieval and reflection off) in the same order (Q-AB3); each run records its lesson-store hash in `score.json` (§12.8 bump); the scorer checks that **every context pack of run 3′ holds zero lesson ids**. **Voiding (round 3):** a sequence is void **only for a code-recorded infrastructure cause** (a provider error class, a sandbox crash, a cap breach) written to `bench/results/p20/void.json`; it then restarts from an empty store with its spend debited; **scores from every started run are committed**, voided or not (D-036, no retry on a near miss)
- [ ] Holdout-a (one before/after pair, D-036): the before-run on a fresh profile; the after-run with the run-3 snapshot, **asserting its store hash**, reflection off and retrieval read-only; both run or witnessed by a maintainer, aggregate-only (Q7, Q10); the number of lessons retrieved is reported beside M-14; a holdout-a task that **fails** in either run (outage, sandbox kill, cap) is **reported as unmeasured, never re-run** (Q-AG1), and M-14 uses only tasks measured in both runs
- [ ] Runner capabilities (a `bench/runner/` deliverable, extending P12-07): lessons-off, reflection-off, read-only retrieval, and the store-hash assertion

### P20-09 Guards

- [ ] No lessons from keys, scores, judge text, or kernel, probe or agent findings; tracebacks stored with values stripped; evidence never rendered to analysis roles (Q8); unit fixtures for "ignore leakage checks", fake corrections, an agent-defined function name, a `**kwargs`-sink name, a `prefer_method` from an assumption-check finding, and **one fixture per non-allowlisted parameter** (`skiprows`, `usecols`, `na_values`, `dayfirst`, `nrows`, `skipfooter`, `dtype`, `fillna`, `errors`, `on_bad_lines`), none of which may auto-apply, plus a dev-only fixture variant outside the bench task set

### P20-10 Holdout-a purge (D-037)

- [ ] Before P22, a **code assertion**, committed with the results, checks that no lesson carries holdout-a provenance (none can, since reflection is off and retrieval read-only in holdout runs) and that the store hash after the holdout-after run equals the asserted snapshot hash; P22 starts from an **empty store** in a fresh profile, and re-runs the learning sequence for M-14 as its plan states (Q-AB7, Q-AG4)

## 4. Deliverable Map

| Deliverable | File path                                                                                                                                                                                                                                              | Produced by    | Satisfies      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | -------------- |
| D20-1       | `src/main/knowledge/lessons.ts`; `src/shared/ds/lessons.ts` (schema, mapping table)                                                                                                                                                                    | P20-01, 05, 10 | EC20-3         |
| D20-2       | `src/main/knowledge/reflect.ts`; the phrasing call's contract and parity test                                                                                                                                                                          | P20-02         | EC20-1         |
| D20-3       | `src/main/context/` working-set and brief retrieval                                                                                                                                                                                                    | P20-03         | EC20-1         |
| D20-4       | `src/renderer/src/views/learnings/`; IPC channels                                                                                                                                                                                                      | P20-04, 07     | EC20-4         |
| D20-5       | `src/main/knowledge/notes.ts`; `src/renderer/src/views/notes/`                                                                                                                                                                                         | P20-06         | DoD-2          |
| D20-6       | `bench/results/p20/` (scores of every started run, `void.json`, purge assertion)                                                                                                                                                                       | P20-08, 10     | EC20-1, EC20-2 |
| D20-8       | `bench/runner/` capabilities (extending P12-07): lessons-off, reflection-off, read-only retrieval, store-hash assertion, run-3′ zero-lesson check                                                                                                      | P20-08         | EC20-1, EC20-2 |
| D20-7       | Tests; §12.7 (`sources[]`, structured fields), §12.8 (lesson-store hash) and key-results (`lessons_used`) schema bumps with migrations; roadmap §8.1 and P11 tool-list edits; the phrasing-role D-NNN; `docs/ds/07`, `08` rows; `docs/ARCHITECTURE.md` | all            | DoD-2, DoD-3   |

## 5. Exit Checklist

| EC / DoD  | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Evidence             | State |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----- |
| EC20-1    | Per provider: **M-13** (roadmap §7.1, round 3): the per-task mean of failing executions with a non-`other` code-assigned error class, run 1 vs run 3, falls ≥ 50%, with executions per task reported beside it; run 3's point estimate beats the control run 3′, with the paired task-bootstrap interval reported as indicative; dev M-01 and M-02 within 10 points of run 1 (dev M-02 in runs 2–3 flagged as contaminated). With **fewer than 10 such failures in run 1**, EC20-1 is recorded as **not measurable** by a D-NNN and does **not** count as passing | `bench/results/p20/` | Open  |
| EC20-2    | M-14 on holdout-a **reported** (report-only in P20, roadmap §7.1), with the lessons retrieved; when before-recall is 0, the difference is reported instead of a ratio                                                                                                                                                                                                                                                                                                                                                                                             | same                 | Open  |
| EC20-3    | Every lesson traces to a source execution, finding or correction; when an analysis is deleted, a tombstone (the source journal event hash) keeps the trace                                                                                                                                                                                                                                                                                                                                                                                                        | unit + bench         | Open  |
| EC20-4    | No lesson whose approval isn't `auto` or `approved` appears in any context pack's source ids (§12.9) **or in the prompt text captured by the fake provider** (no pending or rejected lesson title or target), and the main-side check targeted by an injected or approved `skip_check` lesson **still emits its finding** (unit and dev fixtures)                                                                                                                                                                                                                 | fixtures             | Open  |
| Inherited | All earlier gates (as listed in P19 §5), taken on the **lessons-off control run 3′**, **and no inherited gate fails on the lessons-on run 3** (Q-AF4, Q-AG3)                                                                                                                                                                                                                                                                                                                                                                                                      | bench                | Open  |
| DoD 1–8   | As roadmap §17 (DoD-4's M-12 on every run)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                    | Open  |

## 6. Phase Risks

| Risk                                  | Mitigation                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Wrong lessons reinforce errors (R-07) | Confidence only on triggered use; decay; structural merging; user control       |
| Learning masks problems (R-07)        | Effect enum, approval for suppression, structured rendering, M-14 holdout check |
| Benchmark overfitting (R-08)          | Holdout-a once, maintainer-witnessed; purge before P22; control run             |

## 7. Hand-off to P21 and P22

- `lessons_used` (validated against retrieved ids) shown in the analysis UI and reports (P21)
- An empty lesson store for P22 after the purge (`userData/knowledge/lessons.jsonl` in a fresh profile); P22 re-runs the learning sequence (three dev runs from an empty store) and takes M-14 before and after on holdout-b, under its own store custody (Q-AG4)
