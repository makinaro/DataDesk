# P11 Plan: Analyst Architecture & Design

| Field     | Value                                                                                                                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P11 of P10–P23 (roadmap §10)                                                                                                                                                                                                                                                                                                  |
| Milestone | M1 Foundation                                                                                                                                                                                                                                                                                                                 |
| Objective | Design every component, interface and schema needed through MVP                                                                                                                                                                                                                                                               |
| Entry     | **P10 closed:** P10 signed off (DS-01..DS-23 recorded as D-030..D-045) **and** P10's work merged, so `docs/ds/01`–`05` exist                                                                                                                                                                                                  |
| Size      | L (6–7 sessions)                                                                                                                                                                                                                                                                                                              |
| Branch    | `phase-11-architecture`                                                                                                                                                                                                                                                                                                       |
| Spend     | **$0.** Every probe runs against a local scripted Messages endpoint (`ANTHROPIC_BASE_URL`), so it is free and any contributor can rerun it (P11 audit Q-F6)                                                                                                                                                                   |
| Inputs    | `docs/ds/01`–`05` (P10) · `planning/plans/P10-questionnaire.md` (answers) · `DECISIONS.md` · `docs/ARCHITECTURE.md` · `src/main/agent/**`, `src/mcp-server/**`                                                                                                                                                                |
| Outputs   | D11-1 ADRs (D-NNN + `docs/ds/adr/ADR-01..13.md`) · D11-2 zod schemas `src/shared/ds/` · D11-3 interface contracts `docs/ds/07-interfaces.md` · D11-4 threat model `docs/ds/08-threat-model.md` · D11-5 `docs/ARCHITECTURE.md` · D11-6 `docs/ds/06-context-contracts.md` · D11-7 `.claude/skills/context-engineering/SKILL.md` |
| Status    | Audited (3 rounds, `P11-audit.md`); all findings fixed; maintainer defaults pending (Q-D, Q-F, Q-G); awaiting sign-off                                                                                                                                                                                                        |

**Rule for the phase:** design and schemas only. The only code is zod schemas with their tests,
the migration registry's pure functions with their fixture tests (P11-15), and one throwaway
probe per unverified SDK or runtime fact. Nothing runs Python for analysis yet; that is P13.

**Probe evidence** means a probe script committed under `docs/ds/adr/probes/` plus its captured
output, with the versions used, that a contributor other than the author can rerun.

**Terms used in this plan:**

