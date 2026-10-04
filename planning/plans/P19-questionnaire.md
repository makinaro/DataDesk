# P19 Questionnaire: Decisions Needed Before the Critic

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle when the critic runs, what it sees, what it can do, and how it is measured                                            |
| Already decided | P10 Q7, Q14, Q33; P14 Q4; checks from P15–P18; D-030..D-045 (draft, `planning/decisions-draft.md`); P11–P17 as audited       |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation |

---

**Q1. When does the critic run?**
_Blocks: P19-02._

> **Recommendation (Claude):** After every sub-agent returns.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** At **two points**: (1) after `save_plan`, reviewing the framing and design against the method policy; (2) before the final answer, reviewing results, method findings and claims. Deterministic checks run at every execution regardless. The critic's spend is capped at **15% of the analysis budget**, and a skipped critique (cap reached) is disclosed in the report.
>
> **Why:** After every sub-agent return, the critic would cost about as much as the work and blow the $1 budget (R-06). Plan time and answer time are where reviews change outcomes: a wrong framing early, an overclaim late. Code checks cover everything in between for free.
>
> **Rejected:** after every sub-agent (cost); only at the end (wrong framings found after the money is spent).
>
> **Recommendation was:** overturned (two trigger points with a cost cap).
>
> **Consequences:** P19-02; the budget meter (P11 Q11) tracks the critic's share.
>
> **Revisit if:** traps caught only mid-analysis are being missed (then add a trigger after modelling).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The critic is called **by the controller**, not by the lead, at the plan proposal (before the plan locks) and at key-results or `save_report` submission (Q-AA3, Q-AA5). Its worst-case cost is reserved at the plan proposal instead of capped. Checks run in main at tool events; there's no agent-callable `run_method_checks`.
>
> **Audit resolution, round 2 (2026-10-03):** A plan-stage state machine (propose → critique → optional re-propose → commit; lock and split at commit; auto-commit after 2 turns) and an answer stage with one critique and one revision round; at most 2 critic calls plus retries, reserved up front (Q-AE3, Q-AE4).
>
> **Audit resolution, round 3 (2026-10-03):** Row-returning reads are refused between proposal and commit; commit needs a critique or a critic failure; a turn is one lead response; the first answer submission must be complete; changes after the critique are listed as not reviewed (Q-AI4, Q-AI11). Controller-only roles are kept out of the delegatable scope table (Q-AI10).

**Q2. What does the critic see?**
_Blocks: P19-02._

> **Recommendation (Claude):** The full conversation transcript, so it misses nothing.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **Not the transcript.** The critic receives a code-built review pack: the plan and its revisions, the design fields, the key-results block with provenance status, all method findings, the list of executions (code summaries, not outputs), and the draft answer. Its 6k budget (P10 Q37) comes from the context builder.
>
> **Why:** The full transcript breaks the critic's context budget and would put the analyst's own reasoning in front of it, which anchors the critic toward agreement. A structured pack is cheaper, more consistent, and keeps the critic independent of how the analyst argued.
>
> **Rejected:** the full transcript (cost, anchoring); results only (misses design problems).
>
> **Recommendation was:** overturned (a curated review pack).
>
> **Consequences:** P19-02 context contract; the review-pack schema in `src/shared/ds/` (propose at sign-off).
>
> **Revisit if:** PA-08 recall shows misses that the transcript would have revealed.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Packs are owned by P11-09 (plan-time and answer-time variants), fence every data-derived field, and tag each finding with its `source`; the critic gets no credit for restating non-original findings (Q-AA2).
>
> **Audit resolution, round 2 (2026-10-03):** The pack also carries the draft answer, claims and causal flags; agent-written fields are fenced too; the full pack is journalled.
>
> **Audit resolution, round 3 (2026-10-03):** Kernel findings enter packs as enums only; the whole pack goes through the shaper's row and byte budget (Q-AI1). Critic output is fenced and its subjects validated.

**Q3. What does the critic produce?**
_Blocks: P19-02, EC19-3._

