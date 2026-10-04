# P11 Questionnaire: Decisions Needed Before Architecture & Design

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle the architecture choices the ADRs depend on                                                                           |
| Already decided | DS-01..DS-23 and the P10 answers, recorded as D-030..D-045 (drafted in `planning/decisions-draft.md`; P10 not signed off)    |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation |

---

## A. Compute and Process Model

**Q1. Who owns the compute host?** Today every MCP server is a stdio child running Electron as
Node (D-003), and such a child can't open a sandboxed `BrowserWindow`. Options: (a) main owns
the compute window, and a thin `datadesk-ds` stdio server relays tool calls to main over an
authenticated local pipe; (b) main hosts the DS tools itself (an in-process SDK MCP server for
Claude, function tools for OpenAI); (c) Pyodide in a Node worker with its JS globals stripped;
(d) `datadesk-ds` runs as a full Electron process that opens its own hidden window.
_Blocks: P11-01, P11-02, P13._

> **Recommendation (Claude):** (a). It keeps the MCP-server pattern for both providers, keeps
> the sandboxed renderer, and puts the journal writer in one place (main).

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** (a), hardened. Main owns the compute host (one hidden sandboxed window per active agent session, at most 2 at once, others queued) and the journal writer. `datadesk-ds` is a stdio MCP server that connects back to main over a **per-session named pipe with a random name and a one-time token passed in its explicitly built env** (rule 5). The pipe accepts exactly one client and dies with the session. The relay holds no state.
>
> **Why:** Only (a) and (d) keep a Chromium-sandboxed host, and only (a) keeps one owner per piece of state: main owns the window, the journal and the budget meter. Tools stay MCP for both providers, so the init guard and scope table treat them like `datadesk-mcp` (D-017, D-021). Capping the windows bounds memory in compare mode (three sessions).
>
> **Rejected:** (b) in-process tools (two tool paths, Claude SDK MCP vs OpenAI function tools, and it drops the stdio pattern D-002 chose); (c) a Node worker (Pyodide's `js` FFI reaches whatever globals remain, a deny-list escape); (d) a second Electron instance per session (~150 MB each, and its own window lifecycle outside main's control).
>
> **Recommendation was:** refined (pipe authentication, single client, window cap).
>
> **Consequences:** ADR-02; P13-02 builds the host in main; the threat model adds "another local process connects to the pipe"; P14-01 builds the relay.
>
> **Revisit if:** the P11-01 probes show the relay adds more than 50 ms per call or pipe security can't be made per-user on Windows.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Main holds one **analysis controller** per analysis that owns the journal, the row and byte budget across **every** channel (including `run_sql` in `datadesk-mcp`), the USD meter, the wall clock, retry counters, the kernel lease, the split and test lock, and role attribution. Both servers are relays to it over the authenticated pipe; `datadesk-ds`'s only local state is its snapshot DuckDB (Q2), which is a cache, not a record. **Correlation ids:** main stamps every DS and SQL tool call with an id mapped to the calling role (Claude: PreToolUse `updatedInput`; OpenAI: the tool wrapper); calls without a valid id are refused (P11-02 probes this). **Leases are per analysis, not per session:** at most 3 windows (one per compare lane), each hard-killed at 3 GB; a new lease is refused when free memory is under 4 GB; a queued call waits ≤ 60 s and then fails with `compute_busy`; the wait is journalled and counts against the 20-min wall clock, not the 120 s execution limit; an idle lease is released after 10 minutes (kernel loss journalled). The pipe's messages are zod-validated, the pipe is re-created if the CLI restarts a server, and the 50 ms trigger is measured by the P11-02 probe. `datadesk-ds` runs `scrubSecrets` at startup and reads its token from a `DATADESK_*` variable it deletes after reading (D-014). Rejecting (b) rests on its loss of the stdio pattern and the init guard, not on "two tool paths" (D-021 already wraps OpenAI tools). **Pending maintainer (P11 audit Q-D1, Q-D2, Q-D3).**
>
> **Audit resolution, round 2 (2026-10-03):** **Window cap including evaluation kernels:** at most 4 windows: 3 analysis leases (one per compare lane) plus 1 evaluation-kernel slot, queued like any lease. **Secrets:** `datadesk-ds` keeps only an allowlist of env variables, because `scrubSecrets` keeps every `DATADESK_*` name and the CLI env carries `DATADESK_OPENAI_API_KEY`. **Tokens:** pipe names and tokens travel in the CLI env (server `env` config ends up on the command line, D-018); there is **one pipe and one token per server**, and a reconnect with the token replaces the previous connection, so a CLI restart works. `datadesk-mcp` executes queries itself and reports to the controller; it isn't a relay. Every datadesk-mcp tool that returns rows or sends data out reports to the controller (Q-F3). The analysis lifecycle is owned by code (P11 plan, terms; Q-F1).
>
> **Audit resolution, round 3 (2026-10-03):** Supersedes the round-1 wording "both servers are relays", "`scrubSecrets` at startup" and "at most 3 windows" (see round 2). A **conversation controller** exists from the first agent tool call and meters every routed call, with the 20-row per-call cap always on; an analysis is a phase inside it, and a follow-up reopens it with its spent budgets (Q-G3). `second_opinion` and `search_columns` are **off during every analysis, no override**, because they send rows to OpenAI's endpoints, which D-033's egress allowlist doesn't cover (Q-G2).

