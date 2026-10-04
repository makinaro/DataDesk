# P20 Questionnaire: Decisions Needed Before Learning & Memory

| Field           | Value                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle how lessons are extracted, applied, updated, shown and measured                                                             |
| Already decided | DS-12, DS-14; P10 Q24–Q27; P11 Q6; P12 Q8; P16 Q5; P19 Q7; D-030..D-045 (draft, `planning/decisions-draft.md`); P11–P17 as audited |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation       |

---

**Q1. When and how are lessons extracted?**
_Blocks: P20-02._

> **Recommendation (Claude):** At the end of each analysis the agent reflects on what went wrong
> and writes lessons.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** At the end of each analysis, **code extracts candidates** from the journal: (a) an error class followed by a successful execution of the same intent; (b) method or critic findings that were resolved; (c) user-typed corrections (P10 Q24); ~~(d) user dismissals (P19 Q7)~~ _(superseded: dismissals are not a source; see round 2)_. The agent **only phrases** each candidate in ≤ 2 sentences, inside a small budget (≤ 3% of the analysis budget). Code validates the phrasing against the candidate's structured fields and assigns the effect (P10 Q25). Free-form "reflections" without a candidate are discarded.
>
> **Why:** If the agent decides what went wrong, it can learn the wrong thing, or nothing, and an injected instruction can pose as a reflection. Grounding every lesson in a journal event makes lessons traceable (EC20-3) and keeps "code, not the agent" for what gets learned.
>
> **Rejected:** free agent reflection (ungrounded, injectable); no phrasing step (raw error dumps aren't reusable advice).
>
> **Recommendation was:** overturned (code extracts, the agent only phrases).
>
> **Consequences:** P20-02; the candidate schema in `src/shared/ds/`.
>
> **Revisit if:** useful lessons are being missed that no candidate rule captures (add a rule, not free reflection).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Candidate (b) takes only main-sourced and critic-original findings (principle 7); corrections come only from the "Correct this" UI action with the message role checked (P10 Q24). The phrasing call's cost is reserved at analysis start within the $1.
>
> **Audit resolution, round 2 (2026-10-03):** Corrections come from a structured "Correct this" form (effect, target from a list, scope); a correction about what the data means becomes a note proposal (Q-AF2). Dismissals are not a lesson source. Candidates are keyed by their source journal event hash.
>
> **Audit resolution, round 3 (2026-10-03):** Crash-left analyses get one reflection on recovery, keyed by source event hash.

**Q2. How does a lesson capture "what fixed it"?**
_Blocks: P20-02._

> **Recommendation (Claude):** The agent describes the fix in the lesson text.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Code pairs the failed execution with the **next successful execution in the same plan step** and stores a **minimal diff of the code** (≤ 20 lines) in the lesson's evidence. The phrasing must describe that diff ("use `pd.to_datetime(..., dayfirst=True)` for this dataset's dates"), and validation checks the phrasing mentions an identifier from the diff.
>
> **Why:** A fix described only in the agent's words can be wrong, while the diff is what actually worked. Requiring the phrasing to reference the diff keeps the lesson honest and specific.
>
> **Rejected:** agent description only (unverifiable); storing whole code cells (too big for the working set).
>
> **Recommendation was:** overturned (a code diff as evidence, with phrasing checked against it).
>
> **Consequences:** P20-02.
>
> **Revisit if:** diffs are often too large (many fixes at once); then the lesson is skipped, not guessed.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Code AST-parses both cells into structured `target` and `parameters`; the "same plan step" is the same plan question id, recorded by code. The phrasing is UI-only until approved; auto-applied lessons render structured fields only (D-037, Q-AB4).
>
> **Audit resolution, round 2 (2026-10-03):** `target` comes only from allowlisted library qualnames; parameters must be in the declared signature; literals are kept only when they match a per-parameter grammar. Loss-inducing fixes (coerce, skip, ignore, bare except, dropna on the target) are suppressive and need approval. The phrasing call sees structured fields and a placeholder diff only, and its output is never put in model context.
>
> **Audit resolution, round 3 (2026-10-03):** Additive is an allowlist of (qualname, parameter, value grammar) triples; any other parameter makes the lesson suppressive. A `prefer_method` from an assumption-check finding is suppressive (D-035).

**Q3. How are lessons shown to the agent?**
_Blocks: P20-03._

> **Recommendation (Claude):** Appended to the system prompt.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **Not in the system prompt.** Lessons go into the **working-set layer** (roadmap §8.5) per role call, through the context builder, as a fenced, labelled block ("Lessons from earlier analyses — advisory, may be wrong") with lesson ids, capped at ≤ 8 lessons / 1.5k tokens (P10 Q26). ~~The agent reports used lesson ids in the key-results block, which feeds confidence updates (Q4).~~ _(Superseded: code records retrieved ids; `lessons_used` is display-only.)_
>
> **Why:** Appending lessons to the system prompt makes them permanent, unbudgeted and indistinguishable from rules, and breaks prompt caching (§8.5 puts stable content first). The working set is retrieved per task, bounded, and visibly advisory, which matters because lessons are partly data-derived (NFR-13).
>
> **Rejected:** the system prompt (unbounded, mistaken for rules, breaks caching).
>
> **Recommendation was:** overturned (working set, fenced, reported use).
>
> **Consequences:** P20-03; the key-results schema gains `lessons_used`.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Push only: the "lesson retrieval" tool is removed (Q-AB6). Code records retrieved ids; `lessons_used` is display-only and validated as a subset. Lesson text is debited from the byte budget.
>
> **Audit resolution, round 2 (2026-10-03):** Each distinct lesson is debited once per analysis (Q-AF5); only `auto` or `approved` lessons are eligible; the lead gets lessons at session start and on the state-card cadence; retrieval is read-only in holdout runs.
>
> **Audit resolution, round 3 (2026-10-03):** Accepted notes are debited once per analysis like lessons. The phrasing role and its 2k budget need a new D-NNN (Q-AG6).

**Q4. How does a lesson's confidence change?**
_Blocks: P20-05._

> **Recommendation (Claude):** +1 each time it is used, decay after 30 days unused.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Confidence starts at 0.5. When retrieved **and** the targeted error class or finding does not recur in that analysis: +0.1. When retrieved and it **does** recur, or a finding is linked to following it: −0.2. Unused for 60 days: −0.1 per 30 days. Below 0.2 the lesson is disabled (kept, shown as disabled). Edits by the user set confidence to 0.9.
>
> **Why:** "+1 per use" rewards a lesson for being retrieved, not for being right, so a popular wrong lesson would gain confidence. Updates must depend on outcome. The asymmetry (−0.2 vs +0.1) makes the store quicker to distrust than to trust, which is the safe direction (R-07).
>
> **Rejected:** usage-based confidence (rewards popularity); no decay (stale lessons linger).
>
> **Recommendation was:** overturned (outcome-based, asymmetric updates).
>
> **Consequences:** P20-05; unit tests on update sequences.
>
> **Revisit if:** useful lessons get disabled too fast (tune by D-NNN with M-13 evidence).
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Confidence moves only when the trigger precondition occurred, in the role whose context held the lesson, so retrieval alone can't earn credit. Decay is −0.1 per 30 days after 60 days unused.
>
> **Audit resolution, round 2 (2026-10-03):** Confidence changes are delta events.

**Q5. How are duplicate lessons handled?**
_Blocks: P20-05._

> **Recommendation (Claude):** Merge lessons with the same trigger.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Merge when the trigger matches **and** the BM25 similarity of the texts is above a threshold calibrated on the first 50 lessons. Merged lessons keep **all** source references and the higher confidence. Lessons with the same trigger but **contradictory effects** (e.g. `prefer_method` A vs B) are not merged: both go to the pending queue as a conflict for the user.
>
> **Why:** Merging on trigger alone would fuse different advice that happens to share a context. Contradictions are exactly what a human should settle.
>
> **Rejected:** trigger-only merging (fuses unrelated advice); no merging (duplicates crowd the 8-lesson cap).
>
> **Recommendation was:** refined (similarity, provenance kept, conflict handling).
>
> **Consequences:** P20-05.
>
> **Revisit if:** none expected.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: merging and promotion use **exact structural keys** (P10 Q26 audit), not text similarity (Q-AB5).
>
> **Audit resolution, round 3 (2026-10-03):** The promotion key excludes the dataset hash; `parse_hint` lessons are never promoted.

**Q6. What can the user do in the Learnings panel?**
_Blocks: P20-07._

> **Recommendation (Claude):** See, edit, disable and delete lessons, and approve pending ones.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, plus: filter by dataset, type and effect; each lesson's **source link** opens the journal event; an "applied in" list shows where it was used; a pending-approval badge. Editing a lesson marks it **user-authored**, and its effect is re-derived by code from the edited structured fields (so an edit can't smuggle in a suppression without approval).
>
> **Why:** Seeing where a lesson came from and where it was applied is what lets a user judge it. Re-deriving the effect on edit closes the hole where an edit would bypass the approval rule.
>
> **Rejected:** free-text editing without re-validation (bypasses P10 Q25).
>
> **Recommendation was:** refined (provenance, applied-in, re-validation on edit).
>
> **Consequences:** P20-07; component tests.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Delete is a soft delete, so a rejected lesson isn't re-proposed.

