# P10 Audit: Blind Review and Resolution

| Field   | Value                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Auditor | `plan-auditor` agent (context-blind, read-only), run 2026-10-03                                                                            |
| Scope   | `P10-requirements-and-scope.md` (DS-01..DS-22, P10-01..P10-09) and the answered `P10-questionnaire.md`                                     |
| Verdict | **BLOCKED (decision needed)**. Critical 1 · Major 19 · Minor 14 · Nit 1                                                                    |
| Status  | Findings that need no decision are resolved (table at the end); six maintainer questions are open; a re-audit runs after they are answered |

---

## Report

### A. Architecture

- **[Critical] The review gate has no independent owner.**
  - The PR author's own agent produces the verdict file, and CI checks only that it exists.
  - The aggregation and the "blocker fired" decision come from an LLM, which breaks "code, not the agent".
  - The criterion files are editable by the PR they review.
  - With human approval removed, this forgeable file is the only control on work-item code.
  - **Proposed design:** criterion agents emit zod-validated JSON. A Node script aggregates and writes the verdict, with the reviewed SHA, diff hash and criterion-file hashes. CI recomputes the hashes, checks the criterion files against `main`, and runs the mechanical checks itself. A protected-path list requires maintainer approval.
- **[Major] The verdict is pinned to the head commit, which can't match.** Committing the verdict creates a new head. Pin it to the reviewed SHA, and allow only the verdict file to change after it.

### B. Decision compliance

- **[Major] DS-18 vs DS-22.** DS-18 says "reviewed by someone other than the author", and DS-22 replaces that rule. Supersede DS-18's clause with a D-NNN.
- **[Major] DS-10 is enforced by a prompt, against D-008.** `Bash(git *)` is allowed, and only force-pushes ask. Put `git push*` under `ask` in the project settings.
- **[Minor] Q12 amends D-010 and D-029** (no approval prompt for derived data; an extended delete rule) without its own D-NNN.
- **[Minor] Criterion 01 adds answer-key reads to CLAUDE.md rule 6** without changing the rule.

### C. Recommendation challenges

- **[Major] Q25:** a typed effect constrains the enum, not the text. An auto-applied lesson's free text can still suppress a check, and `prefer_method` vs `change_default` has no boundary.
- **[Major] Q14 and M-03:** the critic adjudicates causal flags, so M-03 validity comes from an agent.
- **[Major] Q15:** the lock is stated per tool, not at the data level; repeated CV after selection is biased; the "≥ 200 test rows" rule is dead logic for n < 1,000; CV folds aren't required to be group- or time-aware.
- **[Major] Q17:** an 8-minute halving search can't run inside a 120 s execution unless kernel state persists.
- **[Minor] Q13:** families can be gamed by how the plan splits questions; "declared weights" is undefined.
- **[Minor] Q27:** the agent can clear staleness itself; "contributor" should be "user".
- **[Minor] Q8:** "1M × 50" doesn't say whether it is a cell product or two bounds.

### D. Buildability

- **[Major] Q37/Q38:** the Claude lead's 16k budget can't be enforced while the CLI owns the transcript. Make it report-only until P11 verifies.
- **[Minor]** The tier→model map is unnamed; the verdict has no schema; the 2 GB soft cap has no defined behaviour.

### E. Operability

- **[Major] DS-21 has no ledger, and the cap can be bypassed.**
  - The runner caps one pass, not the phase.
  - `--confirm` lets the contributor override.
  - Spend is spread across contributors' keys, so no process sees the total.
  - Criterion 08 isn't a blocker.
- **[Major] Nothing is required to pass before merging.** CI isn't a required status check.
- **[Minor] The derived-data disk cap has no number**, and a full disk mid-write isn't specified.

### F. Measurability

- **[Major] Metrics that reward the wrong behaviour:**
  - M-04 is met by marking everything unverified.
  - M-02 counts "explicit statements".
  - M-08 is scored on the agent's own backtest.
  - M-03 is circular through the critic.
