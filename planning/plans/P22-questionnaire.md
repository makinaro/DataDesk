# P22 Questionnaire: Decisions Needed Before Evaluation

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle what is frozen, what is measured, how, and what counts as passing                                                     |
| Already decided | P12 Q7; P20 Q10; P10 Q21, Q36                                                                                                |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation |

---

**Q1. What is frozen, and how?**
_Blocks: P22-01._

> **Recommendation (Claude):** Prompts and skills, by agreement not to change them.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Freeze **by code, not agreement**. Tag a release candidate (`v1.0.0-rc.N`) and record in a D-NNN: prompts, skills, the scope table, limits and budgets, context contracts, check thresholds, provider model ids (pinned, not aliases), sandbox package versions, bench version (generator, tasks, key hashes), rubric version and judge configuration. The runner refuses an official P22 run unless the ~~working tree equals the tag and the config hash matches~~ _(superseded: `--official` builds from the clean freeze tag and checks the artefact hash)_.
>
> **Why:** An agreement not to change things is invisible in the results, and drift between runs (a skill tweak "that doesn't matter") is exactly what makes evaluations irreproducible (EC22-2). The runner enforcing the tag makes the freeze real. Aliases must be pinned for evaluation because an alias can move to a new model mid-phase.
>
> **Rejected:** a freeze by agreement (unverifiable); evaluating on aliases (the model may change between runs).
>
> **Recommendation was:** overturned (tag-enforced freeze, pinned ids).
>
> **Consequences:** P22-01; the runner gets a `--official` mode that checks the tag.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** A maintainer-signed tag carries `bench/freeze/<tag>.json` (SHA, evaluation-relevant paths including the scorer, tokenizer, tolerances, rubric and generator, pinned ids, holdout-c commitments, denominator table); the tree check compares tracked files only; a run with a different response model id is void (Q-AH7).
>
> **Audit resolution, round 2 (2026-10-03):** A code rc tag comes first, holdout-c is generated after it, and the freeze tag differs only in the freeze record and `split.json`; `--official` builds the bench flavour itself, records the artefact hash and switch vector, and refuses any switch on; evaluation-relevant paths are listed by module, and P23's storage, onboarding, diagnostics and release paths are outside them (Q-AL4).
>
> **Audit resolution, round 3 (2026-10-03):** Exact path list with exclusions and a tree hash; deterministic double build with the artefact and escape hashes in the freeze record; `--official` with kinds for every run; runner, generator and decision rule built before the code rc (Q-AO2).

**Q2. Which tasks make the final score?**
_Blocks: P22-02._