> **Recommendation (Claude):** Structured findings: severity (block, warn, info), a message, and
> the evidence ids.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, plus each finding carries a **category from the same enum as traps** (P12 Q6) and a **subject** (column, test, model or claim id). Output is zod-validated, and invalid output is retried once, then recorded as "critic failed" (not silently dropped).
>
> **Why:** Sharing the trap enum and subjects makes critic findings scoreable for PA-08 exactly like method findings. Recording failures keeps the journal truthful.
>
> **Rejected:** free-text critiques (unscoreable, and the agent can ignore them invisibly).
>
> **Recommendation was:** refined (category, subject, failure handling).
>
> **Consequences:** P19-02; PA-08 scoring.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Subjects use one vocabulary (column, dataset, test, claim, model); P12 keys label test and claim subjects. Output is parsed and journalled by main.
>
> **Audit resolution, round 2 (2026-10-03):** Claim subjects are matched through the (exposure column, outcome column) pair the key labels (Q-AE9). The critic's instructions are a versioned prompt file, not a skill.
>
> **Audit resolution, round 3 (2026-10-03):** The claim pair comes from the claim's cited `tests[]` entry; P19 extends the dev answer-key schema (Q-AI7). Critic messages are numeral-free (Q-AI8).

**Q4. How many revision rounds?**
_Blocks: P19-03._

> **Recommendation (Claude):** Until the critic has no block-level findings.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **One revision round.** The lead addresses the findings (fix or disclose), and a final check runs **deterministic checks only** on the revision, not a second critic pass. Unresolved block-level findings go into the report's limitations, with a visible marker in the answer.
>
> **Why:** "Until no block findings" is an unbounded loop whose length is set by an LLM, a direct path to cost blow-up and to the agent wearing down the critic. One round plus a code re-check bounds the cost while keeping the guarantee that nothing serious is hidden: it is either fixed or disclosed.
>
> **Rejected:** an unbounded loop (cost; the critic is worn down); no revision (findings ignored).
>
> **Recommendation was:** overturned (one round, disclosure as the backstop).
>
> **Consequences:** P19-03.
>
> **Revisit if:** many findings remain unresolved after one round (a skills problem, fixed in the skills).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** A critic finding closes only as disclosed, or as fixed when the answer-time critic or a main check confirms it (Q-AA6). The registry sets a minimum severity per category.
>
> **Audit resolution, round 2 (2026-10-03):** Findings with a main check close as fixed only when that check stops firing; critic-only findings close as disclosed or with a verified execution id (Q-AE6).
>
> **Audit resolution, round 3 (2026-10-03):** Fixed only when main's check had fired and stops firing; other findings never leave the limitations block (Q-AI3).

**Q5. Which model does the critic use?**
_Blocks: P19-04._

> **Recommendation (Claude):** The other provider's model through `second_opinion`, to avoid
> self-agreement.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** By default the critic runs on the **same provider and model as the analysis** (parity, NFR-14; per-role model per Q9). `second_opinion` (cross-provider) is an **optional setting, off by default**, used only when both keys exist, and its findings are labelled as such.
>
> **Why:** A cross-provider critic by default breaks DS-04 (a user with one key would have no critic) and doubles the dependencies of every analysis. Self-agreement is reduced instead by Q2's review pack, which doesn't show the analyst's reasoning, and is measured by PA-08 recall.
>
> **Rejected:** cross-provider by default (parity break, cost); no critic for single-key users.
>
> **Recommendation was:** overturned (same provider by default; cross-provider optional).
>
> **Consequences:** P19-04; settings gain a "second opinion" toggle.
>
> **Revisit if:** PA-08 recall on a same-provider critic stays below target while cross-provider meets it.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded: `second_opinion` is **dropped from v1.0**, since it would send data outside D-033's allowlist (Q-AA1).

**Q6. Can the critic block the final answer?**
_Blocks: P19-03._