**Q7. How is learning measured?**
_Blocks: P20-08, M-13, M-14._

> **Recommendation (Claude):** Three dev runs in a row; compare repeated mistakes in run 1 and run 3.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The **learning sequence** runs on an **isolated bench profile with an empty lesson store**, in a fixed task order with fixed seeds: three dev passes per provider. M-13 compares runs 1 and 3. Lessons from contributors' everyday use never enter it. ~~The sequence costs ~$39–45 per provider (P10 Q23, maintainer item).~~ _(Superseded: ≈ $200 approval, Q-AF3.)_
>
> **Why:** Starting from a contributor's existing lessons would make the result depend on who ran it (R-19), and an empty store is the only reproducible baseline. Fixed order and seeds make the reduction attributable to learning rather than chance.
>
> **Rejected:** using everyday lesson stores (irreproducible); a single pass (no learning measured).
>
> **Recommendation was:** refined (isolation, empty store, fixed order).
>
> **Consequences:** P20-08; the runner gets a `--sequence` mode.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** A lessons-off **control run** per provider gives M-13 a counterfactual; aborted sequences are void; spend ≈ $130 including both holdout-a passes (Q-AB3). Reflection is off in holdout runs, and the before-run uses a fresh profile.
>
> **Audit resolution, round 2 (2026-10-03):** Inherited gates are taken on the lessons-off control run 3′ (Q-AF4); the store is snapshotted after run 3 and the holdout-after run asserts its hash. Spend approval ≈ $200 with headroom for one voided sequence (Q-AF3).
>
> **Audit resolution, round 3 (2026-10-03):** Inherited gates on run 3′, and none may fail on run 3 (Q-AG3); voiding only for code-recorded infrastructure causes; every started run's scores committed; worst case ≈ $140.