- **[Major] Committed result summaries can't be checked** without human review. Commit run journals, and have CI re-score them offline.
- **[Major] Self-reported or single-trial exit criteria:**
  - EC10-6 rests on notes written by the closing agent.
  - EC10-7 rests on P10's own documents.
  - EC10-8 is one planted case on one run of a nondeterministic LLM.
- **[Major] Answer-key and holdout custody:**
  - Coding agents can read `bench/answer-keys/`.
  - Anyone with the committed seed can regenerate the holdout.
  - Q22's "no LLM reads a key" contradicts the evaluation model reading keys.

### G. Safety (attack sequences)

1. **Gate forgery (Critical):** an agent edits the verdict file or a criterion's frontmatter, CI passes, and the PR merges.
2. **[Major] Injected `n/a`:** a comment in the diff talks a blocker criterion into `n/a`, so nothing fires.
3. **[Major] Row-cap leak:**
   - `to_csv()` of 150 rows fits in 8 KB, and there is no per-analysis row bound.
   - The remote Hub search and `second_opinion` are egress channels the data policy doesn't list (NFR-07).
4. **[Major] Planted lesson** through auto-applied free text (Q25).

### H. Statistical validity

- **[Major] Gates on point estimates from 12 dev tasks.** M-14 on 4 tasks is a coin flip. Lessons stored from holdout-half runs can contaminate P22.
- **[Minor] M-07's ratio direction** inverts for lower-is-better metrics.

### I. Consistency

- **[Major] Stale summary rows:** Q30 and Q41 contradict the maintainer decisions and would be copied into D-NNNs.
- **[Major] Plan scope narrower than the roadmap:** NFR-16/17, M-16..M-18 and PA-01..PA-11 are missing from P10-02 and P10-03.
- **[Minor]** Q39 routes enforcement to `code-reviewer`, which P10-09 dissolves; the header says DS-01..DS-20; the score bands read like gates while the score is advisory.
- **[Nit]** Roadmap §5 shows AC-01 and AC-02 merged into one row.

### J. Completeness

- **[Minor] Answer consequences without tasks:** issue sync (Q43), the npm pin (Q29), the answer-key hook, CI as a required check.
- **[Minor] P10's own spend** under DS-21 isn't stated.

### K. Vagueness, scope and effort

- **[Minor] Size and terms:** size S is too small, so re-baseline to M. "Clean config", "time column is the index" and "same lesson" are undefined.

### Verified (held)

The Facts verified list, Q2, Q6, Q19's arithmetic, Q20, Q24, Q36, Q45 and DS-21's consistency.

---

## Resolution (2026-10-03)