**Q2. How does data get from DuckDB to Python?**
_Blocks: P11-01, P14-01._

> **Recommendation (Claude):** DuckDB writes a Parquet snapshot of the requested dataset or
> query into the analysis scratch folder, named by content hash. Main reads the bytes and writes
> them into Pyodide's in-memory filesystem, read-only. Snapshots are cached by hash.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** `datadesk-ds` runs its **own** DuckDB with read access to the dataset files and **write access only to `<analysis>/snapshots/`**. It runs the requested SELECT (validated by the same statement-type guard as `run_sql`, D-009) with `COPY … TO` Parquet. The file is named by SHA-256 of (query text + source content hashes) and reused when it exists. Main reads the bytes and writes them into Pyodide's in-memory filesystem, read-only. Sampling for over-size tables (P10 Q8) happens in this SELECT.
>
> **Why:** The agent's `datadesk-mcp` DuckDB is locked (`enable_external_access=false`, `lock_configuration`, verified in `src/mcp-server/db/datasetDb.ts`), so it can't write snapshots, and loosening it would weaken D-009. A separate DuckDB with a write grant scoped to one folder keeps D-009 intact. Content-hash names make snapshots reproducible and cacheable.
>
> **Rejected:** unlocking `datadesk-mcp` (weakens D-009); main reading raw source files into Python (no XLSX/JSON parsing, no filtering, and 2 GB copies); Arrow IPC streaming (extra plumbing with no gain over a cached file).
>
> **Recommendation was:** refined (who writes the snapshot and why; how D-009 survives).
>
> **Consequences:** ADR-01; P14-01; the threat model covers "snapshot query as an exfiltration or escape vector", controlled by the same SELECT guard and folder grant.
>
> **Revisit if:** snapshot writes dominate execution time on 1M-row tables (P13-05 measures).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Cache keys include the **split id**. After `make_split`, the analysis's DuckDB is rebuilt with only the train snapshot in `allowed_paths`, so `read_csv('<raw path>')` can't reach test rows (ADR-11, P11-16). `allowed_directories` uses `<analysis>/snapshots/` with a trailing separator (prefix match, D-009). Whether `COPY … TO` works under the lockdown with a write directory is a P11-01 probe. Snapshots count toward the D-043 2 GB cap per analysis and are deleted with the analysis.
>
> **Audit resolution, round 2 (2026-10-03):** **Snapshot epochs:** DuckDB's `allowed_directories` grants read as well as write, so pre-split snapshots would stay readable. Each split epoch gets its own folder; at `make_split` the pre-split folder is deleted and the rebuilt DuckDB is granted only the new epoch's folder; test data lives outside every DuckDB grant. The agent instance of `datadesk-mcp` is rebuilt with train views only (Q-F2). The final `COPY (SELECT …) TO …` is checked as a whole with `extractStatements`.
>
> **Audit resolution, round 3 (2026-10-03):** **Test rows can't survive the split through derived data or saved models:** for predictive and forecast plans the split is made by code at `save_plan`, before any execution reads the data; `evaluate_on_test` refuses a model whose manifest split id differs; after a split both DuckDBs show the split source **and every lineage or content-hash descendant** only as train rows, while unrelated datasets stay visible (Q-G1). A later analysis may split only rows that never served as test rows in that conversation, or its report says no clean test set exists (Q-G4).