- **Conversation controller:** created by main at a conversation's **first agent tool call**, it
  meters and journals **every** controller-routed call from then on, so nothing runs unmetered
  before a plan exists. The per-call cap of **20 rows** applies to every agent-instance tool at
  all times (today's `run_sql` default of 500 rows is lowered for the agent instance; D-033).
- **Analysis:** a phase inside the conversation controller: one user question worked end to end,
  with one plan, one split, one test evaluation and one budget ($1, 200 rows, 48 KB). **Code opens
  it, never the agent:** at the first `save_plan`, or, for row-returning calls before any plan, an
  implicit pre-plan analysis that shares the same caps. Delivering the report marks it
  **complete**; a follow-up turn **reopens the same analysis with its spent budgets**, so a $1
  stop stays a stop. Only the user starts a new analysis ("New analysis" or a new conversation).
  The per-conversation `maxBudgetUsd` ($2) bounds spend across analyses. Each compare-mode lane
  has its own controller.
- **Split record:** `(lineage root dataset, target, kind, seed, test row ids held by main)`. A
  later analysis in the same conversation may create a new split only on rows that never served
  as test rows there; otherwise its report states that no clean test set exists (P11 audit Q-G4).
- **Analysis controller:** the object in main that owns all per-analysis state (below).
- **Kernel lease:** a compute window held by one analysis while it is active.
- **Active time:** the 20-minute wall clock counts the sum of journalled active intervals, so an analysis reopened the next day isn't already over time.
- **Evaluation kernel:** a fresh, short-lived compute window on its **own session partition**,
  used only by `predict` and `evaluate_on_test`. The pickle it loads **is** agent-produced code, so it is contained like any kernel: own partition, no network, and it returns
  predictions or an **error class only** (no messages or tracebacks).

---

## 1. Inherited Decisions and Inputs

| Source              | What it forces in P11                                                                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-002, D-003        | MCP servers are stdio children on the Electron binary as Node; DuckDB is in memory per process. A compute host that needs a Chromium sandbox can't live inside such a child (Q1)                                                                                                   |
| D-009               | `run_sql` stays read-only; derived datasets are new read-only views (ADR-05)                                                                                                                                                                                                       |
| D-013, D-017, D-021 | Claude CLI owns the transcript; one scope table feeds both providers; the OpenAI tools are DataDesk-built                                                                                                                                                                          |
| D-014, D-018        | The CLI passes its own environment (including `ANTHROPIC_API_KEY` and `DATADESK_OPENAI_API_KEY`) to MCP children, and server `env` config ends up on the command line. So pipe tokens travel in the CLI env, and `datadesk-ds` keeps only an **allowlist** of variables at startup |
| D-016, D-029, D-043 | Artifacts by id; DataDesk deletes only its own files; derived data is capped at 2 GB per analysis with atomic writes                                                                                                                                                               |
| D-031, DS-02        | Pyodide in a sandboxed hidden window, CPython fallback; ≤ 50M cells and ≤ 200 columns in Python; 120 s per execution; memory warning on > 500 MB growth, hard kill at 2 GB (Q-D3 maintainer answer, amends D-031); 8 KB per output                                                 |
| D-033               | ≤ 20 rows per call and ≤ 200 per analysis across **every** channel; 48 KB output budget per analysis                                                                                                                                                                               |
| D-035               | Test rows held outside the kernel and scored once per analysis (ADR-11)                                                                                                                                                                                                            |
| D-039, DS-19        | Context budgets (16k lead, 8k specialists…); a code-built state card; the Claude lead budget is report-only until P11-12 verifies it can be enforced                                                                                                                               |
| D-038, DS-20        | The judge is Claude Opus; a run that used Opus in any role gets a `same-model` score that can't block; calibrated with κ; blocks only on clear failures with peer confirmation (option B)                                                                                          |
| D-032, P10 Q5, Q6   | Structured, versioned plan before any execution; $1 per analysis, 20-min cap, 3 retries per error class; any stop writes a partial report built by code                                                                                                                            |
| D-034               | Paid runs (bench, judge, probes) go through the paid-run runner and need a maintainer's spend approval                                                                                                                                                                             |
| P10 Q7              | Per-role model field in the scope table (`inherit`)                                                                                                                                                                                                                                |
| P10 Q25, Q27        | Typed lesson effects; content-hash dataset identity                                                                                                                                                                                                                                |
| D-045, P10 Q45      | Schema versioning and migrations for everything in `userData` (P11-15)                                                                                                                                                                                                             |
| ADR-01 (this phase) | The compute window uses a dedicated `compute://` scheme on its own session partition, with Pyodide in a Web Worker; never `app://`. P13 Q1–Q2 build on this decision                                                                                                               |

## 2. Session Plan

| Session | Work items                     | Output at end of session                                                                                      |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1       | P11-01, P11-02 (probes)        | Probe evidence: compute window, worker globals, pipe, correlation-id stamping, `datadesk-ds` env, DuckDB COPY |
| 2       | P11-01, P11-02, P11-16         | ADR-01 compute host and hand-off; ADR-02 process model and analysis controller; ADR-11 split and test lock    |
| 3       | P11-03, P11-04, P11-05         | ADR-03 journal; ADR-04 provenance; ADR-05 derived datasets and snapshot cache                                 |
| 4       | P11-06, P11-07, P11-08         | ADR-06 model store; ADR-07 lessons; ADR-08 parity                                                             |
| 5       | P11-11, P11-12, P11-14         | ADR-12 budgets and limits; ADR-09 context (after its probes); ADR-10 evaluation                               |
| 6       | P11-09, P11-15, P11-13         | Schemas with tests; ADR-13 versioning and the migration registry; interfaces; contributor skill               |
| 7       | P11-10, ARCHITECTURE.md, audit | Threat model; `docs/ARCHITECTURE.md`; plan-auditor on the ADRs                                                |

## 3. Work Item Breakdown

### P11-01 ADR-01 compute host and data hand-off

- [ ] Probe: a hidden `BrowserWindow` (`sandbox: true`, no preload Node, its own session partition) loads Pyodide from a **`compute://` scheme handled only on the compute partitions (the scheme itself is registered app-wide)**, inside a Web Worker, and runs `import numpy` offline. The scheme serves only an allowlist of bundled files; `session.webRequest` denies every other URL. The window gets a compute CSP variant added to `src/main/security/csp.ts` (`connect-src` limited to `compute:` for package loading, `'wasm-unsafe-eval'` if needed), so CLAUDE.md rule 2 still names one CSP file
- [ ] Probe (allowlist, not deny-list): from Python in the worker, enumerate everything reachable through `js` and assert it equals an expected set. Assert that `require`, `process`, network constructors (`fetch` outside `compute:`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `RTCPeerConnection`, `sendBeacon`), `BroadcastChannel`, storage (`localStorage`, `indexedDB`, `caches`) and the UI's `window.datadesk` are unreachable or fail
- [ ] Decide the hand-off format (Q2) and the snapshot cache (key includes the split id; counted in the D-043 cap)
- [ ] The snapshot statement is checked **as a whole**: `extractStatements` on the final `COPY (SELECT …) TO …` must return exactly one COPY whose inner query is a SELECT
- [ ] Verify DuckDB `COPY … TO` Parquet works under `enable_external_access=false` with `allowed_directories` set to `<analysis>/snapshots/` **with a trailing separator** (prefix match, D-009)
- [ ] Design the **CPython fallback** to the same isolation bar, buildable by the unelevated per-user installer (D-023): a bundled CPython child in a Windows **AppContainer** (no network capability, a working folder grant only), with an explicitly built env and the same tool contract. Firewall rules (need elevation), Job Objects and restricted tokens (don't block sockets) are rejected. on a no-go, P13 stops and phase P13b builds and tests it (P13 audit) (P11 audit Q-F4). Launching into an AppContainer needs `CreateProcess` with `SECURITY_CAPABILITIES`, which Node lacks: a small native helper (verify item), and the pipe and folder ACLs must grant the AppContainer SID

**Done when:** ADR-01 states the host, its isolation settings, the fallback and the probe evidence. **Depends on:** Q1, Q2.

### P11-02 ADR-02 process model and the analysis controller

- [ ] One **conversation controller** in main (terms), with an analysis phase inside it, owns: the journal writer, the row and byte budget (D-033, across every channel), the USD meter, the wall clock, retry counters, the kernel lease, the split and test lock, and role attribution
- [ ] `datadesk-ds` (a relay) and `datadesk-mcp` (which runs queries itself) both report to the controller, **one pipe per server**, each with its own token. **Every datadesk-mcp tool that returns rows or sends data out** (`run_sql`, `sample_rows`, `profile_column`, `search_columns`, `second_opinion`) reserves row and byte budget through the controller before it returns; **`second_opinion` and `search_columns` are off during every analysis, with no override**, because they send rows to OpenAI's endpoints on the Claude path, which D-033's egress allowlist doesn't cover (P11 audit Q-G2)
- [ ] After the split, the controller has the agent instance of `datadesk-mcp` rebuild its DuckDB so the **split source** is visible only as its train rows and **every dataset whose lineage or content hash includes it is hidden entirely** (no row mapping exists, P15 audit); unrelated datasets stay visible (Q-F2, Q-G1); the lockdown can't be reconfigured, so it is a rebuild
- [ ] Pipe mode is fixed by main at spawn: the agent instance of `datadesk-mcp` requires the pipe and fails closed without it; the UI instance (D-018) doesn't connect
- [ ] **Correlation ids:** main stamps every controller-routed tool call with a **single-use** id mapped to the calling role (PreToolUse input carries `agent_id`/`agent_type`): on Claude in the PreToolUse hook through `updatedInput`, on OpenAI in the tool wrapper. The servers forward the id; the controller refuses a missing or reused id. Probes: whether `updatedInput` applies **without** `permissionDecision: 'allow'` (the scope hook never allows, so `canUseTool` keeps running), and whether the field must be declared in each tool's input schema. If stamping needs `allow`, design the fallback before ADR-02 is accepted
- [ ] Draw both providers' call paths to `run_python` and `run_sql`, with the owner of each piece of state
- [ ] Pipe: zod-validated messages in both directions; a reconnect with the server's token **replaces** the previous connection (one live client per pipe), so a CLI restart of a server works; verify whether a Windows named pipe can be restricted to the current user from Node (if not, the random name + per-server token + one live client are the control, and the threat model says so); measure the relay's added latency
- [ ] `datadesk-ds` startup keeps only an **allowlist** of variables (`SystemRoot`, `PATH`, `TEMP`, `TMP`, and its own `DATADESK_DS_*` pipe name and token) and deletes everything else, including `DATADESK_OPENAI_API_KEY`; it then deletes the token variable after reading it. Pipe names and tokens travel in the CLI env (never `--mcp-config`, D-018). Probe the child's env on the Claude path

**Done when:** each tool call path has exactly one owner of each piece of state, and the correlation-id mechanism has probe evidence. **Depends on:** Q1.

### P11-03 ADR-03 analysis journal

- [ ] Storage format, single writer (main), large outputs by hash (Q3)
- [ ] Crash rules: blobs are written (temp + rename) **before** the entry that references them; **every record whose effect leaves the process is written and fsynced before the effect:** row and byte reservations before rows are returned, spend before the next call, the test-evaluated record before metrics are returned, and the wall-clock start; `fsync` also on execution-finished and analysis-end entries; a partial last line is truncated on open; an execution `started` without `finished` gets an `aborted` entry when the journal is next opened; ENOSPC on an append stops the analysis (fail closed), and the code-built partial report is shown in the UI from memory and written when space allows
- [ ] Kernel resets (by the agent, a 2 GB kill or a timeout) are journalled and reported to the agent in the next tool result
- [ ] On reopen (FR-19), the controller **rebuilds its state from the journal**: budgets spent, split, test lock, retries and the active time
- [ ] `index.json` is derived: when it disagrees with the journals, it is rebuilt from them
- [ ] The hash chain detects truncation and edits **relative to an anchor**: the head hash is recorded in the score file at scoring time and in committed run summaries (D-036), so a later edit is detected. In the app the chain detects corruption only; the plan doesn't claim more
- [ ] Migration (with P11-15): each entry carries `schemaVersion`; old entries are migrated **in memory** on read; the file is never rewritten; new entries are appended at the current version; the chain hashes the stored bytes

**Done when:** a crash at any byte leaves a readable journal (stated, tested in P14).

### P11-04 ADR-04 provenance

- [ ] Cell-level citations `[[out:<id>#<path>]]`; number parsing (locale, %, k/M/B, parentheses); matching rules; rendering (Q4)
- [ ] **Tokenizer, specified in the ADR with fixtures:** numeric tokens are extracted from prose only; not extracted: digits inside citation markers and code spans, identifiers containing letters (`sales_2023`), ISO dates, and list and heading numbers (Markdown structure, by the parser)
- [ ] M-19 counting: the denominator is every extracted token (D-036). Provenanced = cited and matched, quoted verbatim from the user's question, or a policy constant declared in the analysis plan (α, interval level); nothing else is exempt
- [ ] The agent marks a number it can't cite with **`[[unverified]]`**. **M-04 is measured on the agent's text before code adds any mark:** numeric tokens with neither a valid citation nor an agent `[[unverified]]` mark. M-19 then penalises overuse of the mark. Roadmap M-04 and M-19 are updated to match; spelled-out numbers are a v1.0 limitation, and chart values are provenanced by construction (charts render from outputs)
- [ ] A **literal-in-code heuristic:** the code that produced a cited value is parsed with Python's `ast` in a helper kernel (no agent code runs there), constant-folded, and a cited value equal to a folded literal is flagged and not counted as provenanced; parameters declared in the plan are exempt. It is a heuristic and is documented as one (P11 audit Q-F7)

### P11-05 ADR-05 derived datasets, snapshot cache and lineage

- [ ] Storage per D-043; catalog fields; `allowed_paths` extension; the 2 GB cap per analysis covers derived datasets **and** snapshots; snapshots are deleted with their analysis
- [ ] **One snapshot folder per split epoch** (`<analysis>/snapshots/<epoch>/`, trailing separator in `allowed_directories`): at `make_split`, the pre-split folder is deleted and the new DuckDB is granted only the new epoch's folder. Test data lives outside every DuckDB grant
- [ ] The catalog's single writer stays the UI instance of `datadesk-mcp`; `save_derived_dataset` asks it through main. Catalog migrations run in main **before** the children are spawned, using pure migration functions in `src/shared/ds/`

### P11-06 ADR-06 model store and predict

- [ ] Format, hash verification, load only inside the sandbox, schema check on predict (Q5)
- [ ] The manifest is written by main from host-known values (library versions of the bundled runtime, the split id, the feature schema from the training snapshot), never reported by the kernel
- [ ] `predict` and `evaluate_on_test` load the pickle only in an **evaluation kernel** (terms): its own window and partition, counted in the lease cap, returning predictions or an error class only; the analysis kernel never loads a saved model

### P11-07 ADR-07 lessons and notes

- [ ] Lessons are **pushed** by the context builder; there is no agent-callable retrieval tool (P20 audit). Store, typed effects (D-037), retrieval method (Q6) with trigger fields as code-mapped enums, promotion and decay, approval flow
- [ ] BM25 indexes only a lesson's title and trigger fields, each length-capped, so keyword stuffing in free text can't win ranking; bench runs use the fresh per-run profile (P12-07), so dev-run lessons reach a holdout run only inside a declared P20 sequence (P12-07 `--sequence`)

### P11-08 ADR-08 provider parity

- [ ] New roles and tools on OpenAI (agents-as-tools, Q7); parity test design covering option builders **and** runtime behaviour (budget stop, row budget, brief rejection) with fake streams

### P11-09 Schemas and contracts

- [ ] zod in `src/shared/ds/` for §12.1–12.12: the §12.1–12.11 schemas, the state card, the lesson `effect`, the **key-results block** (with `issues[]`, P12 Q6, and `predictions_ref`, P12-03), the typed analysis-plan fields, the critic review pack, the spend approval and the judge-block record, the forecast `selection` record (P18) (the review-suite verdict lives in `scripts/review/`, P10-09); plus the **journal entry envelope** (`seq`, `prevHash`, type, `correlationId`, role, `schemaVersion`), the **split and test-lock record**, the main-written **model manifest** and the **pipe messages**. §12.2 execution status gains `aborted` and `compute_busy`; §12.8 score gains `journalHeadHash`
- [ ] Each schema has a valid sample and **one invalid sample per constraint or refinement**
- [ ] Tool contracts (owner, inputs, outputs, errors, max output size) in `docs/ds/07-interfaces.md` for this fixed list: `run_python`, `get_output`, `restart_kernel`, `save_plan`, `make_split`, `evaluate_on_test`, `save_model`, `predict`, `save_derived_dataset`, and the controller hand-off of `run_sql`, `sample_rows`, `profile_column`, `search_columns` and `second_opinion`. A tool added later adds its row in its phase
- [ ] IPC and channel contracts (CLAUDE.md rule 3): compute window ↔ main, the relay pipe protocol, and every new renderer channel

### P11-10 Threat model

- [ ] One canonical surface list, each with a STRIDE row, an attack sequence, its control and the proving test (Q10): compute host and FFI; compute window ↔ main channel; the pipe; `datadesk-ds` env (second-hop secrets); the snapshot query and cache; `run_python` output (exfiltration); in-kernel instrumentation the agent code can unwrap; derived data (disk exhaustion); model files (planted pickles); split and test lock; lessons (planted); briefs (oversize or injected); the notebook export (agent code run unsandboxed in the user's Jupyter); bench keys (reachability); the judge (manipulation through the analyst's output); changes to the init-guard allowlist; **data leaving through datadesk-mcp tools** (`sample_rows`, `profile_column`, `second_opinion`); the **evaluation kernel** (its error channel). 18 surfaces

### P11-11 ADR-12 budgets and limits

- [ ] USD: where the $1 meter lives and how it stops a run on each provider (Q11); verify per-token prices and whether **sub-agent** assistant messages carry `usage` in the Claude stream
- [ ] **Every call has a per-call max-output cap on both providers** (P11 audit Q-F5; probe how to set it on the Claude CLI path and in the Agents SDK). The stop fires when spend + the worst-case cost of the **next round of calls** (each in-flight or parallel sub-agent call: its current context × input price + its output cap × output price, summed) reaches the cap. ADR-12 states the resulting maximum overshoot
- [ ] Turns, the 20-min wall clock (queue waits count, Q1), the per-execution limits, 3 retries per error class (D-032), and the partial report built by code on any stop, including a provider outage

### P11-12 ADR-09 context architecture

- [ ] Context contract per role (D-039 budgets), the brief schema and its enforcement point (Q9), the state card, tool-output shaping, prompt caching
- [ ] Probes (against the local scripted endpoint): whether the CLI consults `canUseTool` for the `Agent` tool, whether the PreToolUse hook can rewrite its input, SDK compaction controls, and whether the Claude lead's budget can be enforced (D-039). If the validate-and-deny fallback is used on Claude, its loss of code-rendering is recorded as a D-NNN waiver (D-032)
- [ ] Facts in a brief are fenced as data in the code-rendered template (§8.5 rule 4)

### P11-13 Contributor skill `context-engineering`

- [ ] Checklist from roadmap §8.5 and P10 Q39, with examples from this repo's own prompts

### P11-14 ADR-10 evaluation design

- [ ] The four layers, where the judge runs (Q12), rubric v1 anchors, the calibration protocol (P10 Q35), the `same-model` rule (D-038), judge spend through the paid-run runner (D-034)

### P11-15 ADR-13 schema versioning and migrations

- [ ] `schemaVersion` on every persisted schema; a migration registry in main; a policy for unknown future versions (Q8)
- [ ] Today's unversioned files (`catalog.json`, settings, the appearance store) are **v0**, with a v0→v1 migration and frozen fixtures

### P11-16 ADR-11 split, test lock and evaluation isolation (added by the P11 audit)

- [ ] `make_split` writes train and test Parquet through the controller; the test rows never enter any kernel the agent's code runs in
- [ ] `make_split` **restarts the kernel**, so frames loaded before the split are gone, and journals the reset
- [ ] After the split, **both** DuckDBs the agent reaches are rebuilt to see only train data: `datadesk-ds`'s snapshot DuckDB (granted only the new epoch folder, P11-05) and the agent instance of `datadesk-mcp` (train views only, P11-02). Snapshot cache keys include the split id
- [ ] **The split is made by code before any execution reads the data:** for predictive and forecast plan types, `save_plan` names the dataset id, target and kind, and the controller computes the split then (Q-G1). `make_split(dataset_id, …)` exists only for plans revised to a predictive type, and refuses when any execution has already read that dataset in the analysis
- [ ] Once per analysis; the split record follows the rules in the terms; a second split of the same rows is refused
- [ ] `evaluate_on_test` and `predict` on test features refuse any model whose main-written manifest split id differs from the current split
- [ ] Derived datasets and saved models made from the split source **before** the split can't exist for predictive plans (the split comes first); for a revised plan, they are hidden by the lineage rule above
- [ ] `evaluate_on_test` sends test **features only** to an evaluation kernel that loads the fitted pipeline from the model store; **metrics are computed by code in main** from the returned predictions and host-held labels; the test-evaluated record is fsynced before metrics are returned; **any attempt that reaches the evaluation kernel spends the test lock** (amended by the P17 audit: a pre-flight on train rows in an evaluation-kernel instance holding no test data doesn't; resuming the **same model hash** against the same `evaluation_dispatched` record after a host crash isn't a new attempt; P17 and P18 add fit-capable harness variants that build models from declarative specs and load no pickle), including an error, a kill or `compute_busy` after dispatch; test predictions are **never** returned through `get_output` or any agent-visible output, only the metrics
- [ ] Main's metric code (ROC-AUC, PR-AUC, Brier, RMSE, MASE, bootstrap) is tested against **golden vectors computed in the reference env** (P12), so M-07 isn't biased by a second implementation
- [ ] Permutation importance is computed on a training validation fold, never on the test set (amends P17 Q4)
- [ ] Instrumentation that feeds PA metrics from inside the kernel is advisory; anything scored comes from the controller

**Done when:** every route by which test rows could reach the analysis kernel or the agent is listed with its control and named P14/P17 test.

## 4. Deliverable Map

| Deliverable | File path                                                       | Produced by                | Satisfies |
| ----------- | --------------------------------------------------------------- | -------------------------- | --------- |
| D11-1       | `docs/ds/adr/ADR-01..13.md` + `docs/ds/adr/probes/` + D-NNN     | P11-01..08, 11, 12, 14..16 | EC11-5    |
| D11-2       | `src/shared/ds/*.ts` + `tests/shared/ds/*.test.ts` + migrations | P11-09, P11-15             | EC11-1    |
| D11-3       | `docs/ds/07-interfaces.md`                                      | P11-09                     | EC11-2    |
| D11-4       | `docs/ds/08-threat-model.md`                                    | P11-10                     | EC11-3    |
| D11-5       | `docs/ARCHITECTURE.md`                                          | all                        | DoD-3     |
| D11-6       | `docs/ds/06-context-contracts.md`                               | P11-12                     | EC11-4    |
| D11-7       | `.claude/skills/context-engineering/SKILL.md`                   | P11-13                     | EC11-4    |

## 5. Exit Checklist

| EC / DoD      | Check                                                                                                                    | Evidence                | State |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ----- |
| EC11-1        | Every schema in P11-09's list in zod, with `schemaVersion`, a valid sample and one invalid sample per constraint         | `npm run check`         | Open  |
| EC11-2        | Every tool in P11-09's fixed list, and every channel, has an owner, inputs, outputs, failure modes and a max output size | `docs/ds/07`            | Open  |
| EC11-3        | Every one of the 18 surfaces in P11-10's list has an attack sequence, a control and a named proving test                 | `docs/ds/08`            | Open  |
| EC11-4        | Every role has a context contract with a token budget                                                                    | `docs/ds/06`            | Open  |
| EC11-5        | plan-auditor READY on the ADRs; every probe-dependent ADR links its probe evidence                                       | `P11-audit.md`, probes/ | Open  |
| DoD-1, DoD-4  | n/a (no benchmark runs)                                                                                                  | —                       | n/a   |
| DoD-2, 3, 5–8 | As roadmap §17                                                                                                           | —                       | Open  |

## 6. Phase Risks

| Risk                                                                                           | Mitigation                                                            |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| The hidden-window host turns out impossible to drive from an MCP child (R-01)                  | Q1 probes in session 1, before any other ADR depends on it            |
| Correlation ids can't be stamped on the Claude path                                            | Probe in session 1; ADR-02 isn't accepted without a working mechanism |
| SDK facts (compaction, cost reporting, `canUseTool` on `Agent`) differ from assumptions (R-12) | docs-researcher plus one probe each; ADRs cite version and URL        |
| Schemas over-designed before use                                                               | Only the §12 required fields; extensions need a P14+ need             |
| Threat model becomes a checklist nobody tests                                                  | Every control names the P13/P14 test that proves it                   |

## 7. Hand-off to P12 and P13

- `src/shared/ds/` schemas (bench task, answer key, key-results block, score, rubric score, spend approval, judge-block record) → P12
- ADR-01/02/11 and `docs/ds/08` → P13's spike and escape suite
- `docs/ds/06` context contracts → P14's context builder
