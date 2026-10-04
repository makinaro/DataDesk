# P11 Audit: Blind Review and Resolution

| Field   | Value                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Auditor | `plan-auditor` agent (context-blind, read-only), run 2026-10-03                                                         |
| Scope   | `P11-architecture-and-design.md` and the answered `P11-questionnaire.md`, checked against D-030..D-045 and roadmap v0.3 |
| Verdict | Round 1: **BLOCKED (decision needed)**. Critical 3 · Major 21 · Minor 22 · Nit 0                                        |
| Status  | Round-1 findings fixed; five maintainer questions answered with defaults, marked **pending maintainer** (Q-D1..Q-D5)    |

---

## Round 1 report (summary)

### A. Architecture

- **[Critical] Per-analysis state had no single owner across the two servers.** `run_sql` runs in `datadesk-mcp`, outside main, so the D-033 limit of 200 rows per analysis had two counters and no total; nobody journalled SQL executions; and an MCP `tools/call` carries no agent id, so PA-01..PA-11 (which need role attribution) couldn't be measured.
- **[Major] Q1 contradicted Q2 and the roadmap:** a "stateless" relay with its own DuckDB, and roadmap §8.2/§8.3/P14-02 saying `datadesk-ds` writes the journal.
- **[Major] Lifecycles disagreed:** windows per session (at most 2), kernels per analysis, sessions per conversation, compare mode with three sessions. A third lane could starve, and queued time had no budget.

### B. Decision compliance

- **[Major]** §1 limits ("1M × 50", "2/3 GB") contradicted D-031 (50M cells, 200 columns, growth warning, 3 GB kill).
- **[Major]** Q1 relied on an explicitly built env, but on the Claude path the CLI passes its own env (with `ANTHROPIC_API_KEY`) to `datadesk-ds` (D-014).
- **[Major]** Q9 claimed the rewrite hook was verified; `scopeHook.ts` says `canUseTool` firing for `Agent` is not verified.
- **[Minor]** "Never a model the run used" vs D-038's `same-model` rule (also in NFR-17 and R-16); the compute window needs a CSP variant in `csp.ts` (rule 2); D-039 requires P11 to verify whether the Claude lead budget can be enforced.

### C. Recommendation challenges

- **Q2 (Critical, with H):** the snapshot cache key ignored split state, and `read_csv('<raw path>')` bypassed any view-level test exclusion; `COPY … TO` under the lockdown unverified.
- **Q3 (Major):** an unanchored hash chain proves nothing against an editor; crash ordering, fsync and orphaned `started` entries unstated; migrating an append-only chained file was undefined.
- **Q4 (Major):** whole-output matching lets a `describe()` dump match almost anything; "≥ 2 significant digits" and "years" exempted substantive numbers; M-19's denominator treatment of exemptions was unstated.
- **Q5 (Major):** a pickle persists across analyses and can monkeypatch libraries in a later kernel; manifest fields came from the kernel.
- **Q9 (Major):** brief facts not fenced. **Q10 (Major):** missing surfaces (notebook export, second-hop secrets, compute channel, kernel instrumentation, snapshot cache), and two different surface lists. **Q11 (Major):** sub-agent usage unverified; overshoot unbounded; turns, wall clock, retries and partial reports missing.
- **Minor:** Q6 trigger fields shaped by agent code; Q7 parity only on builders; Q8 existing unversioned files; Q12 judge spend outside D-034 and bench child envs.

### D. Buildability

- **[Major]** Q9's enforcement point may never fire for `Agent`.
- **[Major]** The probe loaded Pyodide from `app://` with `connect-src 'none'`: package loading needs `fetch`, and `app://` puts Python on the UI's origin and storage. P13 Q1 already chose `compute://` on its own partition.
- **[Minor]** DuckDB `COPY` under lockdown and the `allowed_directories` prefix match; the named-pipe ACL not in the checklist.

### E. Operability

- **[Major]** Unspecified: orphaned executions after a main crash; kernel kills at 3 GB; ENOSPC on append; snapshot cache size; provider outage mid-run; `index.json` divergence.

### F. Measurability

- **[Major]** PA metrics need role attribution; EC11-2 and EC11-3 had no enumerated denominators.
- **[Minor]** `{}` would pass as the "invalid sample"; "probe evidence" undefined.

### G. Safety (attack sequences)