| Finding                                                   | Severity | Resolution                                                                                                                                                                                                                                                                                                                                                                                                      | Where                                     |
| --------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Review gate forgeable; LLM aggregation; criteria editable | Critical | P10-09 redesigned: criterion agents emit zod JSON; `scripts/review-aggregate.mjs` computes the verdict (`verdict.json` with reviewed SHA, diff hash, criterion hashes); CI recomputes hashes, checks criteria against `main`, runs mechanical checks itself; code decides when a blocker applies and refuses `n/a` from it. **Protected paths and CI-computed verdicts need maintainer decisions (Q-A1, Q-A2)** | P10 plan P10-09                           |
| Verdict pinned to head commit                             | Major    | Verdict names the reviewed SHA; CI allows only `docs/reviews/**` to change after it                                                                                                                                                                                                                                                                                                                             | P10-09                                    |
| DS-18 vs DS-22                                            | Major    | Superseding D-NNN at sign-off (Q-A4)                                                                                                                                                                                                                                                                                                                                                                            | P10-01                                    |
| DS-10 by prompt, not hook                                 | Major    | P10-07 task: `git push*` moved to `ask` in `.claude/settings.json`, so every push asks for approval (needs the maintainer's approval of the settings change)                                                                                                                                                                                                                                                    | P10-07                                    |
| Q12 amends D-010/D-029                                    | Minor    | Sign-off writes a D-NNN that references both                                                                                                                                                                                                                                                                                                                                                                    | P10-01, Q12 resolution                    |
| Rule 6 widened silently                                   | Minor    | P10-07 task: CLAUDE.md rule 6 gains `bench/answer-keys/`                                                                                                                                                                                                                                                                                                                                                        | P10-07                                    |
| Q25 free text in auto-applied lessons                     | Major    | Auto-applied lessons are rendered by code from structured fields; agent text only in the fenced advisory block; `prefer_method` limited to the method policy's acceptable set                                                                                                                                                                                                                                   | Q25 resolution                            |
| Q14/M-03 critic adjudication                              | Major    | Dismissals stay visible in the report; M-03 validity comes from answer-key-labelled flags only                                                                                                                                                                                                                                                                                                                  | Q14 resolution                            |
| Q15 lock, nested CV, dead rule, folds                     | Major    | Data-level invariant; nested CV for n < 1,000 without a separate test set; group- and time-aware folds                                                                                                                                                                                                                                                                                                          | Q15 resolution                            |
| Q17 vs 120 s                                              | Major    | Each search ≤ 100 s per execution; ≤ 4 searches inside the 8-minute box, using the stateful kernel (P13 Q6)                                                                                                                                                                                                                                                                                                     | Q17 resolution                            |
| Q13 families, weights                                     | Minor    | Benchmark families come from the task; "declared" = by user, accepted notes or task (P16 Q5)                                                                                                                                                                                                                                                                                                                    | Q13 resolution                            |
| Q27 staleness cleared by agent                            | Minor    | Only the user re-validates stale notes                                                                                                                                                                                                                                                                                                                                                                          | Q27 resolution                            |
| Q8 bounds                                                 | Minor    | ≤ 50M cells and ≤ 200 columns                                                                                                                                                                                                                                                                                                                                                                                   | Q8 resolution                             |
| Q37/Q38 Claude budget unenforceable                       | Major    | Claude lead budget is report-only until P11 verifies; M-18 for it is report-only                                                                                                                                                                                                                                                                                                                                | Q37 resolution                            |
| Tier map, verdict schema, soft cap                        | Minor    | `.claude/agents/reviewers/tiers.json`; verdict zod schema; soft cap = warning plus forced `gc`                                                                                                                                                                                                                                                                                                                  | P10-09, Q10 resolution                    |
| DS-21 ledger and bypass                                   | Major    | Committed `bench/spend/<phase>.jsonl` written by the runner; refusal at the phase total; criterion 08 becomes a blocker. **Who approves overruns: Q-A3**                                                                                                                                                                                                                                                        | P10-09, Q23 resolution                    |
| CI not required                                           | Major    | P10-08 task: CI and the verdict check become required status checks (verify plan support)                                                                                                                                                                                                                                                                                                                       | P10-08                                    |
| Derived disk cap                                          | Minor    | Already numbered in P15 Q7 (2 GB per analysis); atomic writes make a full disk fail cleanly                                                                                                                                                                                                                                                                                                                     | Q12 resolution                            |
| M-04 / M-02 / M-08 / M-03 incentives                      | Major    | Proposed M-19 provenanced fraction (≥ 90% MVP, ≥ 95% v1.0); M-02 structured fields only (P12 Q6); M-08 on the key's held-back horizon; M-03 from labelled flags                                                                                                                                                                                                                                                 | Q20, Q14 resolutions; roadmap at sign-off |
| Unverifiable result summaries                             | Major    | Run journals (synthetic and public data only) committed with summaries; CI re-scores offline                                                                                                                                                                                                                                                                                                                    | Q44 resolution                            |
| EC10-6/7/8 evidence                                       | Major    | EC10-6 walkthrough by a contributor other than the PR author, with an issue per snag; EC10-7 by a maintainer decision line; EC10-8 a fixture per CLAUDE.md rule, each detected 3 of 3                                                                                                                                                                                                                           | P10 plan §5                               |
| Answer-key/holdout custody; judge reads keys              | Major    | Private-paths hook extended to `bench/answer-keys/` (P10-07); Q22 wording clarified. **Holdout custody: Q-A5**                                                                                                                                                                                                                                                                                                  | P10-07, Q22 resolution                    |
| Injected `n/a`                                            | Major    | Code decides when a blocker criterion applies from diff paths, and refuses its `n/a`                                                                                                                                                                                                                                                                                                                            | P10-09                                    |
| Row-cap leak and egress                                   | Major    | Only structured results carry rows (counted by code; ≤ 20 per call, ≤ 200 per analysis); stdout capped at 2 KB; egress allowlist in `docs/ds/03`                                                                                                                                                                                                                                                                | Q10 resolution                            |
| Gates on few tasks; M-14 on 4 tasks                       | Major    | **Q-A6.** M-14 in P20 becomes report-only; lesson store reset before P22                                                                                                                                                                                                                                                                                                                                        | Q19 resolution                            |
| M-07 direction                                            | Minor    | Defined as higher-is-better (reference ÷ agent for loss metrics)                                                                                                                                                                                                                                                                                                                                                | roadmap at sign-off                       |
| Stale summary rows                                        | Major    | Summary table and maintainer list updated                                                                                                                                                                                                                                                                                                                                                                       | Questionnaire summary                     |
| Scope narrower than roadmap                               | Major    | P10-02 covers NFR-01..17 plus Q45's; P10-03 covers M-01..M-19 and PA-01..PA-11                                                                                                                                                                                                                                                                                                                                  | P10 plan                                  |
| Q39 routing, header, score bands                          | Minor    | Q39 → criterion 08; header DS-01..DS-22; bands relabelled as advisory                                                                                                                                                                                                                                                                                                                                           | Q39 resolution, P10-09                    |
| AC-01/AC-02 merged row                                    | Nit      | Fixed                                                                                                                                                                                                                                                                                                                                                                                                           | roadmap §5                                |
| Tasks missing for issue sync, npm pin, hook, required CI  | Minor    | Added to P10-07 and P10-08                                                                                                                                                                                                                                                                                                                                                                                      | P10 plan                                  |
| P10's own spend                                           | Minor    | DS-21 covers pay-per-use API keys; review-suite runs through contributors' Claude Code are not API spend unless run on a key                                                                                                                                                                                                                                                                                    | P10 plan header                           |
| Size and undefined terms                                  | Minor    | Size re-baselined to M; terms defined in the Q15, Q26 and Q44 resolutions                                                                                                                                                                                                                                                                                                                                       | P10 plan, resolutions                     |

## Maintainer answers to the audit questions (2026-10-03)

| Q                           | Answer                                                              | Applied as                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-A1 Protected paths        | "Claude should not auto-merge PRs. It should be merged by a human." | **DS-23**: humans merge every PR and agents never merge (deny rule in `.claude/settings.json`). Protected paths need a maintainer's approval through CODEOWNERS (P10-07, P10-08) |
| Q-A2 CI as the referee      | No concerns                                                         | CI recomputes and checks the verdict; required status checks. The repository is **public** (verified 2026-10-03), so branch protection is free (P10-08, P10-09)                  |
| Q-A3 Budget overruns        | The maintainers                                                     | Only a maintainer may approve going over a phase's approved spend, recorded as a D-NNN. `--confirm` can't override (Q23 resolution)                                              |
| Q-A4 Supersede DS-18 clause | Agree                                                               | A superseding D-NNN at sign-off (P10-01)                                                                                                                                         |
| Q-A5 Holdout custody        | Yes                                                                 | Maintainers hold the holdout seeds (not committed); holdout keys are generated only for P20 and P22; the bench-only evaluation model may read keys (Q22 resolution)              |
| Q-A6 Gate statistics        | Agree                                                               | Gates pass on the median, with the interval reported; the P12 Q7 noise rule; M-14 report-only in P20 (Q19 resolution)                                                            |

Re-audit required: yes.

---

## Round 2 re-audit (2026-10-03)

**Verdict: BLOCKED (decision needed).** Critical 1 · Major 12 · Minor 8. Round-1 verification: 15
resolved, 18 partial, 0 not found.

### New findings (summary)

| ID   | Severity | Finding                                                                                                                                                                                            |
| ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N-1  | Critical | The gate is still forgeable. Criterion JSON is written on the author's machine. CODEOWNERS misses the files that implement rules 1–6 and every file CI executes. The author may merge their own PR |
| N-2  | Major    | DS-22 still says "head commit" and "no human approval", against P10-09 and DS-23                                                                                                                   |
| N-3  | Major    | DS-10 and roadmap §18.3.5 still say "otherwise pushes", against the `ask` rule                                                                                                                     |
| N-4  | Major    | Allow-listed runners (`npm run *`) and the GitHub API bypass ask/deny rules; humans and agents share one token                                                                                     |
| N-5  | Major    | One maintainer + CODEOWNERS deadlocks on their own PRs; criterion hashes are compared to `main` during bootstrap                                                                                   |
| N-6  | Major    | Rows still leave through per-execution stdout, stderr and long cells; HF search can carry data                                                                                                     |
| N-7  | Major    | The spend ledger can't enforce a phase total across contributors; it is unprotected; DS-21 vs Q-A3 wording                                                                                         |
| N-8  | Major    | "CI re-scores offline" can't run without keys; holdout seeds are maintainer-held                                                                                                                   |
| N-9  | Major    | The retry-on-near-miss rule is optional stopping; 12 tasks gives about ±13 pp                                                                                                                      |
| N-10 | Major    | The agent can opt out of time-aware validation by not naming a time column                                                                                                                         |
| N-11 | Major    | M-19's denominator can be shrunk by the agent                                                                                                                                                      |
| N-12 | Major    | pending §4 misses roadmap changes that sign-off needs                                                                                                                                              |
| N-13 | Minor    | The answer-key guard is a textual deny-list                                                                                                                                                        |
| N-14 | Major    | Stale text that would be copied into D-NNNs                                                                                                                                                        |
| N-15 | Minor    | A `gc.collect()` soft cap does nothing for wasm memory                                                                                                                                             |
| N-16 | Minor    | Criterion failure modes unspecified; false-positive rate untested                                                                                                                                  |
| N-17 | Minor    | "No product code" vs P10-09 tooling; schema in `src/shared/`; session 3 overloaded                                                                                                                 |
| N-18 | Minor    | M-03's denominator undefined for unlabelled flags                                                                                                                                                  |
| N-19 | Minor    | EC10-7 needs maintainer lines on Q34/Q36; DoD-8 bootstrap                                                                                                                                          |
| N-20 | Minor    | Protected paths by name, not globs; no scripted settings check; "require PR before merging" unstated                                                                                               |
| N-21 | Minor    | Resetting the whole lesson store before P22 measures a cold agent                                                                                                                                  |

### Round 2 resolution

| Finding | Resolution                                                                                                                                                                                      | Where                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| N-1     | Base-branch verification scripts; `scripts/review/**` and `package.json` protected; fail-closed criteria; forged `pass` named as residual risk. **Scope of protection and who may merge: Q-B1** | P10-09, P10-08, DS-23         |
| N-2     | DS-22 rewritten (reviewed SHA, code-computed, base-branch verification, human merge)                                                                                                            | DS-22                         |
| N-3     | DS-10 rewritten (every push asks, best-effort); §18.3.5 in the sign-off list                                                                                                                    | DS-10, pending §4             |
| N-4     | Narrow `allow` to named scripts (settings change, needs approval); `gh api *merge*` denied; DS-23 states the deny is best-effort and branch protection is the control                           | P10-07, DS-23                 |
| N-5     | Hashes compared to the PR's base branch; bootstrap exemption recorded. **Second code owner: Q-B2**                                                                                              | P10-09                        |
| N-6     | 48 KB per-analysis budget across all channels; 1 KB tracebacks; 200-char cells. **HF tools: Q-B6**                                                                                              | Q10 round-2 resolution        |
| N-7     | DS-21 wording ("stops and asks a maintainer"). **Allocations: Q-B3**                                                                                                                            | DS-21                         |
| N-8     | **Q-B4**; holdout keys generated by maintainers on their own machines                                                                                                                           | Q22, Q44 round-2 resolutions  |
| N-9     | **Q-B5**                                                                                                                                                                                        | —                             |
| N-10    | "Temporal" decided by code; the user overrides; in the benchmark the key decides                                                                                                                | Q15 round-2 resolution        |
| N-11    | M-19 denominator = numeric tokens extracted by code from the rendered output                                                                                                                    | Q20 round-2 resolution        |
| N-12    | pending §4 completed                                                                                                                                                                            | `pending.md` §4               |
| N-13    | Stated as best-effort; custody is the real control                                                                                                                                              | P10-07                        |
| N-14    | Sign-off copy rule (resolution lines supersede the decision body); summary rows Q8, Q14, Q15, Q39 and the header fixed; plan status fixed                                                       | Questionnaire header, summary |
| N-15    | Soft cap defined on growth                                                                                                                                                                      | Q10 round-2 resolution        |
| N-16    | Fail closed on timeout, invalid JSON or a missing criterion; ≥ 5 clean fixture PRs pass 3 of 3                                                                                                  | P10-09                        |
| N-17    | Rule for the phase includes development tooling; schema moved to `scripts/review/`; five sessions                                                                                               | P10 plan                      |
| N-18    | Unlabelled flags count as invalid; the key is versioned                                                                                                                                         | Q14 round-2 resolution        |
| N-19    | Q34 and Q36 maintainer lines collected with Q-B; DoD-5 already allows `code-reviewer` before P10-09                                                                                             | Q34, Q36                      |
| N-20    | CODEOWNERS globs; `scripts/check-repo-settings.mjs`; "require PR before merging"                                                                                                                | P10-08                        |
| N-21    | Purge holdout-a lessons by provenance; keep dev lessons                                                                                                                                         | Q19 round-2 resolution        |

**Open maintainer questions Q-B1..Q-B6** are listed in `planning/pending.md`. Re-audit (round 3) after they are answered.

### Maintainer answers to round 2 (2026-10-03)

| Q                        | Answer                                              | Applied as                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-B1 Human safety net    | "Add a permission rule. Basically, set hard rules." | Hard permission rules in `.claude/settings.json` (deny merge and paid runs; ask before pushes and before edits to protected paths; narrowed `allow`), plus hooks and branch protection (P10-07, DS-23)   |
| Q-B2 Second code owner   | "We will be implementing peer reviews."             | Every PR needs approval from a human peer who is not its author (branch protection), in addition to the agent suite (DS-22, P10-08). This also removes the single-owner deadlock (N-5)                   |
| Q-B3 Budget split        | "Explicit hard block."                              | No allocations: paid runs refuse without an approval record in protected `bench/spend/approved.json` and hard-stop at the approved amount; agents are denied the paid commands; no override flag (DS-21) |
| Q-B4 Re-scoring          | Agree                                               | CI re-scores dev runs only; holdout runs are run or witnessed by a maintainer                                                                                                                            |
| Q-B5 Gate statistics     | Agree                                               | Fixed number of runs per gate (1; 3 for P16 and P22), no retry-on-near-miss, task-bootstrap interval                                                                                                     |
| Q-B6 HF search           | No concerns                                         | Per-call approval showing the query text once user data is in context                                                                                                                                    |
| Q34 Judge model          | "For now we will just be utilizing Claude."         | Claude-only judge, a different model from the analyst where possible, marked `same-provider`                                                                                                             |
| Q36 Can the judge block? | Option B                                            | It blocks only when calibrated (M-17) **and** a pre-set floor is breached (a criterion < 2.5/5, or a drop > 0.5) **and** a human peer confirms; otherwise it reports                                     |

All round-2 questions answered. Re-audit (round 3) next.

---

## Round 3 re-audit (2026-10-03)

**Verdict: BLOCKED (decision needed).** Critical 0 · Major 12 · Minor 10. The auditor noted that
the two remaining decisions are small and everything else is fixable without one.

### Resolution

| Finding                                 | Resolution                                                                                                                                                                     | Where                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| R3-1 copy path, stale rows              | Q-B answers recorded under their questions; latest maintainer line wins; summary rows Q30, Q34, Q36, Q41 and pending §1 refreshed                                              | Questionnaire, pending |
| R3-2 superseding DS-18 would be false   | Changed to _confirm_ DS-18's clause (peer review restored it)                                                                                                                  | pending §2             |
| R3-3 deny-only money block              | Hard block moved into the runner's code: approvals from the remote branch, refuses non-interactive runs and agent sessions, approval id typed by a human; `git -c`/aliases ask | DS-21, P10-07          |
| R3-4 contributors can approve spend     | `bench/spend/**` owned by maintainers only                                                                                                                                     | P10-08                 |
| R3-5 hard stop across contributors      | Per-task headroom check; per-contributor approval entries **(Q-C1)**                                                                                                           | DS-21                  |
| R3-6 stale approvals, admin bypass      | Dismiss stale approvals; approval of the most recent push; no admin bypass; asserted by `check-repo-settings.mjs`                                                              | P10-08                 |
| R3-7 criterion edits fail CI            | Suite loads criteria from the base branch                                                                                                                                      | P10-09                 |
| R3-8 byte caps ≠ row caps               | stdout 20 lines per execution, counted toward the 200-row budget; id-only when exhausted                                                                                       | Q10                    |
| R3-9 HF trigger not computable          | After the first data-reading call, every remote HF call needs approval; a DS-06 exception                                                                                      | Q10                    |
| R3-10 judge may grade itself            | **Q-C2**                                                                                                                                                                       | —                      |
| R3-11 public holdout tasks reproducible | Holdout task definitions held by a maintainer, hashes committed                                                                                                                | Q22                    |
| R3-12 post-hoc key labels               | Revisions from dev only, applied to all compared runs, never in a gate PR; holdout keys frozen                                                                                 | Q14                    |
| R3-13 sequencing, DoD-8                 | Verdict check required from P10-09; PR order defined; DoD-8 scoped                                                                                                             | P10-08, P10-09, DoD-8  |
| R3-14 settings bullets                  | Consolidated; `git *` narrowed; `npm install` asks; only the paid entry point denied; syntax verified first                                                                    | P10-07                 |
| R3-15 criterion 08, CODEOWNERS gaps     | Criterion 08 checks the runner path, ledger is evidence; CODEOWNERS covers all rule 1–6 files                                                                                  | P10-08, P10-09         |
| R3-16 pending gaps                      | Added to pending §4                                                                                                                                                            | pending §4             |
| R3-17 blocking rule vague               | Dev task set, non-overlapping intervals, `judge-block.json` by a non-runner peer                                                                                               | Q36                    |
| R3-18 CI re-score                       | Needs P12's env in CI; residual risk covered by peer review                                                                                                                    | Q44                    |
| R3-19 EC10-8                            | ≥ 5 clean PRs pass 3 of 3                                                                                                                                                      | EC10-8                 |
| R3-20 Anthropic key for the judge       | Stated; judge cost in the pass arithmetic                                                                                                                                      | Q34                    |
| R3-21 M-19 extraction                   | Spelled-out numbers and chart values counted                                                                                                                                   | Q20                    |
| R3-22 "temporal"                        | Defined; overridable after the run                                                                                                                                             | Q15                    |

### Maintainer answers to round 3 (2026-10-03)

| Q                              | Answer                 | Applied as                                                                                                        |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Q-C1 Per-contributor approvals | Agree                  | Approval entries name phase, contributor and amount; each runner enforces its own entry (DS-21)                   |
| Q-C2 Judge model               | "Let's just use Opus." | The judge is Claude Opus; a run that used Opus in any role gets a `same-model` judge score that can't block (Q34) |

Neither answer changes the design, so no round 4 is needed. **P10 is ready for sign-off**, which happens on the P10 phase branch.