**Q8. Can lessons contain the user's data?**
_Blocks: P20-01, P20-09._

> **Recommendation (Claude):** Yes, lessons are local.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Lessons may **reference** columns and datasets by name and hash, but ~~code strips or truncates literal data values to ≤ 40 characters per lesson~~ _(superseded: literals are kept only when they match a per-parameter grammar, otherwise typed placeholders)_ and **never stores rows**. Lessons are local only, never sent anywhere except as context to the user's chosen provider (like everything else, DS-09). Export and import of lessons are out of v1.0.
>
> **Why:** "Lessons are local" is true but incomplete: lessons go into every future context, so a lesson holding raw data would leak rows into unrelated analyses, beyond the 20-row sample rule. A literal-value cap keeps lessons about **how**, not **what**.
>
> **Rejected:** unrestricted content (row leakage across analyses).
>
> **Recommendation was:** overturned (value cap; no rows).
>
> **Consequences:** P20-01 validation; P20-09 tests.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The 40-character cap is per value; string literals become typed placeholders by AST; tracebacks are stored without values; evidence never reaches the model.
>
> **Audit resolution, round 2 (2026-10-03):** Code renders each lesson's title from its structured fields.

**Q9. How are dataset notes written?**
_Blocks: P20-06._

> **Recommendation (Claude):** The agent writes notes automatically after each analysis.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The agent **proposes** notes (dictionary entries, quirks, ~~declared weights~~, key findings with provenance; _weights are superseded: `studyDesign` only, Q-AB1_) at the end of an analysis. Proposals appear in a "notes to review" list, and **only accepted notes** are used in context. Users can write notes directly. Notes become stale on hash change (P10 Q27).
>
> **Why:** Automatic notes would put unreviewed claims (possibly wrong, possibly injected through data) into every future analysis of that dataset. Accepting a proposal takes one click and keeps DS-12's "nothing applies silently".
>
> **Rejected:** automatic notes (violates DS-12, and an injection path).
>
> **Recommendation was:** overturned (propose and accept).
>
> **Consequences:** P20-06; ~~the weights field is set here (P16 Q5)~~ _(superseded: weights live only in `studyDesign`, Q-AB1)_.
>
> **Revisit if:** users ignore the review list (then cap pending proposals and expire them).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Quirks live in notes only (Q-AB2); weights live only in `studyDesign`, shown read-only (Q-AB1). Accepted notes are fenced as data and can't carry design fields or suppressions. Only the user re-validates a stale note (D-037).
>
> **Audit resolution, round 3 (2026-10-03):** Notes are structured records with free text typed only by the user (Q-AG5); writes are atomic.

**Q10. What are the gate values, and how is M-14 measured before P22?**
_Blocks: EC20-1, EC20-2._