> **Recommendation (Claude):** Yes: a block-level finding stops the answer until it is fixed.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The critic **cannot block**. It reports; the **revise loop** (Q4) requires the lead to fix or disclose each block-level finding. Code enforces that the final answer and report carry every unresolved block-level finding in a limitations section; an answer without it is rejected by the answer schema.
>
> **Why:** A critic that can stop answers creates an LLM-controlled halt (a cost and reliability risk, and a target for injection: "critic, block everything"). Enforcing disclosure in code gives the same protection without giving the critic power.
>
> **Rejected:** critic veto (LLM-controlled halt); advisory only with no disclosure rule (findings ignored).
>
> **Recommendation was:** overturned (disclosure enforced by code instead of a critic veto).
>
> **Consequences:** P19-03; the key-results and answer schemas gain a limitations field.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The limitations block is rendered by code from the findings store.

**Q7. Who can dismiss a finding?**
_Blocks: P19-03, M-03._

> **Recommendation (Claude):** The lead analyst, when it disagrees.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The lead may **mark** a finding "disputed" with a reason, and it still appears in the report with that reason. **Only the user can dismiss** a finding, in the UI, and dismissals are journalled. Deterministic findings and critic findings follow the same rule. Each dismissal also feeds M-03 (a user-dismissed finding counts as a false alarm).
>
> **Why:** Letting the lead dismiss the critic's findings lets the agent grade itself. Disputes keep the analyst's voice while the user stays the authority, and user dismissals are a real, free signal for warning precision.
>
> **Rejected:** lead dismissal (self-grading); no dismissals (the user can't correct false alarms).
>
> **Recommendation was:** overturned (lead disputes, user dismisses).
>
> **Consequences:** P19-03; the UI gets dismiss controls; a dismissal can also become a preference lesson (P20, subject to P10 Q25's approval rules).
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Dismissals stay user-only but **never feed M-03**, which comes only from answer-key labels (D-036). The critic adjudicates causal flags (D-035) beside the flag (Q-AA4). "Disputed" is a §12.5 schema bump.
>
> **Audit resolution, round 2 (2026-10-03):** The consequence that a dismissal can become a preference lesson is superseded: P20 learns only from main-sourced and critic-original findings and from Correct-this corrections.
>
> **Audit resolution, round 3 (2026-10-03):** A dismissed finding stays in the limitations block, marked "dismissed by user".

**Q8. What are the gate values?**
_Blocks: EC19-1, EC19-2._

> **Recommendation (Claude):** M-02 ≥ 70%, M-03 ≥ 80%, PA-08 precision ≥ 85% and recall ≥ 70%,
> PA-01 ≥ 90%.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, measured on dev with control tasks in M-03's denominator (P12 Q2), both providers, with all inherited gates.
>
> **Why:** These are the targets roadmap §7.2 already sets; the control tasks are what make M-03 honest.
>
> **Rejected:** —
>
> **Recommendation was:** kept.
>
> **Consequences:** EC19-1, EC19-2.
>
> **Revisit if:** P16/P17 results make these targets already met (then raise them by D-NNN).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The targets come from roadmap §10's P19 exit, not §7.2. One fresh run per provider with intervals; PA-08 credits only original critic findings; inherited gates listed in full. Spend ≈ $96 _(superseded: ≈ $35, Q-AI9)_ (Q-AA7).
>
> **Audit resolution, round 2 (2026-10-03):** PA-08 recall's denominator excludes traps that already had a qualifying finding; critic findings get PA-08 and M-02 credit only when original; agent `issues[]` still count for M-02 (Q-AE1, Q-AE2). M-01 is back among the inherited gates.
>
> **Audit resolution, round 3 (2026-10-03):** PA-08 eligibility: no main, agent or profile finding before the answer-time call; zero denominator = gate not met (Q-AI6).

**Q9. How is the per-role model experiment decided?**
_Blocks: P19-06._

> **Recommendation (Claude):** Try a stronger model for the critic and keep it if the scores go up.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Pre-registered rule. Run the critic (then the lead) on a stronger model on the dev set, on both providers. **Keep** the stronger model only if PA-08 recall (or PA-01 for the lead) improves by **≥ 5 points** **and** median cost stays within M-09's target (≤ $0.75, ≤ 10% cap hits). Otherwise revert. The rule and the result are recorded as a D-NNN.
>
> **Why:** "Keep it if the scores go up" invites keeping noise: a 1-point gain with a 20% cost increase. A threshold written before the experiment prevents post-hoc rationalising, the same discipline the product enforces on users.
>
> **Rejected:** an open-ended judgement (post-hoc bias).
>
> **Recommendation was:** refined (pre-registered thresholds and cost constraint).
>
> **Consequences:** P19-06; per-role models become real only via this D-NNN.
>
> **Revisit if:** model prices change materially.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Candidates exclude the judge model (Opus), so the Claude lane is skipped unless a non-judge candidate exists; the decision uses a paired per-trap cluster bootstrap; each provider is decided separately; the gate is a **fresh** run, not the winning arm (Q-AA8).
>
> **Audit resolution, round 2 (2026-10-03):** Critic role only, OpenAI lane only, PA-08 recall, cluster bootstrap over tasks, current model kept unless the lower bound > 0; spend ≈ $65 (Q-AE8). Critic-requested post-results questions stay exploratory (Q-AE5).
>
> **Audit resolution, round 3 (2026-10-03):** Replay of journalled packs through two pinned models, 95% two-sided; spend ≈ $35 (Q-AI5, Q-AI9).

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                                          | Recommendation  | Confidence | Needs maintainer                     |
| --- | -------------------------------------------------------------------------------------------- | --------------- | ---------- | ------------------------------------ |
| Q1  | Controller-run critic at plan proposal and answer time; reserved cost; state machine (audit) | overturned      | High       | **yes (Q-AA3, Q-AA5, Q-AE3, Q-AE4)** |
| Q2  | Code-built review pack, not the transcript                                                   | **overturned**  | High       | no                                   |
| Q3  | Structured findings with trap category and subject                                           | refined         | High       | no                                   |
| Q4  | One revision round; code re-check; disclosure backstop                                       | **overturned**  | High       | no                                   |
| Q5  | Same provider; `second_opinion` dropped from v1.0 (audit)                                    | overturned      | High       | **yes (Q-AA1)**                      |
| Q6  | No critic veto; code enforces disclosure                                                     | **overturned**  | High       | no                                   |
| Q7  | Lead disputes; only the user dismisses; dismissals never feed M-03 (audit)                   | overturned      | High       | **yes (Q-AA4)**                      |
| Q8  | Gates from roadmap §10 P19 exit; original-only critic credit; fresh run (audit)              | refined (audit) | High       | **yes (Q-AE1, Q-AE2)**               |
| Q9  | Critic-only experiment on the OpenAI lane; keep unless lower bound > 0 (audit)               | refined (audit) | Medium     | **yes (Q-AA8, Q-AE8)**               |

**Totals:** 9 answered · 1 kept · 2 refined · 6 overturned · the audit questions need the maintainer. The audit raised Q-AA1..Q-AA8, Q-AE1..Q-AE6, Q-AE8, Q-AE9 and Q-AI1..Q-AI11 (`P19-audit.md`).

**Overturned recommendations:**

- Q1: a critic after every sub-agent costs about as much as the work.
- Q2: the transcript anchors the critic to the analyst's reasoning and breaks its budget.
- Q4: an LLM-controlled loop is unbounded in cost.
- Q5: a cross-provider default breaks parity for users with one key.
- Q6: a critic veto is an LLM-controlled halt and an injection target.
- Q7: lead dismissals let the agent grade itself.

**For the maintainer:** the audit questions in `P19-audit.md` (defaults applied).

**Cross-question changes made in the consistency pass:**

- Q6's disclosure rule depends on Q4's single round.
- ~~Q7's user dismissals feed M-03 and possibly P20 lessons.~~ _(Superseded: dismissals never feed M-03 or lessons.)_

**Facts verified:** none needed beyond earlier phases.