## B. State and Provenance

**Q3. How is the journal stored?**
_Blocks: P11-03, NFR-06._

> **Recommendation (Claude):** One append-only JSONL file per analysis, written only by main,
> with large outputs as separate files named by hash, and a small index file for listing
> analyses (atomic writes, as for `catalog.json`, D-002).

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** One append-only JSONL file per analysis, written only by main. Each entry carries `seq`, a timestamp and `prevHash` (a hash chain). Outputs over 64 KB are stored as separate files named by SHA-256. A reader tolerates and truncates a partial last line after a crash. `index.json` lists analyses and is written atomically (temp + rename, as for `catalog.json`). Entries are flushed per write.
>
> **Why:** The single writer is main (Q1), so no locking is needed across processes. The hash chain lets the scorer and the provenance checker verify the journal wasn't edited after the fact (NFR-06) at almost no cost. Partial-line recovery makes a crash at any byte survivable, which the plan requires.
>
> **Rejected:** a DuckDB or SQLite file per analysis (a native dependency in main, and file locks); one global journal (contention, and cascade delete gets harder, P10 Q32).
>
> **Recommendation was:** refined (hash chain, crash recovery, flush policy).
>
> **Consequences:** ADR-03; a P14 crash-injection test; the scorer verifies the chain before scoring.
>
> **Revisit if:** journals exceed ~100 MB in normal use (then index entries by seq).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The hash chain proves integrity only **relative to an anchor**: the head hash is written into the score file at scoring time and into committed run summaries, so a later edit is detected; in the app it detects corruption, nothing more. Blobs are written before the entry that references them; `fsync` on execution-finished and analysis-end entries; an orphaned `started` gets an `aborted` entry on next open; ENOSPC on append stops the analysis; `index.json` is rebuilt from journals when they disagree. **Migration:** per entry and in memory; the file is never rewritten; appends use the current version; the chain hashes stored bytes (P11-03).
>
> **Audit resolution, round 2 (2026-10-03):** Every record whose effect leaves the process (row reservations, spend, the test-evaluated record, the wall-clock start) is written and fsynced **before** the effect, and the controller rebuilds its state from the journal on reopen. Under ENOSPC the partial report is shown from memory and written when space allows.

**Q4. How does the provenance checker link a number to its source?**
_Blocks: P11-04, FR-10, M-04._

