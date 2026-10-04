# P19 Plan: Critic & Method Checks

| Field     | Value                                                                                                                                                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P19 of P10–P23 (roadmap §10)                                                                                                                                                                                                                                                                                   |
| Milestone | v0.2 Modeling                                                                                                                                                                                                                                                                                                  |
| Objective | The agent catches its own methodological mistakes before the user does                                                                                                                                                                                                                                         |
| Entry     | P18 closed (P19 inventories P15–P18 checks and inherits P18's gates); **the maintainer's spend approval for this phase before session 5**, as a maintainer-signed tag (P12 Q-K1; D-034's amount rules)                                                                                                         |
| Spend     | Planned **≈ $35** (Q-AI9): a **fresh** gate run on both providers (≈ $30, judge included per D-034; each pass ≤ $15) and the critic-model experiment as a **replay** of that run's journalled packs through both models on the OpenAI lane (≈ $2); this supersedes the ≈ $96 (Q-AA7) and ≈ $65 (Q-AE8) figures |
| Size      | L (7 sessions)                                                                                                                                                                                                                                                                                                 |
| Branch    | `phase-19-critic`                                                                                                                                                                                                                                                                                              |
| Inputs    | Check registry from P15–P18 · D-033, D-035, D-036, D-038 · P10 Q7, Q14, Q33 · P11-09 (review pack) · P14 (plan locks, controller) · P16 (`studyDesign`, probe)                                                                                                                                                 |
| Outputs   | D19-1 registry inventory and plan/answer triggers · D19-2 critic call and versioned critic prompt · D19-3 revise loop and code-rendered limitations · D19-4 per-role model experiment · D19-5 bench results                                                                                                    |
| Status    | Audited (3 rounds, `P19-audit.md`); maintainer defaults pending (Q-AA, Q-AE, Q-AI)                                                                                                                                                                                                                             |

**Rule for the phase:** review and revision. The critic reads and judges; it never changes data,
models or results. `second_opinion` (a cross-provider critic) is **dropped from v1.0** as a critic; the existing `datadesk-mcp` tool stays and remains disabled during analyses per P11 Q-G2: it would
send analysis data to a provider outside D-033's allowlist (P11 Q-G2) (Q-AA1).

**How the critic runs (P19 audit, rounds 1–3):** the **conversation controller** calls the
critic as its own model call, with **no tools**, through a state machine (Q-AE3, Q-AE4):

- **Plan stage:** `propose_plan` → `critiqued` (the critic reviews the proposal) → the lead may
  re-propose **once** → `commit_plan`, a separate agent call. **The plan lock and the split happen
  at commit** (amending P14-11's "at the first `save_plan`"). **While the state is `proposed` or
  `critiqued`, the controller refuses row-returning reads** (metadata and the profile stay
  available), so nothing can count as a pre-plan read for M-06 and the plan can't be tuned to
  outcome data (Q-AI11). `commit_plan` is refused unless the state is `critiqued` or
  `critic_failed`. A re-proposal is **not** critiqued again; what it changed is diffed by code and
  listed as "not reviewed by the critic". If the lead doesn't commit within **2 turns** (a turn is
  one lead model response), the controller commits the last proposal and journals it.
- **Answer stage:** the first submission of the key-results block or `save_report` triggers
  **one** answer-time critique, but only once it passes **schema completeness** (every committed
  plan question has an answer entry); the lead gets **one** revision round; a re-submission runs
  main's checks only. Code diffs the critiqued version against the final one, and claims and
  `tests[]` entries added after the critique appear in limitations as "not reviewed by the
  critic" (Q-AI4).
- At most 2 critic calls per analysis, plus one retry each on invalid output (so at most 4); the
  **reservation** at plan proposal is 4 × (D-039's 6k critic budget × input price + the call's
  `max_tokens` × output price) plus 2 minutes of active time. A call journalled as "started" with
  no "finished" is **charged at its worst case**, not released; unused reservation is released.
- The critic's instructions are a **versioned prompt file built by code**
  (`src/main/analysis/critic/prompt.md`), covered by the parity test; there is no
  `method-review` skill (a tool-less call can't load one). **Controller-only roles** (the critic,
  P20's lesson phraser) live in their own table, `src/main/agent/controllerRoles.ts`, with the
  per-role model field; they are **excluded from `buildSubagents`** and the OpenAI handoffs, and an
  init-guard test asserts the critic is not a delegatable agent (Q-AI10).
- **Critic output is untrusted:** its messages are fenced in the lead's context like other
  data-derived text; its `subject` values must resolve to known column, dataset, test, claim or
  model ids, or the finding is rejected; critic-targeted injection fixtures count toward M-12.

- **Plan stage:** `propose_plan` → `critiqued` (the critic reviews the proposal) → the lead may
  re-propose **once** → `commit_plan`, a separate agent call. **The plan lock and the split happen
  at commit** (amending P14-11's "at the first `save_plan`"). If the lead doesn't commit within 2
  turns, the controller commits the last proposal and journals it.
- **Answer stage:** the first submission of the key-results block or `save_report` triggers
  **one** answer-time critique; the lead gets **one** revision round; a re-submission runs main's
  checks only, never a second critique.
- At most 2 critic calls per analysis, plus one retry each on invalid output (so at most 4); the
  **reservation** at plan proposal is 4 × the worst-case call cost (pack tokens × input price +
  the call's `max_tokens` × output price) plus 2 minutes of active time; it is released if unused
  or after a crash.
- The critic's instructions are a **versioned prompt file built by code**
  (`src/main/analysis/critic/prompt.md`), covered by the parity test; there is no
  `method-review` skill (a tool-less call can't load one). Its per-role model field lives in the
  scope table (principle 3).

**Sources (roadmap §8.3 principle 7, Q-AA2 reworded in round 2):** every finding carries `source ∈
{main, kernel, probe, agent, critic}`. The source filter decides **PA-08 credit and P20 lessons**,
not M-02: the agent's own `issues[]` (`source: agent`) and the profiler's `profile_issues[]` keep
counting for M-02 and PA-03 as before (P12 Q6, P15). A critic finding gets PA-08 **and** M-02
credit only if it is **original**: no prior finding from **main, agent or profile** on the same
category and subject before that critic call (kernel and probe findings are advisory and don't
pre-empt credit) (Q-AE1, Q-AE2, Q-AI6). The counting unit everywhere is one finding per (category,
subject) per analysis; the earliest source wins, ordered by journal sequence number.

**Packs carry no kernel text (round 3, Q-AI1):** `source: kernel` findings enter a review pack
only as `{checkId, category}` enums, never their advisory text (P15: advisory is UI-only). The
whole pack is passed through the egress shaper's row and byte budget (D-033) and charged to the
analysis; a test with a forged advisory carrying 50 rows must show none reach the provider.

---

## 1. Inherited Decisions and Inputs

| Source                            | What it forces in P19                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P15 Q5, P16 Q3, P17 Q8–Q9, P18 Q1 | Main-side checks from the shared registry (P15–P18 audits); kernel findings are advisory (`source: kernel`, roadmap §8.3 principle 7) |
| D-035, P10 Q14                    | Causal wording flagged by code; the critic adjudicates (its verdict is shown beside the flag; only the user dismisses)                |
| D-036                             | M-03 from answer-key labels only; fixed runs; task-bootstrap intervals                                                                |
| D-033, P11 Q-G2                   | No cross-provider egress: `second_opinion` dropped                                                                                    |
| D-038                             | The judge model can't be an experiment candidate; the floor applies at the gate                                                       |
| P14 Q4, P14-11                    | Plan locks at commit; revisions add questions only                                                                                    |
| P10 Q7                            | The per-role model field; experiment here                                                                                             |
| P10 Q33                           | PA-01 and PA-08 become gates                                                                                                          |

## 2. Session Plan

| Session | Work items    | Output                                                                     |
| ------- | ------------- | -------------------------------------------------------------------------- |
| 1       | P19-01        | Registry inventory; sources; minimum severities; trigger points            |
| 2       | P19-02        | Critic call, review packs, structured output; docs-researcher checks       |
| 3       | P19-03        | Revise loop, code-rendered limitations, journal entry types, UI dismissals |
| 4       | tests         | Parity, laundering and lock tests                                          |
| 5–6     | P19-06        | Per-role model experiment (paid)                                           |
| 7       | P19-05, audit | Fresh gate run (paid); summary                                             |

## 3. Work Item Breakdown

### P19-01 Check registry

- [ ] `src/main/checks/registry.ts` (created in P15) gains an **inventory** of every inherited check id (P15–P18), each with trigger point, `source`, **minimum severity per category** (the critic can't downgrade below it) and evidence fields
- [ ] A **plan-revision-after-results** check, where "results" means any row-returning read of the outcome's dataset (P14-11's definition, joins included); questions added after results **stay exploratory** whoever asked (Q-AE5); the critic-requested tag is dropped (no metric consumed it)
- [ ] Checks run in main at tool events, never as an agent tool; there is no agent-callable `run_method_checks`

**Done when:** every inherited check id is listed with a fixture.

### P19-02 Critic

- [ ] The controller-run critic call (header) on both providers, with a context contract (D-039) and a parity test (NFR-14); the critic **adjudicates causal flags** (supported / unsupported, with a reason) as D-035 says, while dismissal stays user-only
- [ ] **Review packs** (schemas owned by P11-09, a plan-time and an answer-time variant): the plan or proposal, design fields, the draft answer, key-results block with provenance status, claims and causal flags, findings with `source`, code summaries of executions (counts and statuses, no rows); **every** data-derived or agent-written field (plan text, prose, dispute reasons) is fenced as untrusted (§8.5 rule 4); the full pack is journalled, not only its hash; evidence output ids in critic findings are validated by main
- [ ] Structured output (Q3): category from the trap enum and a **subject from one vocabulary**: column, dataset, test (`tests[]` id), claim (claim id) or model id. **Claim subjects (Q-AE9, Q-AI7):** main resolves a claim to the **(exposure column, outcome column)** pair from the claim's cited `tests[]` entry (the locked group and outcome columns); D19-7 extends the P12 answer-key schema and generator to label that pair on causal traps and the test subjects, re-hashing the dev keys under D-036's dev-only revision rule. Critic messages are **numeral-free**: the output schema rejects numeric tokens in `message` (retry, then "critic failed"), so critic text can't break M-04 (Q-AI8)

**Done when (P19-02):** the critic produces valid output on fixtures on both providers, the pack row-budget test passes, and the init guard rejects the critic as a sub-agent.

- [ ] **Session 2, before building the call** — docs-researcher: the Claude path is a direct `@anthropic-ai/sdk` messages call with `max_tokens` (a single call can't be stopped mid-flight, so it is bounded up front); `@anthropic-ai/sdk` moves from devDependencies to **dependencies** (`--save-exact`, version and source recorded in a D-NNN), since electron-builder doesn't package dev dependencies; the OpenAI path is the Agents SDK with structured output; both covered by the parity test

### P19-03 Revise loop

- [ ] One round (Q4). **Closing a finding (Q-AE6, Q-AI3):** a finding closes as **fixed** only when **main's check had fired on that subject and no longer fires**; every other finding (including an original critic finding in a category main covers) is critic-only: it closes as **disclosed** and **never leaves the limitations block**; the lead may add "reports a fix in execution X (not verified)"; the lead's narrative never closes anything
- [ ] The **limitations block is rendered by code** from the findings store, not written by the agent (Q6)
- [ ] The lead may mark a finding "disputed" with a reason (a §12.5 schema bump with migration, which also adds the journal sequence number, an `open` state, the critic's causal verdict and an unverified-fix note); only the user dismisses, through UI controls and a zod IPC channel (rule 3); a dismissed finding **stays in the limitations block marked "dismissed by user"** (D-035); dismissals are journalled and **never feed M-03** (Q7)
- [ ] Journal entry types: plan-stage and answer-stage state transitions, critic started and finished, the pack, raw output, critic failed, retries, disputes, dismissals; a "started" with no "finished" after a crash is recorded as "critic failed" (no re-run, no double payment); Continue resumes a pending stage; a provider outage records "critic failed", disclosed; the partial report on any stop lists unresolved findings; dispute reasons inside the limitations block count toward M-04 (critic messages are numeral-free by schema), and rubric criteria score only the agent's prose slots

**Done when:** the loop's states each have a test.

### P19-05 Bench

- [ ] A **fresh** gate run on both providers with the fixed configuration (Q8); the critic-failed rate is reported in `bench/results/p19/`

**Done when:** the gate run is committed with intervals.

### P19-06 Per-role model experiment

- [ ] Pre-registered in a D-NNN **before** the run (Q9, Q-AA8, Q-AE8, Q-AI5): **critic role only**, OpenAI lane, both model ids **pinned**; the **journalled answer-time packs from the P19-05 run are replayed** through the current and the candidate model, so the comparison is exactly paired and the lead's behaviour is held fixed; metric: PA-08 recall as in §5; cluster bootstrap over tasks, **95% two-sided**; the candidate is kept only if the lower bound of the difference is > 0, otherwise the current model stays and the result is reported as indicative (underpowered on about 12 dev traps, and the summary says so); cost check against M-09's v1.0 target (≤ $0.60 per task)

**Done when:** the D-NNN records the result.

## 4. Deliverable Map

| Deliverable | File path                                                                                                                                                                                                                                                                                                | Produced by | Satisfies      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------- |
| D19-1       | `src/main/checks/registry.ts` (inventory, sources, severities)                                                                                                                                                                                                                                           | P19-01      | EC19-3         |
| D19-2       | `src/main/analysis/critic/` (call, prompt file, packs, parsing, claim-subject resolution); `src/main/agent/controllerRoles.ts` with the per-role model field; `@anthropic-ai/sdk` in dependencies                                                                                                        | P19-02      | EC19-1, EC19-2 |
| D19-3       | `src/main/analysis/controller/` (plan and answer state machines, critic reservation); `src/main/provenance/limitations.ts`; dismiss controls in `src/renderer/src/analysis/`, a preload method and a channel in `src/shared/ipc/contract.ts`; tests under `tests/main/analysis/critic/` and `tests/e2e/` | P19-03      | EC19-3         |
| D19-4       | `docs/ds/p19-model-experiment.md`; per-role model D-NNN                                                                                                                                                                                                                                                  | P19-06      | DoD-3          |
| D19-5       | `bench/results/p19/`                                                                                                                                                                                                                                                                                     | P19-05      | EC19-1, EC19-2 |
| D19-6       | Tests (laundering, lock, parity, loop states, pack row budget, init guard); §12.5 migration; review-pack schemas in P11-09; `docs/ds/07`, `08` rows                                                                                                                                                      | all         | DoD-2          |
| D19-7       | `propose_plan`/`commit_plan` across `src/mcp-server-ds/`, the init-guard allowlist (NFR-02), the OpenAI function tools, the P15–P18 skills and their tests; P12 answer-key schema and generator (claim pair, test subjects)                                                                              | P19-02, 03  | EC19-1, EC19-2 |

## 5. Exit Checklist

| EC / DoD  | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidence             | State |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----- |
| EC19-1    | M-02 ≥ 70% (critic findings counted only if original); **PA-08 recall ≥ 70%**: eligible traps are those with **no main, agent or profile finding before the answer-time critic call**; credit when the critic flagged the trap first in either call; a zero denominator is reported `n/a` and the gate is **not met**; n is reported next to the interval; traps caught first by main are reported separately with the **echo rate** (critic findings matching a prior finding ÷ critic findings); one fresh run per provider with task-bootstrap intervals | `bench/results/p19/` | Open  |
| EC19-2    | M-03 ≥ 80% (answer-key labels only); PA-08 precision ≥ 85% with the same counting unit as M-03 (one finding per category and subject); PA-01 ≥ 90% on the committed plan                                                                                                                                                                                                                                                                                                                                                                                    | same                 | Open  |
| EC19-3    | Every finding traces to a check id, a critic message, an `issues[]` or `profile_issues[]` entry, or a probe record in the journal                                                                                                                                                                                                                                                                                                                                                                                                                           | unit + bench         | Open  |
| Inherited | M-01, M-02 (above), M-03 (above), M-04 = 0, M-19 ≥ 90%, M-06 = 0, M-07 ≥ 0.90, M-08 (P18 smoke), M-09 (median ≤ $0.75, ≤ 10% cap hits), M-10, PA-02..PA-07, PA-09's unprovenanced half = 0, M-11 = 0 (per build), M-12 = 0, no unresolved judge-floor breach                                                                                                                                                                                                                                                                                                | bench                | Open  |
| DoD 1–8   | As roadmap §17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                    | Open  |

## 6. Phase Risks

| Risk                             | Mitigation                                                      |
| -------------------------------- | --------------------------------------------------------------- |
| The critic costs too much (R-06) | Reserved cost at plan proposal; two trigger points only         |
| The critic rubber-stamps         | PA-08 recall credits only original findings                     |
| The critic nitpicks              | M-03 on control tasks; minimum severities                       |
| Tuned and gated on dev (R-08)    | The summary says so; holdout evidence comes only at P20 and P22 |

## 7. Hand-off to P20

- `main`-sourced findings (with `source`, from `src/main/checks/registry.ts` and the findings store) are lesson sources; kernel, probe and agent findings never are
- A **critic-original** finding becomes a lesson candidate **only after confirmation**: the user confirms it, or a later main check fires on the same subject (Q-AI2)

- `main`-sourced and critic-original findings (with `source`) are the main source of lessons; kernel, probe and agent findings never are