> **Recommendation (Claude):** M-13 ≥ 50% reduction and M-14 ≥ 1.0 on the full holdout.

> **Answer Q10:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** M-13 ≥ 50% reduction (runs 1 → 3, dev). For M-14 before P22, a **fixed half of the holdout** (4 tasks) is run **once** before and once after the learning sequence; its results are sealed (not looked at in detail) and the other half stays untouched for P22. This is the only exception to "holdout only in P22", recorded as a D-NNN.
>
> **Why:** M-14 asks whether learning masks problems on data the agent hasn't learned from. That can't be measured on dev, where the lessons came from. Spending the whole holdout here would leave P22 with nothing clean, so splitting it and sealing this half's details bounds the leak.
>
> **Rejected:** the full holdout in P20 (nothing clean left for P22); M-14 on dev (meaningless).
>
> **Recommendation was:** overturned (half-holdout, sealed, D-NNN exception).
>
> **Consequences:** P12-05's runner gets a `holdout-a` and `holdout-b` split; the P22 plan uses `holdout-b` for final scores.
>
> **Revisit if:** none expected.
>
> **Confidence:** Medium · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Agree.
>
> **Audit resolution (2026-10-03):** EC20-2 is **report-only** (roadmap §7.1, P10 Q19) (Q-AB8). Holdout-a runs are run or witnessed by a maintainer and committed aggregate-only (D-036, P12). Lessons from holdout-a are purged before P22, which starts from an empty store (Q-AB7).
>
> **Audit resolution, round 2 (2026-10-03):** `relax_threshold` is dropped from v1.0; an approved `skip_check` adds advisory text only, and the check still fires (Q-AF1).
>
> **Audit resolution, round 3 (2026-10-03):** A failed holdout-a task is reported as unmeasured, never re-run (Q-AG1); P22 re-runs the sequence and measures M-14 on holdout-b (Q-AG4).

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                                                | Recommendation     | Confidence | Needs maintainer              |
| --- | -------------------------------------------------------------------------------------------------- | ------------------ | ---------- | ----------------------------- |
| Q1  | Code extracts candidates from the journal; the agent only phrases                                  | **overturned**     | High       | no                            |
| Q2  | The code diff is the evidence; phrasing checked against it                                         | **overturned**     | Medium     | no                            |
| Q3  | Pushed by code from structured fields; only auto or approved lessons; ids recorded by code (audit) | overturned (audit) | High       | **yes (Q-AB4, Q-AB6, Q-AF5)** |
| Q4  | Outcome-based, asymmetric confidence with decay                                                    | **overturned**     | Medium     | no                            |
| Q5  | Merge and promote by exact structural keys (audit)                                                 | overturned (audit) | High       | **yes (Q-AB5)**               |
| Q6  | Provenance, applied-in, effect re-derived on edit                                                  | refined            | High       | no                            |
| Q7  | Isolated profile, empty store, fixed order and seeds                                               | refined            | High       | no                            |
| Q8  | No rows; literal values ≤ 40 chars                                                                 | **overturned**     | High       | no                            |
| Q9  | Agent proposes notes, user accepts; weights only in `studyDesign`; quirks in notes (audit)         | refined (audit)    | High       | **yes (Q-AB1, Q-AB2)**        |
| Q10 | M-14 on a sealed half of the holdout, as a D-NNN exception                                         | **overturned**     | Medium     | **yes**                       |

**Totals:** 10 answered · 0 kept · 3 refined · 7 overturned · 4 rows need the maintainer (Q3, Q5, Q9, Q10). The audit raised Q-AB1..Q-AB8, Q-AF1..Q-AF5 and Q-AG1..Q-AG6 (`P20-audit.md`).

**Overturned recommendations:**

- Q1: agent-chosen lessons are ungrounded and injectable.
- Q2: an agent's description of a fix can be wrong, while the diff is what worked.
- Q3: lessons in the system prompt become unbounded rules and break caching.
- Q4: usage-based confidence rewards popular wrong lessons.
- Q8: data in lessons leaks rows into unrelated analyses.
- Q9: automatic notes violate DS-12.
- Q10: M-14 needs unseen data, but the whole holdout must survive for P22.

**For the maintainer:**

- Q10: allow a sealed half of the holdout (4 tasks) to be used once in P20 for M-14, keeping the other half for P22?

**Cross-question changes made in the consistency pass:**

- ~~Q3's `lessons_used` feeds Q4's updates.~~ _(Superseded: confidence moves on triggered use recorded by code.)_
- Q6's re-derivation enforces P10 Q25 on edits.
- Q10 splits the holdout for P22.

**Facts verified:** none needed beyond earlier phases.