> **Recommendation (Claude):** The agent cites outputs inline with `[[out:<id>]]`. The checker
> parses each number in the sentence and verifies it against the cited output, allowing for
> rounding. Uncited numbers are searched for in the analysis outputs; if none is found, they are
> marked unverified.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The agent cites `[[out:<id>]]` after a claim. The checker parses numbers (sign, decimals, thousands separators, %, k/M/B, parentheses for negatives) and verifies each against the cited output, with **rounding-aware equality**: shown to k digits, it must equal the value rounded to k digits, and 12.3% matches 0.123. Numbers that need a citation: anything with a decimal or ≥ 2 significant digits. Exempt: small integers 0–10, years, list ordinals, and numbers quoted from the user's question. An uncited number is matched **only against outputs cited in the same paragraph**, never the whole journal; otherwise it is marked unverified.
>
> **Why:** Searching the whole journal for an uncited number produces false matches (a "42" exists in some output somewhere), which would silently inflate provenance and make M-04 lie. The exemptions keep prose natural without opening a loophole for substantive numbers.
>
> **Rejected:** whole-journal search (false positives); citations required on every number including "3 columns" (unreadable prose and costly retries).
>
> **Recommendation was:** overturned (the global fallback search is removed; exemptions defined).
>
> **Consequences:** ADR-04; the report writer and lead prompts get the citation rule; the P14-03 checker; DS-Bench gets a "decoy number" trap.
>
> **Revisit if:** more than 10% of legitimate claims end up unverified because of citation friction.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Citations are **cell-level**, `[[out:<id>#<path>]]`, and each number is matched against that one value, never against a whole output. "Shown to k digits" means k **decimal places** of the number as displayed (after scaling for % and k/M/B). The exemption list is removed: **every numeric token code extracts is in M-19's denominator** (D-036); structural markers (list and heading numbers) aren't extracted, and numbers quoted verbatim from the user's question count as provenanced. So "7%", "$5M", "300" and year-like counts all need a citation. **Pending maintainer (Q-D5)**, since it changes how M-19 counts.
>
> **Audit resolution, round 2 (2026-10-03):** The tokenizer is specified (digits in citation markers, code spans, identifiers with letters, ISO dates and Markdown list/heading numbers aren't extracted); policy constants declared in the plan count as provenanced; **M-04 is measured on the agent's text before code adds marks**; a literal-in-code check flags a cited value that the code printed as a literal (Q-F7).
>
> **Audit resolution, round 3 (2026-10-03):** The agent marks an uncitable number with `[[unverified]]`; M-04 counts numeric tokens with neither a valid citation nor that mark, measured before code marks anything (roadmap M-04 updated, Q-G5). The literal check is a documented heuristic over constant-folded `ast` values, parsed in a helper kernel, with plan-declared parameters exempt. Spelled-out numbers are a v1.0 limitation; chart values are provenanced by construction.

**Q5. What format are saved models stored in?**
_Blocks: P11-06, R-10._

> **Recommendation (Claude):** joblib pickle, created and loaded only inside the sandbox, stored
> under `userData/models/<id>/` with a SHA-256 checked before every load. No import of model
> files from outside in v1.0.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** joblib pickle, created and loaded **only inside the sandbox**. Each model is stored under `userData/models/<id>/` with a manifest (SHA-256, scikit-learn/NumPy/pandas versions, feature schema, training split id). Loading verifies the hash **and** refuses when the library versions differ from the running sandbox's (the user is told to retrain). No import of model files from outside in v1.0.
>
> **Why:** Pickle runs code on load, but inside the sandbox that code has no more power than the agent's own `run_python`, so the risk stays contained (NFR-01). Pickles across scikit-learn versions can load and then silently misbehave, so a version check is a correctness rule, not polish.
>
> **Rejected:** skops or ONNX (availability in Pyodide not verified, and model coverage is partial); loading in main (an arbitrary code execution path into the trusted process).
>
> **Recommendation was:** refined (version check and manifest).
>
> **Consequences:** ADR-06; P17-04 and P17-05; app updates that bump scikit-learn mark old models "retrain needed" (P23 migration note).
>
> **Revisit if:** users need to move models between machines; then design a safe export format.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Persistence makes a pickle more powerful than `run_python`: it runs later, inside another analysis. So the manifest is **written by main from host-known values** (bundled library versions, split id, feature schema from the training snapshot), and `predict` and `evaluate_on_test` load the pickle in a **fresh, short-lived kernel**; the analysis kernel never loads a saved model (P11-06).
>
> **Audit resolution, round 2 (2026-10-03):** The fresh kernel is an **evaluation kernel** on its own window and partition, counted in the lease cap, returning predictions or an **error class only**, so a pickle's exception text can't carry test features out.
>
> **Audit resolution, round 3 (2026-10-03):** The evaluation kernel does run agent-produced code (the pickle), so it is contained like any kernel. **Any attempt that reaches it spends the test lock**, including an error, a kill or `compute_busy` after dispatch, and test predictions are never returned through `get_output` (Q-G6).

**Q6. How are lessons retrieved?**
_Blocks: P11-07, P20-03._

> **Recommendation (Claude):** Structured trigger matching (task type, library, error class,
> dataset hash) plus keyword (BM25) ranking. No embeddings, because only one provider offers
> them and retrieval must work the same on both.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Structured trigger match (task type, library, error class, dataset hash) as a **filter**, then BM25 over lesson text as the **ranking**, with ties broken by confidence and then recency, so ranking is deterministic. No embeddings in v1.0.
>
> **Why:** Retrieval must behave identically on both providers (NFR-14), and embeddings exist only with an OpenAI key. Deterministic ranking keeps runs reproducible and makes M-13 comparable across runs. With hundreds rather than millions of lessons, structured triggers plus BM25 are sufficient.
>
> **Rejected:** embeddings (provider asymmetry, and an extra network call); an LLM choosing lessons (cost, non-determinism, injectable).
>
> **Recommendation was:** kept (deterministic tie-breaking added).
>
> **Consequences:** ADR-07; P20-03 implements BM25 in TypeScript, so no new dependency is needed.
>
> **Revisit if:** the lesson count passes ~5,000 or retrieval precision measured in P20 is poor.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Trigger fields (`library`, `error_class`, task type) are **enums mapped by code** from tracebacks and tool metadata; an unknown class maps to `other`, so agent-defined exception names can't create triggers. BM25 over untrusted lesson text is acceptable only because auto-applied lessons are rendered from structured fields (D-037).
>
> **Audit resolution, round 2 (2026-10-03):** BM25 indexes only length-capped title and trigger fields, so a keyword-stuffed lesson body can't win ranking. Bench runs use a fresh profile per run (P12-07), so dev-run lessons never reach holdout runs.

## C. Providers and Context

**Q7. How do the new roles run on OpenAI?**
_Blocks: P11-08, NFR-14._

> **Recommendation (Claude):** Same as today (D-021): agents-as-tools built from the shared scope
> table, with DS tools reached through `MCPServerStdio` to the same servers.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Agents-as-tools from the shared scope table (D-021), with each OpenAI run connecting through `MCPServerStdio` to both `datadesk-mcp` and `datadesk-ds`. One **parity test** builds the Claude `agents`/`tools` options and the OpenAI tool list from the same table and asserts identical tool sets, limits, per-role model fields (P10 Q7) and brief validation for every role.
>
> **Why:** This reuses the proven Phase 7 mechanism, and the parity test turns NFR-14 into a failing test instead of a review habit.
>
> **Rejected:** a separate OpenAI role definition (drift); a single-agent OpenAI path without sub-agents (breaks per-agent metrics).
>
> **Recommendation was:** kept (the parity test's scope spelled out).
>
> **Consequences:** ADR-08; P14-04.
>
> **Revisit if:** the OpenAI Agents SDK changes how agents-as-tools stream (R-12).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The parity test also covers **runtime** behaviour with fake streams on both providers: the budget stop, the row budget and brief rejection (P11-08).

**Q8. Where do schemas live, and how are they versioned?**
_Blocks: P11-09, P11-15._

> **Recommendation (Claude):** zod in `src/shared/ds/`, each persisted schema with a literal
> `schemaVersion`. Main runs migrations on load; a file with a newer version than the app knows
> is opened read-only with a notice.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** zod in `src/shared/ds/`, with types from `z.infer` (CLAUDE.md). Every **persisted** schema has `schemaVersion: z.literal(n)`. A migration registry in main runs pure functions vN→vN+1 on load, each tested against a frozen fixture file of the old version committed under `tests/fixtures/migrations/`. A file newer than the app opens **read-only** with a notice. There is no downgrade.
>
> **Why:** Frozen fixtures are the only way to prove that an old user's data still opens (P10 Q45), and pure functions keep migrations testable without Electron. Read-only for unknown versions prevents an older app from silently corrupting newer data.
>
> **Rejected:** unversioned schemas (the first release breaks saved analyses); a database migration tool (no database).
>
> **Recommendation was:** refined (fixture-based tests, no downgrade, `z.infer` rule).
>
> **Consequences:** P11-15; every later phase that adds a field bumps the version and adds a fixture; the code-reviewer checks this.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Today's unversioned files (`catalog.json`, settings, the appearance store) are **v0**, with a v0→v1 migration and frozen fixtures (P11-15). Journals migrate per entry in memory (Q3).

**Q9. Where is the delegation brief enforced?**
_Blocks: P11-12, PA-02._

> **Recommendation (Claude):** On Claude, in the existing PreToolUse scope hook on the `Agent`
> tool (`DelegationInput`, D-017); on OpenAI, in DataDesk's agent-as-tool wrapper. An invalid
> brief is rejected with the validation error, so the lead can fix it, and the rejection is
> journalled.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The lead writes the brief as **JSON in the `prompt` field**. On Claude, `canUseTool` validates it with the brief schema and returns `updatedInput` with the prompt **re-rendered by code from a fixed template**; the existing `DelegationInput` path in `claudeOrchestrator.ts` already rewrites input this way. The PreToolUse scope hook stays the second layer. On OpenAI, the agent-as-tool wrapper does the same validation and rendering. An invalid or oversized brief is rejected with the zod error, journalled, and counted against PA-02.
>
> **Why:** Rendering by code ("fixed structures", §8.5) makes every sub-agent see the same layout regardless of how the lead phrased things, and it's measurable. The rewrite hook already exists (verified), so this adds no new mechanism.
>
> **Rejected:** validating free text (unenforceable); accepting the lead's own formatting (inconsistent contexts, unmeasurable).
>
> **Recommendation was:** refined (JSON in, rendered by code, using the existing `updatedInput` path).
>
> **Consequences:** ADR-09; P14-09; the `delegation-briefs` runtime skill teaches the JSON shape.
>
> **Revisit if:** briefs routinely hit the size cap; then split the facts into the working set.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** "The rewrite hook already exists" overstated it: `canUseTool` rewrites `DelegationInput` today, but whether the CLI consults it for the `Agent` tool is **not verified** (`scopeHook.ts`, D-017). P11-12 probes this and whether PreToolUse can rewrite the input. Fallback if neither can rewrite: the PreToolUse hook validates the brief and denies an invalid one, and code-rendering becomes report-only on Claude. Facts in a brief are fenced as data in the template (§8.5 rule 4).
>
> **Audit resolution, round 2 (2026-10-03):** If the validate-and-deny fallback is used on Claude, the loss of code-rendering is recorded as a D-NNN waiver (D-032). The compute CSP variant is recorded as its own D-NNN at P11 sign-off, since CLAUDE.md rule 2 names one strict CSP.

## D. Security, Budget and Evaluation

**Q10. What form does the threat model take?**
_Blocks: P11-10._

> **Recommendation (Claude):** A STRIDE table per new surface, plus at least one written attack
> sequence per surface, each with its control and the test that proves the control.

> **Answer Q10:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** A STRIDE table per new surface **and** at least one attack sequence per surface. Each control names its proving test (file path, written in P13/P14). Surfaces: compute host and FFI, the pipe, the snapshot query, `run_python` output (exfiltration to the provider), derived data (disk exhaustion), model files, lessons (planted), briefs (oversize or injected), bench keys (reachability), the judge (manipulation through the analyst's output). Changes to the existing init-guard allowlist are reviewed as a surface too.
>
> **Why:** A threat model without a test per control is decoration. Naming the test makes the plan-auditor and the code-reviewer able to check it.
>
> **Rejected:** a narrative-only threat model (unverifiable); full attack trees (too heavy for the team size).
>
> **Recommendation was:** refined (surface list and the test-per-control rule).
>
> **Consequences:** P11-10; P13-03's escape suite and P14 tests implement the named tests.
>
> **Revisit if:** a new surface appears in a later phase (each phase plan must add its rows).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** One canonical surface list lives in P11-10 (16 surfaces): it adds the compute window ↔ main channel, `datadesk-ds` second-hop secrets, the snapshot cache, in-kernel instrumentation the agent's code can unwrap, the split and test lock, and the **notebook export** (agent code run unsandboxed in the user's Jupyter). The P11 plan and this answer now use the same list.
>
> **Audit resolution, round 3 (2026-10-03):** The canonical list now has **18 surfaces** (P11-10, EC11-3); the "16" above is superseded.

**Q11. Where is the $1-per-analysis budget enforced?**
_Blocks: P11-11, NFR-04._

> **Recommendation (Claude):** A DataDesk budget meter in main that adds up the cost the Claude
> SDK reports per result and the OpenAI cost from our price table, and interrupts the run at the
> cap. The SDK's own `maxBudgetUsd` stays as a backstop.

> **Answer Q11:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** A budget meter in main that estimates cost **per assistant message from its token usage** × a pinned price table for both providers. It reconciles with the Claude SDK's cumulative `total_cost_usd` at each result, and interrupts the run when the analysis estimate reaches $1. The SDK's `maxBudgetUsd` stays as the per-conversation backstop. Prices are verified by docs-researcher in P11-11 and stored with their source URL.
>
> **Why:** The SDK reports `total_cost_usd` only on result messages (the mapper takes deltas of that cumulative value, verified in `sdkMapper.ts`). In a long autonomous turn that arrives at the end, too late to stop a $1 overrun. Usage on each assistant message arrives as it streams, so the meter can stop mid-turn.
>
> **Rejected:** relying on `total_cost_usd` only (can't stop mid-turn); relying on `maxBudgetUsd` only (it is per conversation, not per analysis).
>
> **Recommendation was:** overturned (the meter must use per-message usage; the result cost is only for reconciliation).
>
> **Consequences:** ADR-12 (P11-11); P14-07; the price table gains Claude rows (today it only has OpenAI); a test with a fake SDK stream that crosses the cap mid-turn.
>
> **Revisit if:** the estimate and the reconciled cost differ by more than 10% (prices or caching rules changed).
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** P11-11 verifies that **sub-agent** assistant messages carry `usage` in the Claude stream. The stop fires when spend **plus a worst-case estimate of the next call** (current context × input price + max output × output price) reaches $1, so the overshoot is bounded. ADR-12 also covers turns, the wall clock, per-execution limits, 3 retries per error class (D-032) and the partial report built by code on any stop, including a provider outage.
>
> **Audit resolution, round 2 (2026-10-03):** The worst-case rule needs a **per-call max-output cap on both providers** (with the model's full maximum output it would stop before the first call); P11-11 probes how to set it and sums all parallel sub-agent calls. **Pending maintainer (Q-F5).** All P11 probes run against a local scripted endpoint at $0 (Q-F6).

**Q12. Where does the evaluation model run?**
_Blocks: P11-14, P12-10._

> **Recommendation (Claude):** In the benchmark harness (`bench/`, Node scripts), after a run,
> using its own SDK clients and keys from the environment. Never inside the app.

> **Answer Q12:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** In `bench/` Node scripts, after a run, never inside the app. Keys come from the **process environment the contributor sets in their shell**, never from `.env*` files (CLAUDE.md rule 6) and never from the app's key store. Automated tests use a fake judge client (no network, CLAUDE.md testing rules). The judge prompt, rubric and model id are versioned files under `bench/rubric/`.
>
> **Why:** The app's key store is reachable only from main and must stay that way (rule 1). The judge is dev tooling with its own trust boundary, and keeping it out of the app also keeps it out of the agent's reach (NFR-17).
>
> **Rejected:** running the judge inside the app (a new keyed path in main for a dev feature); reading keys from a `.env` file (forbidden).
>
> **Recommendation was:** refined (key source, fake client in tests, versioned rubric files).
>
> **Consequences:** ADR-10; P12-10; `CONTRIBUTING.md` documents setting the keys in the shell.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Judge calls are paid runs and go through the D-034 runner with a maintainer's approval. Bench scripts that spawn the analyst build child environments explicitly (rule 5), because the shell env holds keys. A run that used Opus gets a `same-model` judge score that can't block (D-038).

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                                                                    | Recommendation | Confidence | Needs maintainer |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------- | ---------- | ---------------- |
| Q1  | Analysis controller in main owns all per-analysis state; one pipe per server; leases per analysis, ≤ 4 windows (audit) | refined        | Medium     | **yes (audit)**  |
| Q2  | `datadesk-ds` has its own DuckDB with write access only to snapshots; Parquet by content hash                          | refined        | High       | no               |
| Q3  | JSONL per analysis with a hash chain, crash recovery, big outputs by hash                                              | refined        | High       | no               |
| Q4  | `[[out:id]]` citations; rounding-aware checks; no whole-journal search                                                 | **overturned** | High       | no               |
| Q5  | Pickle inside the sandbox only, hash and library-version checked                                                       | refined        | High       | no               |
| Q6  | Structured filter + BM25, deterministic ties, no embeddings                                                            | kept           | High       | no               |
| Q7  | Agents-as-tools from one table; a parity test over both option builders                                                | kept           | High       | no               |
| Q8  | `schemaVersion` + fixture-tested migrations; newer files read-only                                                     | refined        | High       | no               |
| Q9  | Brief as JSON, validated and re-rendered by code via `updatedInput`                                                    | refined        | High       | no               |
| Q10 | STRIDE + attack sequence per surface, each control naming its test                                                     | refined        | High       | no               |
| Q11 | Usage-based meter in main stops mid-turn; result cost only reconciles                                                  | **overturned** | Medium     | no               |
| Q12 | Judge in `bench/`; keys from the shell env, never `.env`; fake judge in tests                                          | refined        | High       | no               |

**Totals:** 12 answered · 2 kept · 8 refined · 2 overturned · 0 needed the maintainer in the first pass; the audit added Q-D1..Q-D5 and Q-F1..Q-F7 (defaults applied, `P11-audit.md`).

**Overturned recommendations:**

- Q4: searching the whole journal for an uncited number finds false matches and makes M-04 lie.
- Q11: `total_cost_usd` arrives only on result messages, too late to stop a long autonomous turn.

**For the maintainer:** none in the first pass. The P11 audit raised five (Q-D1..Q-D5 in `P11-audit.md`); defaults are applied and marked **Pending maintainer** under Q1 and Q4.

**Cross-question changes made in the consistency pass:**

- Q2 snapshots live in `datadesk-ds`, consistent with Q1 (the relay also owns a DuckDB; main still owns the compute host and journal).
- Q11 meter placed in main, consistent with Q1's single owner of state.
- Q9 uses the same `updatedInput` mechanism the code already uses for `DelegationInput`.

**Facts verified:**

- In code: `total_cost_usd` is cumulative and taken as a delta in `src/main/agent/claude/sdkMapper.ts`.
- In code: `canUseTool` returns `updatedInput` for delegations in `claudeOrchestrator.ts`.
- In code: the DuckDB lockdown in `src/mcp-server/db/datasetDb.ts`.
- **To verify:** Pyodide in a sandboxed window with `js` FFI reach (P11-01 probe).
- **To verify:** Claude per-token prices (P11-11).
- **To verify:** SDK compaction controls (P11-12).
- **To verify:** named-pipe per-user ACLs on Windows (P11-02).