> **Recommendation (Claude):** Holdout-b (the 4 untouched tasks).

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **Holdout-b (4 tasks) plus a fresh holdout-c**: ~~6 new synthetic tasks~~ _(superseded: 5 tasks to P12-01's design)_ generated from **new seeds and new surface forms** (column names, phrasing) covering every trap category, generated and hashed at the freeze, after which nobody looks at them. That makes ~~10~~ 9 unseen tasks. Public datasets can't be regenerated, so holdout-b carries the public share.
>
> **Why:** Four tasks can't support a v1.0 claim; one lucky or unlucky task moves accuracy by 25 points. The synthetic generator makes fresh unseen tasks nearly free, and generating them **after** the freeze guarantees no prompt was tuned against them.
>
> **Rejected:** holdout-b only (too few); re-using dev (overfit); re-using holdout-a (already seen in P20).
>
> **Recommendation was:** overturned (fresh holdout-c added).
>
> **Consequences:** P22-01; P12's generator must support new surface forms (a small P12 follow-up, propose at sign-off).
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Holdout-c follows P12-01's design (5 tasks, injection fixtures included), committed before the tag, then oracle pass and custody check; holdout-b and holdout-c reported separately and pooled.

**Q3. How many runs, at what cost?**
_Blocks: P22-02._

> **Recommendation (Claude):** Three runs per provider, as decided in P12.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** ~~Three runs per provider on the 10 final tasks: about 3 × 2 × 10 × ~$1 ≈ $60, plus the judge (~$3).~~ _(Superseded: 9 tasks in 12 passes; spend per Q-AL7.)_ ~~The runner shows the projection and requires `--confirm`.~~ _(Superseded: signed-tag approvals.)_
>
> **Why:** Three-run medians were agreed for decision points (P12 Q7), and this is the most important one. The cost is stated so the maintainer can approve it up front.
>
> **Rejected:** a single run (noise decides v1.0).
>
> **Recommendation was:** kept (cost made explicit).
>
> **Consequences:** P22-02.
>
> **Revisit if:** per-task cost has fallen by then (re-project at the freeze).
>
> **Confidence:** High · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Accepted as a **planned cost** only; explicit approval at the start of P22 before any run (DS-21).
>
> **Audit resolution (2026-10-03):** `--confirm` is removed: signed-tag approvals (P12-07). Spend sized on reservations with void headroom, ≈ $350 approval (superseded in round 2 by ≈ $490 with unit prices, Q-AL7); holdout-b and holdout-c run as separate passes so double judging fits $15 (Q-AH1).
>
> **Audit resolution, round 2 (2026-10-03):** Unit prices stated; approval ≈ $490 including a voided sequence and a holdout-d safety re-run (Q-AL7).
>
> **Audit resolution, round 3 (2026-10-03):** Unit prices restated ($1.75 = $1.25 + 2 × $0.25 judge); after-runs as two passes; every started pass committed; an unmeasured safety task voids the pass for safety metrics and re-runs it (Q-AO4).

**Q4. How are the ablations run?**
_Blocks: P22-03, P22-04._

> **Recommendation (Claude):** Every ablation on the final task set, both providers, three runs each.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Ablations run on the **dev set, one provider ~~(the cheaper, alternating per ablation)~~ (the Claude lane), one run each**: no critic; ~~no lessons;~~ no method checks; no output shaping; full transcript instead of briefs; no working set. That is 6 ablations × 12 tasks × ~$1 ≈ **$72**. Results are reported as **indicative deltas** with their noise band (from P22-02's run-to-run spread). Any component whose removal doesn't hurt beyond the noise band is a candidate for simplification (EC22-3).
>
> **Why:** Every ablation on the final tasks, both providers and three runs would cost about $360 and spend the holdout six more times. Ablations answer "does this component earn its cost?", for which dev is adequate and a noise band keeps the claims honest.
>
> **Rejected:** the full ablation matrix on the holdout (cost, holdout exposure).
>
> **Recommendation was:** overturned (dev, one provider, one run, noise band).
>
> **Consequences:** P22-03, P22-04.
>
> **Revisit if:** ~~an ablation delta sits inside the noise band but looks important (then run it twice more).~~ _(Superseded: no extra runs; an A/A control band, round 2.)_
>
> **Confidence:** Medium · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Accepted as a **planned cost** only; explicit approval at the start of P22 before any run (DS-21).
>
> **Audit resolution (2026-10-03):** Switches built before the freeze in the bench flavour only (P22-00); a full-system dev control on one provider, one pre-fixed pass per ablation, no extra runs; null results become v1.x proposals (Q-AH6).
>
> **Audit resolution, round 2 (2026-10-03):** Unjudged dev passes from an empty store; an A/A control pair gives the null band; differences are descriptive; the lessons effect is measured by M-13 and M-14 instead of an ablation (Q-AL6).
>
> **Audit resolution, round 3 (2026-10-03):** Controls first and last, ablations in a seeded order; every code-scored metric; null defined; the critic and method checks are never removed on a null result alone.

**Q5. How are results summarised statistically?**
_Blocks: P22-02, P22-06._

> **Recommendation (Claude):** Medians per metric.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Per metric: the median of 3 runs, plus a **95% bootstrap CI over tasks**. Provider comparisons are **paired by task** (~~Wilcoxon signed-rank on per-task scores~~ _superseded: descriptive differences with the rank-biserial effect size_), reported with effect size. Per-agent metrics and the rubric are reported the same way. Every number in the report is provenanced to a score file.
>
> **Why:** Medians alone hide uncertainty, and with 10 tasks a CI shows how much the score could move. Pairing by task removes task difficulty from the provider comparison. A product that enforces honest statistics should publish its own results the same way.
>
> **Rejected:** medians only (no uncertainty); unpaired comparisons (task difficulty confounds).
>
> **Recommendation was:** refined (CIs, paired tests).
>
> **Consequences:** P22-06.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** A target is met when the median of the runs' point estimates ≥ target; BCa interval with n; < 5 tasks is "n too small"; provider differences descriptive with rank-biserial effect size, no significance tests.
>
> **Audit resolution, round 2 (2026-10-03):** Zero-target metrics must be 0 in every run; other metrics compare the median with the target in the direction the metric table states; percentile bootstrap; pooled n < 5 is report-only with a waiver (Q-AL1).
>
> **Audit resolution, round 3 (2026-10-03):** Each provider must meet each gated target (DS-04).

**Q6. What happens when a target is missed?**
_Blocks: EC22-1._

> **Recommendation (Claude):** Waive it with a D-NNN explaining why.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **Safety and integrity metrics are not waivable**: M-04 (unprovenanced claims), M-06 (test contamination), M-11 (escapes), M-12 (injections). A miss there means fix and re-run P22-02. Quality metrics (M-01, M-02, M-03, M-05, M-07, M-08, M-09, M-10, M-13, M-14) can be waived only by a D-NNN that states the shortfall, the cause from the failure analysis, and the plan, signed off by the maintainer. Waived targets appear in the README as such.
>
> **Why:** "Waive with a D-NNN" for everything would let a safety failure ship with paperwork. Separating the non-negotiable from the aspirational keeps the integrity promises absolute while allowing honest partial quality.
>
> **Rejected:** everything waivable (safety by paperwork); nothing waivable (one hard metric blocks a mostly-good release forever).
>
> **Recommendation was:** refined (non-waivable set; waiver content rules).
>
> **Consequences:** EC22-1.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Agree. M-04, M-06, M-11 and M-12 can never be waived. A waived quality target is **logged as a limitation** in the evaluation report and the README.
>
> **Audit resolution (2026-10-03):** Never waived: M-04, M-06, M-11, M-12, M-14, PA-04, PA-06, PA-09. After a safety fix, only safety metrics are re-measured; quality comes from the first official pass (Q-AH3).
>
> **Audit resolution, round 2 (2026-10-03):** Only PA-06's lock-violation part is non-waivable; M-16 report-only; M-17, M-18 and M-19 gated and waivable, fixed in the freeze record (Q-AL5). A safety re-run uses a fresh holdout-d (Q-AL3).
>
> **Audit resolution, round 3 (2026-10-03):** M-14 is no longer waivable or simply gated: non-inferiority with δ = 0.10, and learning ships off if it misses (Q-AO1); the PA narrowing is recorded by D-NNN.

**Q7. Where are the results published?**
_Blocks: P22-06._

> **Recommendation (Claude):** `docs/ds/evaluation.md`.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** `docs/ds/evaluation.md` (full results, method, failures by role, ablations, waivers) **plus** a short results table in the README (P23-05) that links to it. Score files under `bench/results/p22/` are committed with the tag's hash. Rendered with md2html for reading.
>
> **Why:** A portfolio product's main claim is its measured quality, so the README must carry the numbers, while the detail lives where reviewers can check it.
>
> **Rejected:** results only in docs (invisible to visitors).
>
> **Recommendation was:** refined (README table, committed score files).
>
> **Consequences:** P22-06, P23-05.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Holdout results are committed aggregate-only (P12-05); per-task data stays with the maintainer; a report generator writes `docs/ds/evaluation.md` from aggregates, checked by CI (Q-AH2).

**Q8. How is the judge rechecked?**
_Blocks: P22-05._

> **Recommendation (Claude):** Reuse the P16 calibration result.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** A **fresh check**: ~~10 new items~~ 30 items (D-038) from P22's final-run outputs, labelled by two contributors as in P16. M-17 must hold for M-16 to be published in v1.0. If it fails, v1.0 reports the code metrics only and says the rubric score is unavailable.
>
> **Why:** The judge (or the analyst's output style) may have changed since P16, so reusing an old calibration would vouch for a judge on outputs it was never checked against. Ten items is enough to detect a drop without a full recalibration.
>
> **Rejected:** reusing P16's result (stale).
>
> **Recommendation was:** overturned (fresh items).
>
> **Consequences:** P22-05; about 1 hour of labelling per labeller.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: 30 items per D-038, stratified, blinded, with custody-holding labellers (Q-AH5).
>
> **Audit resolution, round 2 (2026-10-03):** M-17 is gated on 30 final-run items only; extended samples are reported separately.
>
> **Audit resolution, round 3 (2026-10-03):** Settlement by a third blinded custody-holding labeller (Q-AO3).

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                                        | Recommendation | Confidence | Needs maintainer |
| --- | ------------------------------------------------------------------------------------------ | -------------- | ---------- | ---------------- |
| Q1  | Tag-enforced freeze with pinned model ids                                                  | **overturned** | High       | no               |
| Q2  | Holdout-b + fresh holdout-c (5 tasks) = 9 unseen tasks (audit)                             | **overturned** | High       | no               |
| Q3  | 3 runs × 2 providers × 9 tasks; spend per Q-AL7 (audit)                                    | kept           | High       | **yes**          |
| Q4  | Ablations on dev, one provider, A/A control band (audit)                                   | **overturned** | Medium     | **yes**          |
| Q5  | Zero-target 0 in every run; medians per provider; descriptive provider differences (audit) | refined        | High       | no               |
| Q6  | Safety metrics non-waivable; quality waivers with content rules                            | refined        | High       | **yes**          |
| Q7  | Evaluation doc + README table + committed score files                                      | refined        | High       | no               |
| Q8  | 30-item judge recheck on final-run items (audit)                                           | **overturned** | High       | no               |

**Totals:** 8 answered · 1 kept · 3 refined · 4 overturned · 3 need the maintainer. The audit raised Q-AH1..Q-AH7 (`P22-audit.md`).

**Overturned recommendations:**

- Q1: a freeze by agreement can't be verified, and aliases can move between runs.
- Q2: four tasks can't support a v1.0 claim.
- Q4: the full ablation matrix would cost about $360 and expose the holdout repeatedly.
- Q8: a stale calibration vouches for a judge on outputs it never saw.

**For the maintainer:**

- ~~Q3: approve about $63 for the final evaluation runs?~~ Superseded by Q-AL7 (≈ $490 approval).
- ~~Q4: approve about $72 for the ablations on dev?~~ Superseded by Q-AL7.
- Q6: agree that M-04, M-06, M-11 and M-12 can never be waived?

**Cross-question changes made in the consistency pass:**

- Q2 needs P12's generator to vary surface forms (a follow-up proposed at sign-off).
- Q4's noise band comes from Q3's run-to-run spread.

**Facts verified:** the Agent SDK's `AgentDefinition.model` accepts full model ids (installed `sdk.d.ts`, round-3 audit); response model ids per call and Opus temperature 0 remain for docs-researcher in P22-00.