1. **[Critical]** After `make_split`, a raw-path SELECT pulls test rows into the kernel.
2. **[Critical]** Paging 20 rows at a time through both servers exceeds the 200-row cap.
3. **[Major]** Python on the `app://` origin tampers with UI storage.
4. **[Major]** `datadesk-ds` parses hostile files with the API key in its env.
5. **[Major]** A planted pickle biases a later analysis at `predict`.
6. **[Critical]** `evaluate_on_test(pipeline_var)` scores agent-controlled code that can override metrics.
7. **[Minor]** The FFI probe was a deny-list (missed WebRTC, `sendBeacon`, `EventSource`, BroadcastChannel).

### H. Statistical validity

- **[Critical]** D-035 had no P11 design, and the stateful kernel, the pre-split cache, the raw-path SELECT and agent-run evaluation each defeated it.
- **[Major]** Q4's rules inflate M-19.

### I–K. Consistency, completeness, scope

- **[Major]** `app://` vs `compute://`; journal writer; missing §12.12 schemas (key-results block first); no CPython fallback design; inputs `docs/ds/01`–`05` don't exist until P10's work merges.
- **[Minor]** Entry cited DS-01..DS-20; header "provisional"; "only code is zod schemas" vs the migration registry; budget and versioning ADRs unnumbered; P13 Entry's per-session window; IPC contracts, tool-output shaping and prompt caching missing; size M optimistic; undefined terms; P11 probe spend unstated.

### Verified (held)

`total_cost_usd` is cumulative (sdkMapper.ts); `canUseTool` rewrites delegations (claudeOrchestrator.ts); the DuckDB lockdown; the single-instance lock; Q6 matches D-037; Q12 keeps the judge out of the app; Q8 matches D-045; Q7 reuses D-021.

## Round 1 resolution (2026-10-03)

| Finding                                              | Severity | Resolution                                                                                                                                                                                                                      | Where                       |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| No owner of per-analysis state; attribution; row cap | Critical | **Analysis controller** in main owns journal, row/byte budget across both servers, meter, clock, lease, split and attribution; correlation ids stamped by main and probed (Q-D1)                                                | P11-02, Q1 resolution       |
| Test lock undesigned; raw-path SELECT                | Critical | New **P11-16 / ADR-11**: kernel restart at split; train-only DuckDB; split id in cache keys; host-held test rows (Q-D4)                                                                                                         | P11-16, Q2, P17 Q1 note     |
| Self-grading at evaluation                           | Critical | Fresh kernel loads the saved pipeline with test features only; metrics computed by code in main                                                                                                                                 | P11-16, P11-06, P17 Q1 note |
| Q1 vs Q2 vs roadmap journal writer                   | Major    | Journal written by main's controller; roadmap glossary, §8.2 diagram, §8.3 and P14-02 updated (Q-D2)                                                                                                                            | roadmap, Q1 resolution      |
| Window lifecycle; compare starvation                 | Major    | Lease per analysis, ≤ 3 windows, 4 GB free-memory floor, 60 s queue then `compute_busy`, wait counts against the wall clock, idle release at 10 min (Q-D3)                                                                      | Q1 resolution, P13 Entry    |
| §1 limits vs D-031                                   | Major    | §1 restated from D-031 and D-033                                                                                                                                                                                                | P11 §1                      |
| Second-hop secrets in `datadesk-ds`                  | Major    | `scrubSecrets` at startup; token in a `DATADESK_*` var deleted after reading; env probe                                                                                                                                         | P11-02, Q1 resolution       |
| Q9 hook unverified; facts unfenced                   | Major    | Probe `canUseTool` and PreToolUse rewrite; fallback validate-and-deny; facts fenced                                                                                                                                             | P11-12, Q9 resolution       |
| `app://` and `connect-src 'none'`                    | Major    | `compute://` on its own partition, Web Worker, CSP variant in `csp.ts`, allowlist probe of reachable globals                                                                                                                    | P11-01                      |
| Q3 chain, crash ordering, migration                  | Major    | Anchored head hash; blob-first, fsync points, `aborted` entries, ENOSPC fail-closed, index rebuild; per-entry in-memory migration                                                                                               | P11-03, Q3 resolution       |
| Q4 matching and exemptions                           | Major    | Cell-level `[[out:id#path]]`; decimal places defined; exemptions removed; all tokens in M-19's denominator (Q-D5)                                                                                                               | P11-04, Q4 resolution       |
| Q5 planted pickle; kernel-written manifest           | Major    | Manifest written by main; pickles load only in a fresh kernel                                                                                                                                                                   | P11-06, Q5 resolution       |
| Q10 surfaces; two lists                              | Major    | One canonical list of 16 surfaces in P11-10                                                                                                                                                                                     | P11-10, Q10 resolution      |
| Q11 sub-agent usage; overshoot; other limits         | Major    | Probe sub-agent usage; stop at cap minus worst-case next call; ADR-12 covers turns, clock, retries, partial report                                                                                                              | P11-11, Q11 resolution      |
| Operability gaps                                     | Major    | Kernel resets journalled and reported; snapshots inside the 2 GB cap; outage → partial report                                                                                                                                   | P11-03, P11-05, P11-11      |
| PA metrics; EC denominators                          | Major    | Attribution via correlation ids; fixed tool list and surface list                                                                                                                                                               | P11-02, P11-09, P11-10, §5  |
| Missing §12.12 schemas                               | Major    | P11-09 lists them; P12 hand-off gains the key-results block                                                                                                                                                                     | P11-09, §7                  |
| No CPython fallback design                           | Major    | ADR-01 designs it to the same isolation bar                                                                                                                                                                                     | P11-01                      |
| Inputs don't exist yet                               | Major    | Entry = P10 closed (signed off and its work merged)                                                                                                                                                                             | P11 header                  |
| Judge wording vs D-038                               | Minor    | P11 §1, NFR-17 and R-16 use the `same-model` rule                                                                                                                                                                               | P11 §1, roadmap             |
| Remaining Minors                                     | Minor    | Invalid sample per constraint; probe evidence defined; Q6 enums; Q7 runtime parity; Q8 v0; Q12 runner and env; IPC contracts; shaping and caching; ADR-11..13 numbered; size L with 7 sessions; terms defined; ≈ $3 probe spend | P11 plan, resolutions       |

