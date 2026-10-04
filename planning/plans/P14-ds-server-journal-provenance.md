# P14 Plan: `datadesk-ds`, Analysis Journal & Provenance

| Field     | Value                                                                                                                                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P14 of P10–P23 (roadmap §10)                                                                                                                                                                                                                                     |
| Milestone | MVP v0.1 Trust                                                                                                                                                                                                                                                   |
| Objective | Run agent-written code safely and record every result, so that every number is traceable                                                                                                                                                                         |
| Entry     | P12 and P13 closed (scorer and runner exist; the sandbox go decision recorded, or P13b closed on a no-go). **The maintainer's approval of this phase's planned API spend (D-034) is needed before session 9**, the only paid session                             |
| Spend     | Planned **≈ $24** expected; the approval must cover **reservations**: 12 tasks × (the $1 cap + ADR-12's overshoot bound) per provider, which must fit D-034's $15 per pass (so the bound must be ≤ $0.25); no judge calls                                        |
| Size      | L (9 sessions)                                                                                                                                                                                                                                                   |
| Branch    | `phase-14-ds-server`                                                                                                                                                                                                                                             |
| Inputs    | ADR-01..05, 08, 09, 11, 12, 13 · `docs/ds/06`, `07`, `08` · P10 Q2, Q5, Q6, Q10, Q37, Q38 · P11 Q1–Q4, Q7–Q9, Q11 · P13 host API, channel ADR (P13-10: envelope, `applyCaps`, artifact class), statuses, lease manager (P13-11)                                  |
| Outputs   | D14-1 `src/mcp-server-ds/` · D14-2 `src/main/journal/` · D14-3 `src/main/provenance/` · D14-4 `src/main/context/` · D14-5 runtime skill `delegation-briefs` · D14-6 UI cells and marks · D14-7 save/reopen · D14-8 conversation controller · D14-9 bench results |
| Status    | Audited (3 rounds, `P14-audit.md`); all findings fixed; maintainer defaults pending (Q-L, Q-N, Q-Q); awaiting sign-off                                                                                                                                           |

**Rule for the phase:** plumbing and trust, not analysis features. The analyst can run Python
and every number is traced; wrangling, statistics and ML skills come in P15–P17.

**One egress path (P14 audit, G1):** the kernel returns a bounded typed envelope (P13-10). A
single **egress shaper in the controller** calls P13's pure `applyCaps`, which owns every
per-envelope cap including the structural row count (each table row; each element of a list or
dict of records; each line of a string leaf; each stdout line) and returns `rowsCounted`; the
shaper adds the cross-call and per-analysis totals, assigns output paths, and journals both the full and the shaped
copy. The **20-row per-call cap spans the result, stdout and `get_output` together**, and
`get_output` debits the same analysis budget. The context builder only consumes shaped results.

**Counting rules (P14 audit rounds 2–3).** P14 amends P13's `applyCaps` (in `src/main/compute/`)
with these rules, each tested one by one. A **row** is a record in a table-like container: a
DataFrame or array row, or an element of a sequence of records or of scalars. **A mapping of named
scalars** (a dict of statistics such as mean, std, n, p) is an aggregate and costs **one**
row-equivalent in total; nested containers count once, at their innermost record level. A string
leaf counts `max(lines, ceil(chars / 200))`; stdout lines are truncated at 200 characters and
counted; traceback, stderr and DuckDB error lines are counted. **The 48 KB per-analysis byte cap
(D-033) is the real privacy bound** for packed strings (200 row-equivalents of 200 characters can
carry about 40 KB); the threat model records this residual (R-14). `get_output` refuses ids from
another analysis. `datadesk-mcp` tools **obtain** their model-bound output from the shaper over the
pipe; they never return rows the shaper hasn't counted.

**Terms used in this plan:**

- **Final answer:** every assistant text the user sees in a turn (lead and sub-agent summaries shown in the UI), plus every report the agent saves.
- **Data-reading call:** any controller-routed call except a small non-data allowlist (`list_datasets`, `save_plan`, `restart_kernel`); `get_schema` counts as data-reading for the **Hugging Face and `second_opinion` flag** (column names are data, NFR-08). A **row-returning read** is a data-reading call that returns values (everything except `get_schema`); it alone matters for **test-lock violations and plan locks**.
- **Continue:** reopens **the same analysis** (P11 terms), with its spent budgets, split record and
  test lock, on a fresh kernel; the state card says the kernel was reset (P14 audit Q-L1).

---

## 1. Inherited Decisions and Inputs

| Source              | What it forces in P14                                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P11 Q1–Q2, ADR-02   | A **conversation controller** in main (P11 terms) owns all per-analysis state; `datadesk-ds` is a relay whose only state is its snapshot cache; one pipe per server                                                   |
| P11 Q3–Q4 (audited) | Hash-chained JSONL anchored in score files; cell-level `[[out:id#path]]` citations; the specified tokenizer; agent `[[unverified]]` marks; M-04 on pre-mark text; the literal-in-code heuristic                       |
| P11 Q7–Q9           | One scope table for both providers, plus a parity test; briefs as JSON re-rendered by code (or the ADR-09 fallback)                                                                                                   |
| P11 Q11, ADR-12     | Usage-based meter with per-call output caps; stop at cap minus the next round's worst case                                                                                                                            |
| P11 Q-G2, D-033     | `second_opinion` and `search_columns` off during every analysis; after the first data-reading call, every Hugging Face call needs per-call approval (P10 Q-B6)                                                        |
| P13 (audited)       | Typed envelope and `applyCaps`; the artifact class (main writes artifacts); a restart is a new window and partition; statuses; the lease manager: 3 analysis leases, 1 evaluation slot and 1 parse slot (≤ 5 windows) |
| D-031               | Python on ≤ 50M cells and ≤ 200 columns; above either, a seeded DuckDB stratified sample                                                                                                                              |
| D-035               | Two-sided tests unless the direction was declared before the outcome was read                                                                                                                                         |
| P10 Q5–Q6, D-032    | Plan before execution; 20-min active time; 3 retries per error class; partial report on any stop                                                                                                                      |
| P10 Q10, Q37–Q38    | 8 KB to the model; role budgets; the state card                                                                                                                                                                       |
| P10 Q33             | PA-02 and PA-09 become gates from this phase (PA-09 scoped, Q-L5)                                                                                                                                                     |
| P10 Q45, D-045      | Model availability (P14-10); migrations tested from this phase                                                                                                                                                        |

## 2. Session Plan

| Session | Work items             | Output                                                                                                                         |
| ------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1–2     | P14-00, P14-12         | Conversation controller, egress shaper, pipes, correlation ids, durability, locks, env scrub; CODEOWNERS before the code lands |
| 3       | P14-01, P14-02         | `datadesk-ds` relay and tools; journal entry types with crash tests                                                            |
| 4       | P14-04, P14-07, P14-11 | Both providers wired; parity test; budget and stops; split at `save_plan`                                                      |
| 5       | P14-03                 | Provenance checker, report interception, literal and monkeypatch heuristics                                                    |
| 6       | P14-09                 | Context builder, fenced state card, brief rendering, `delegation-briefs` skill                                                 |
| 7       | P14-05, P14-06         | UI cells, provenance marks, save/reopen with transcript                                                                        |
| 8       | P14-10                 | Model check and resolved ids                                                                                                   |
| 9       | P14-08, audit          | Dev gate run on both providers (full "before" numbers); summary                                                                |

## 3. Work Item Breakdown

### P14-00 Conversation controller (P11 ADR-02, ADR-11, ADR-12)

- [ ] The conversation controller with its analysis phase (P11 terms): journal writer, the egress shaper (above), row and byte budget, USD meter, active time, retries, kernel lease (P13's lease manager), split and test lock, the plan guard (Q4), durable records before effects, rebuild from the journal on reopen
- [ ] Correlation-id stamping as ADR-02 decided after its probe (PreToolUse `updatedInput` or the designed fallback; the wrapper on OpenAI); one pipe per server; every row-returning `datadesk-mcp` tool reports to the controller
- [ ] `second_opinion` and `search_columns` are refused **whenever the data-read flag is set**, not only during an analysis (Q-Q6). The **data-read flag** is set by the first data-reading call (terms) and persisted in a **conversation record** (`<conversation>/state.json`, written by main) that survives Continue and is carried into every "New analysis" in the conversation; while it is set, every Hugging Face tool call needs a per-call approval through the existing approval flow (D-020, P10 Q-B6, Q-N5)
- [ ] An **exclusive per-analysis lock**, held in main's memory and released in a `finally` on any controller error or close; an analysis open in one window or lane shows "open elsewhere" and can't be continued twice; locks don't survive an app restart
- [ ] **Before `COPY`**, the controller reads the source's row and column count; above D-031's limit, the seeded stratified sample is taken **inside the `COPY`**, so an oversize table is never written in full. Snapshot bytes count toward the 2 GB per-analysis cap (D-043): the size is estimated from row count × average row bytes and refused above the remaining cap; a file that still exceeds it is deleted and refused, with its bytes counted
- [ ] **`datadesk-ds` env scrub built and tested** (P11-02): at startup it keeps only the allowlisted variables, deletes `DATADESK_OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and every other variable, and deletes its token after reading it; a test spawns it with a hostile env and asserts the result (CLAUDE.md rules 1 and 5, D-014)
- [ ] SQL results from `run_sql`, `sample_rows` and `profile_column` are journalled as **`sql` executions with output ids**, so their numbers are citable; the full result travels over the pipe, bounded at 1 MB. **SQL constants are folded too:** `json_serialize_sql` parses each statement, and a cited value equal to a constant literal in the SQL (including `select` inputs and `create_chart` queries) isn't provenanced, in the app and in the scorer

**Done when:** EC14-6 passes. **Depends on:** P13 lease manager and channel.

### P14-01 `datadesk-ds` tools

- [ ] `save_plan`, `run_python`, `get_output`, `restart_kernel` (Q1); a restart is a new window and partition (P13)
- [ ] `select`: the referenced sources are **derived from the bound plan** (`EXPLAIN (FORMAT JSON)` with views expanded; the exact API is a docs-researcher item for the pinned DuckDB node API), never from the declared dataset name, so the cache key and the recorded inputs list every source; sampling must be seeded (`REPEATABLE`) and the fraction recorded from row counts; cache keys include the split id **and the sampling seed**. The stratification key is the plan's grouping column when one exists, otherwise a simple seeded random sample; the method goes into the key-results block's `sampling` field
- [ ] The size limit (D-031: 50M cells, 200 columns) is enforced **in main from the source's counts before `COPY`** (above), and the analysis discloses any sample. Whether DuckDB samples and `random()` are deterministic with several threads is a docs-researcher item; `select` snapshots run with `threads=1` until it is verified (NFR-05)
- [ ] Seeds (Q2): per-execution seed = first 4 bytes of SHA-256(analysis seed ‖ execution seq), recorded; it seeds Python's and NumPy's global RNGs, `np.random.default_rng()` called without a seed, and DuckDB's `setseed` for `select`; replays reuse the recorded seeds. Seeding inside the kernel is advisory (agent code can unwrap it) and serves reproducibility only
- [ ] Electron-vite entry and `asarUnpack` for the second MCP server

**Done when:** each tool has contract tests from `docs/ds/07`. **Depends on:** P14-00.

### P14-02 Analysis journal

- [ ] Writer in main; hash chain; crash recovery; outputs over 64 KB by hash; migration fixtures for v1
- [ ] **Entry types** (schemas from P11-09): plan revision; execution start and finish (seed, inputs with every source, status); full output and shaped-to-model output with hashes; the agent's **raw final text** (before marks) and the **rendered** text; checker result per claim; spend per message with the **resolved model snapshot id** and role; transcript entries (user messages, final answers, step summaries); stop with reason

**Done when:** a crash at any byte leaves a readable journal, and every entry type has a fixture.

### P14-03 Provenance checker

- [ ] Tokenizer, citation verifier and marks per P11-04; runs on every final answer and report; re-runs as a pure function on reopen, so an answer that streamed before a crash still gets checked
- [ ] **Main is the single writer of the artifact store** (P13: artifacts written only by main): `save_report`, `create_chart` and the code-built partial report all relay to main, which runs the checker, records claim records and writes the file, so a partial report survives the loss of `datadesk-mcp` and is held in memory under ENOSPC until space allows (P11-03, Q-N3)
- [ ] The **literal-in-code** and **monkeypatch** facts are computed **once per execution, when it finishes**, in P13's parse kernel, and journalled; the checker is then a pure function over the journal. Taint spans the kernel session since the last reset: every execution after a monkeypatch signal is tainted, and `exec`, `eval`, `compile`, `importlib` and `__import__` are taint signals. Literal sets are unioned across executions, but **only literals with ≥ 3 significant digits** (or any decimal) suppress a citation, so `head(20)` or `figsize=(12, 6)` don't. An execution with no journalled facts (parse kernel unavailable, `RecursionError`) is treated as tainted (fail closed)
- [ ] The monkeypatch heuristic flags assignments to attributes of imported library modules or classes, `setattr`, `vars(mod)[…] =` and `mod.__dict__` updates, **except known configuration namespaces** (`pd.options`, `pd.set_option`, `plt.rcParams`, `np.set_printoptions`, `warnings`); outputs of tainted executions aren't counted as provenanced. It is a heuristic, documented as one; determined evasion remains a residual risk
- [ ] Plan constants count as provenanced only from D-035's values: α = 0.05, 95% intervals, and 80/95% forecast intervals; any other level counts only when quoted verbatim from the user's question (Q-N2)
- [ ] A failed citation check is fed back to the lead in the next turn's state card (retry class `citation_failed`); a third failure in an analysis stops it with a partial report. **Heuristic flags (literal, monkeypatch) are reported but don't count toward `citation_failed`**

**Done when:** EC14-1 holds on fixtures, including a literal, a monkeypatch and a decoy-number fixture.

### P14-04 Providers

- [ ] Init-guard allowlist, scope table rows, OpenAI MCP wiring; the parity test (builders and runtime, P11-08)

### P14-05 UI

- [ ] Execution cells in turn steps (Q6); provenance marks (Q7); a "Key results" block (Q10)

### P14-06 Save and reopen

- [ ] Analyses listed; reopen shows the journal, artifacts and **the transcript from journal entries** (FR-19; the SDK session itself isn't restored); **Continue** per terms (Q5); a **"New analysis"** action starts a new analysis whose split follows the P11 split-record rule (only rows never used as test rows); kernel replay is deferred to P21 (P21-01 gains the item)

**Done when:** EC14-4 passes.

### P14-07 Budget and stops

- [ ] Inside the controller: usage-based meter priced by the **resolved model snapshot id**; per-call output caps; turns; the 20-min active time; retry classes; an **analytic maximum overshoot** derived from the per-call caps and stated in ADR-12; the gate run checks that the observed overshoot never exceeds it (P12-07 reserves cap + bound, Q-N7)
- [ ] The code-built partial report (Q8) for **every** stop: budget, active time, turns, the $2 conversation cap, retry class, user stop, provider outage, ENOSPC, `host_crashed`/`unavailable`, `compute_busy` past the queue; each with a test

### P14-08 Bench (gate run)

- [ ] Dev run on both providers; produces the full "before" numbers P12 hands over (P10 Q21); EC14-1, EC14-2 and EC14-5 values

### P14-09 Context builder

- [ ] Contracts from `docs/ds/06`; consumes shaped results only; references by id; state card; brief rendering; tokens per role in the journal; skill `delegation-briefs`
- [ ] **Every agent- or data-derived field** in the state card, briefs and outputs (plan questions, dataset and column names, values) sits in a fenced data block (§8.5 rule 4) whose delimiter is random per session and stripped from the content; the card is re-injected every 10 turns, and also after compaction when ADR-09's probe shows it can be detected

### P14-10 Model availability (added by P10 Q45)

- [ ] Clear handling when a configured model id no longer exists (Q9); removing an id from `OPENAI_MODELS` ships with a settings migration (NFR-18); the resolved snapshot id behind each alias is journalled

### P14-11 Split at `save_plan` (added by the P14 audit, Q-L4)

- [ ] For predictive and forecast plan types, the controller computes the split at `save_plan` (P11-16). **Code chooses the kind with one detector** used in the app and on the bench: a column parseable as a date or datetime (including ISO strings), with ≥ 90% non-null values, ≥ 20 distinct values, that orders the rows. **Forecast plans are always temporal**, and are refused without such a column; other predictive plans use temporal when the detector fires, otherwise random (D-035, Q-Q5). A task's declared time column is only an assertion the detector must match. P17 adds stratified and grouped kinds. The split storage is owned here; P17-01 extends it
- [ ] **Plan fields that grant authority** (`direction`, `target`, split, declared constants) are **set once at the first `save_plan` and never changed** (Q-Q3); from P19 on, `save_plan` becomes `propose_plan` and `commit_plan`, and the lock and the split happen at commit (P19 audit). **Reads before a plan (Q-N1, Q-Q4):** a direction declared after any row-returning read of the outcome's dataset (the dataset holding the outcome column, or any dataset joined to it in that read) is ignored (tests stay two-sided); **questions in any plan written after such a read are exploratory**, unless the user's question names them; for predictive plans, a **row-returning** pre-plan read of the split source (schema reads excluded) is disclosed in the report and counted as a test-lock violation for M-06 on the bench

### P14-12 Review protection (added by the P14 audit)

- [ ] CODEOWNERS and the review applicability map gain `src/mcp-server-ds/**`, `src/main/analysis/**`, `src/main/journal/**`, `src/main/provenance/**`, `src/main/context/**`, `src/main/compute/**`, `src/main/checks/**`, `src/main/models/**`, `src/shared/ds/**`, `resources/agent-plugin/**`, and from P21 `src/main/export/**` and `bench/rerun/**` (D-041), in session 1 before the code lands

## 4. Deliverable Map

| Deliverable | File path                                                                                                                                                                   | Produced by            | Satisfies      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------- |
| D14-1       | `src/mcp-server-ds/`, electron-vite and builder config                                                                                                                      | P14-01                 | EC14-2         |
| D14-2       | `src/main/journal/`                                                                                                                                                         | P14-02                 | EC14-4         |
| D14-3       | `src/main/provenance/`                                                                                                                                                      | P14-03                 | EC14-1         |
| D14-4       | `src/main/context/`                                                                                                                                                         | P14-09                 | EC14-5         |
| D14-5       | `resources/agent-plugin/skills/delegation-briefs/`                                                                                                                          | P14-09                 | EC14-5         |
| D14-6       | `src/renderer/src/components/` (cells, marks, key results)                                                                                                                  | P14-05                 | EC14-4         |
| D14-7       | `src/main/analysis/store/`, `src/renderer/src/views/analyses/`                                                                                                              | P14-06                 | EC14-4         |
| D14-8       | `src/main/analysis/controller/` (shaper, budget, stops, split, locks)                                                                                                       | P14-00, P14-07, P14-11 | EC14-6         |
| D14-9       | `bench/results/p14/`                                                                                                                                                        | P14-08                 | EC14-1, EC14-5 |
| D14-10      | Scope table, init guard, OpenAI wiring                                                                                                                                      | P14-04                 | EC14-3         |
| D14-11      | Model check and migration                                                                                                                                                   | P14-10                 | EC14-7         |
| D14-12      | `CODEOWNERS`, `scripts/review/applicability.json`; `docs/ds/07`, `08` rows; `docs/ARCHITECTURE.md`                                                                          | P14-12, all            | DoD-3          |
| D14-13      | Tests under `tests/main/{analysis,journal,provenance,context,compute}/`, `tests/mcp-server-ds/` (env scrub), `tests/e2e/`; the `applyCaps` amendment in `src/main/compute/` | all                    | all            |

## 5. Exit Checklist

| EC / DoD | Check                                                                                                                                                                                                                                                                                                                                                       | Evidence                                   | State |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----- |
| EC14-1   | M-04 = 0 **and** M-19 ≥ 90% on dev, both providers. The scorer recomputes the tokenizer, citation resolution against journal outputs, the literal heuristics (Python and SQL, re-parsing the journalled code), **the monkeypatch taint** and the constant rule; it reads only M-06's lock record from the app (Q-N8)                                        | `bench/results/p14/`                       | Open  |
| EC14-2   | M-11 = 0 for this phase's build (P13's escape result); M-12 = 0 with at least one measurable fixture per channel                                                                                                                                                                                                                                            | CI artifact + bench                        | Open  |
| EC14-3   | Parity test passes (builders and runtime)                                                                                                                                                                                                                                                                                                                   | unit test                                  | Open  |
| EC14-4   | A reopened analysis shows the same journal (hash chain verifies) and transcript; Continue keeps spent budgets, split and lock; a second Continue is refused while open                                                                                                                                                                                      | e2e                                        | Open  |
| EC14-5   | PA-02 = 100%, where the denominator is **attempted** delegations including rejected ones, pooled over the dev tasks whose task file sets `requires_delegation: true` (P12-03 field; 0/0 over the pool is unmeasured and fails); PA-09's unprovenanced-numbers half = 0 (Q-L5, D-NNN at sign-off; P21 gains the sections half); M-18 recorded for every role | bench                                      | Open  |
| EC14-6   | Controller tests: structural row counting over every container and string; 20 per call across result, stdout and `get_output`; 200 per analysis across both servers; the train-only rebuild (fixture split); durability before effects; rebuild on reopen; the exclusive lock                                                                               | `tests/main/analysis/controller/*.test.ts` | Open  |
| EC14-7   | Every stop reason produces a code-built partial report; a retired model id shows the switch action                                                                                                                                                                                                                                                          | unit + e2e                                 | Open  |
| EC14-8   | One test per counting rule (string leaf, any sequence, long stdout line, traceback lines, DuckDB error text); the env-scrub test; the data-read flag survives Continue                                                                                                                                                                                      | unit                                       | Open  |
| DoD 1–8  | As roadmap §17                                                                                                                                                                                                                                                                                                                                              | —                                          | Open  |

## 6. Phase Risks

| Risk                                                         | Mitigation                                                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provenance friction makes the agent loop on citations (R-06) | The agent may mark `[[unverified]]`; questions' numbers and enumerated policy constants count; a citation retry class (`citation_failed`, from the checker's result) |
| Context builder starves roles (R-17)                         | Fetch-by-id rates measured; budgets tuned by D-NNN                                                                                                                   |
| Pipe or relay flakiness under compare mode                   | Lease cap (P13); compare runs in the e2e                                                                                                                             |
| Scope creep into analysis features                           | The "Rule for the phase"; kernel replay deferred to P21                                                                                                              |

## 7. Hand-off to P15

- `run_python` and snapshots, used by the wrangler
- Journal and lineage fields that `save_derived_dataset` extends; the artifact class from P13-10
- The context builder, which new roles plug into
- The split-at-`save_plan` mechanism, which P17 extends