## Questions for the maintainer (defaults applied)

Each default is already in the plan, so the next audit round reviews it. "Agree" settles each one.

- **Q-D1. One owner for per-analysis state.** Default: an analysis controller in main owns the journal, budgets, split and attribution, and **`run_sql` also reports to it**, so the 200-row cap covers both servers. **Agreed (2026-10-04).**
- **Q-D2. Who writes the journal.** Default: main, not `datadesk-ds` (reverses the old roadmap §8.3 wording; recorded as a D-NNN at P11 sign-off). **Agreed after discussion (2026-10-04).**
- **Q-D3. Compute windows per analysis.** Default: up to 3 at once (one per compare lane), each killed at 3 GB, refused below 4 GB free memory, 60 s queue. **Maintainer answer (2026-10-04):** Changed: each window is killed at **2 GB** (amends D-031's 3 GB, D-NNN at sign-off).
- **Q-D4. P11 designs the test lock.** Default: yes, as ADR-11, because P11's other ADRs fix the mechanisms P17 depends on. **Agreed (2026-10-04).**
- **Q-D5. Strict number counting for provenance.** Default: every number in a report needs a cell-level citation, except numbers quoted from the user's question; M-19's ≥ 90% target is unchanged. **Agreed (2026-10-04).**

## Round 2 re-audit (2026-10-03)

Verdict **BLOCKED (decision needed)**: Critical 2 · Major 11 · Minor 12. Of the round-1 findings, 5 landed fully, 12 mostly or partly, and none were missing.

### New findings (summary)

- **[Critical] Pre-split snapshots stay readable after the split.** `allowed_directories` grants read as well as write, so a SELECT over an old snapshot brings test rows back.
- **[Critical] `run_sql` and the other datadesk-mcp tools ignore the split.** The agent can compute a target encoding over all rows, or page out test labels.
- **[Major]** `sample_rows`, `profile_column`, `search_columns` and `second_opinion` bypass the 200-row cap.
- **[Major]** `scrubSecrets` keeps `DATADESK_OPENAI_API_KEY`. Tokens can't use server `env` config (D-018). One-time token vs two servers vs restart.
- **[Major]** "Once per split" vs D-035 "once per analysis": the analysis has no lifecycle owner.
- **[Major]** Budget and test-lock records aren't durable before their effects, and there's no rebuild on reopen.
- **[Major]** The worst-case stop rule halts before the first call without a per-call output cap.
- **[Major]** The fresh kernel's location, cap and error channel are undefined.
- **[Major]** Provenance can be met by literals; M-04 is zero by construction; the tokenizer is undefined.
- **[Major]** CPython fallback network control needs elevation.
- **[Major]** No downstream P14 work item for the controller; stale P13/P14 text.
- **[Major]** Missing persisted schemas (journal envelope, split record, manifest, pipe messages; status values; score head hash).
- **[Major]** Paid probes before any runner exists.
- **[Minor]** `updatedInput` vs `allow`; validating the full COPY; main-side metric parity; permutation importance on test; catalog writer and migration owner; pipe mode per instance; ENOSPC report; lesson stuffing; tool names; stale roadmap rows; dependence on P13 answers; waiver and CSP D-NNNs.

### Round 2 resolution

| Finding                        | Severity | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                          | Where                        |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Pre-split snapshots readable   | Critical | Snapshot folder per split epoch; old folder deleted at split; test data outside every grant                                                                                                                                                                                                                                                                                                                                         | P11-05, P11-16, Q2           |
| datadesk-mcp ignores the split | Critical | The agent instance of `datadesk-mcp` is rebuilt with train views only after the split (Q-F2)                                                                                                                                                                                                                                                                                                                                        | P11-02, P11-16               |
| Other row-returning tools      | Major    | Every row-returning or egress tool reports to the controller; `second_opinion` off during DS analyses unless the user turns it on (Q-F3)                                                                                                                                                                                                                                                                                            | P11-02, P11-09, P11-10       |
| Secrets and tokens             | Major    | Allowlist env in `datadesk-ds`; tokens via the CLI env; one pipe and one token per server; reconnect replaces                                                                                                                                                                                                                                                                                                                       | P11-02, Q1                   |
| Analysis lifecycle             | Major    | Code opens and closes analyses; split and spent test lock carry over within a conversation; `make_split` once per analysis (Q-F1)                                                                                                                                                                                                                                                                                                   | P11 terms, P11-16            |
| Durability and rebuild         | Major    | Write and fsync before the effect; rebuild from the journal on reopen                                                                                                                                                                                                                                                                                                                                                               | P11-03, Q3                   |
| Stop rule                      | Major    | Per-call output cap on both providers; parallel calls summed (Q-F5)                                                                                                                                                                                                                                                                                                                                                                 | P11-11, Q11                  |
| Fresh kernel undefined         | Major    | Evaluation kernel: own window and partition, counted in the cap (≤ 4 windows), error class only                                                                                                                                                                                                                                                                                                                                     | P11 terms, P11-06, Q5        |
| Provenance by literal          | Major    | Tokenizer specified; M-04 on pre-mark text; literal-in-code check (Q-F7)                                                                                                                                                                                                                                                                                                                                                            | P11-04, Q4                   |
| CPython network control        | Major    | AppContainer, unelevated (Q-F4)                                                                                                                                                                                                                                                                                                                                                                                                     | P11-01                       |
| Downstream work items          | Major    | P14-00 analysis controller; budget inside it; P14 citations and R-06 updated; P13 limits, CSP and allowlist suite; P14/P17 inputs                                                                                                                                                                                                                                                                                                   | P13, P14, P17 plans          |
| Missing schemas                | Major    | Journal envelope, split record, manifest, pipe messages; `aborted` and `compute_busy`; `journalHeadHash`                                                                                                                                                                                                                                                                                                                            | P11-09                       |
| Paid probes                    | Major    | All probes run against a local scripted endpoint at $0 (Q-F6)                                                                                                                                                                                                                                                                                                                                                                       | P11 header, P11-12           |
| Minors                         | Minor    | `updatedInput` probe without `allow`, single-use ids; whole-COPY check; golden vectors; permutation importance on a validation fold (P17 Q4); catalog writer and pre-spawn migration; pipe mode per instance; ENOSPC report; BM25 on capped fields; tool names (`save_derived_dataset`, `save_plan`, `get_output`); roadmap P11-16, ADR-11..13, sizes, P13 Entry; ADR-01 owns the compute scheme; waiver and CSP D-NNNs at sign-off | plan, questionnaire, roadmap |

### Questions for the maintainer, round 2 (defaults applied)

- **Q-F1. Who opens an analysis.** Default: code opens and closes it; only the user starts a new one; split and spent test lock carry over within a conversation. **Agreed (2026-10-04).**
- **Q-F2. Train-only SQL after a split.** Default: yes, the agent's SQL tools see only the training rows after `make_split`. **Agreed (2026-10-04).**
- **Q-F3. Metering the other data tools.** Default: they all report to the controller; `second_opinion` stays off during DS analyses unless you turn it on. **Agreed (2026-10-04).**
- **Q-F4. CPython fallback isolation.** Default: a Windows AppContainer (works without admin rights). **Agreed (2026-10-04).**
- **Q-F5. Per-call output caps.** Default: required on both providers, so the $1 stop can be computed before a call. **Agreed (2026-10-04).**
- **Q-F6. Free probes.** Default: all P11 probes use a local fake endpoint ($0), so P11 needs no spend approval. **Agreed (2026-10-04).**
- **Q-F7. Stricter provenance metrics.** Default: M-04 measured before code marks anything, and values hard-coded in code don't count as provenanced. **Agreed (2026-10-04).**

## Round 3 re-audit (2026-10-03)

Verdict **BLOCKED (decision needed)**: Critical 1 · Major 7 · Minor 9. Of the round-2 findings, 6 landed fully, 9 mostly and 5 partly. This was the last round allowed by the audit rule (at most three rounds per phase), so the remaining questions go to the maintainer with defaults applied.

### Findings and resolution

| Finding                                                                                                                              | Severity | Resolution                                                                                                                                                                                                          | Where                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Test rows survive the split through derived datasets and saved models                                                                | Critical | Split by code at `save_plan` for predictive and forecast plans; manifest split id must match; lineage and content-hash descendants hidden (Q-G1)                                                                    | P11-16, P11-02, Q2, P17 Q1                  |
| `second_opinion` and `search_columns` vs D-033                                                                                       | Major    | Off during every analysis, no override (Q-G2)                                                                                                                                                                       | P11-02, Q1                                  |
| Unmetered time before `save_plan`; close vs follow-up                                                                                | Major    | Conversation controller from the first tool call; 20-row per-call cap always on; follow-ups reopen with spent budgets (Q-G3)                                                                                        | P11 terms, Q1                               |
| Split carry-over across targets                                                                                                      | Major    | Split record with lineage root, target, kind, seed; new splits only on never-test rows, or disclosure (Q-G4)                                                                                                        | P11 terms                                   |
| M-04 on undefined input                                                                                                              | Major    | Agent mark `[[unverified]]`; roadmap M-04 and M-19 updated (Q-G5)                                                                                                                                                   | P11-04, roadmap §7.1                        |
| Pre-plan egress                                                                                                                      | Major    | Covered by the conversation controller                                                                                                                                                                              | P11 terms                                   |
| Evaluation kernel runs agent code; lock on error                                                                                     | Major    | Contained like any kernel; any attempt spends the lock; predictions never returned (Q-G6)                                                                                                                           | P11 terms, P11-16, Q5                       |
| Literal check textual; native launcher; wall clock; stale P13/P17; superseded text unmarked; P14-00 unscheduled; vague "train split" | Minor    | Heuristic over folded `ast` values; native AppContainer helper as a verify item; active time; P13 and P17 synced; supersede lines in Q1, Q10, P17 Q1/Q4; P14-00 in sessions, D14-8 and EC14-6; lineage rule defined | plan, questionnaire, P13, P14, P17, roadmap |

### Questions for the maintainer, round 3 (defaults applied)

- **Q-G1. Split before reading.** Default: for prediction and forecasting plans, code splits the data when the plan is saved, before any code reads it; models from another split are refused. **Agreed (2026-10-04).**
- **Q-G2. Tools that send rows to OpenAI.** Default: `second_opinion` and `search_columns` are off during every analysis, with no override, to keep D-033. **Agreed (2026-10-04).**
- **Q-G3. Metering from the first call.** Default: every agent tool call is metered from the start of a conversation, and the 20-row per-call cap is always on (today's agent `run_sql` returns up to 500). **Agreed (2026-10-04).**
- **Q-G4. A second target on a split dataset.** Default: a new split uses only rows never used as test rows; otherwise the report says there's no clean test set. **Agreed (2026-10-04).**
- **Q-G5. The "unverified" mark.** Default: the agent writes `[[unverified]]` after a number it can't cite; M-04 = 0 stays the target. **Agreed (2026-10-04).**
- **Q-G6. Failed test evaluations.** Default: any attempt that reaches the evaluation kernel uses up the test set, even if it fails. **Agreed (2026-10-04).**

**P11 status:** audit closed after three rounds; the plan is ready for the maintainer's sign-off once Q-D1..Q-D5, Q-F1..Q-F7 and Q-G1..Q-G6 are confirmed or changed.
