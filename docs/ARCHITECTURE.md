# Architecture

## Processes

```
┌────────────── Renderer (sandboxed, contextIsolation, no Node) ──────────────┐
│ React: DatasetSidebar · Chat · Charts/Report · Timeline · Compare view      │
│ Talks only to window.datadesk (explicit methods built by the preload)       │
└───────────────▲──────────────── ipcRenderer.invoke / on ────────────────────┘
                │ zod-validated both ways (src/shared/ipc/contract.ts)
┌───────────────┴──────────── Main process (Node, ESM) ───────────────────────┐
│ KeyStore (safeStorage) · IPC handlers · ApprovalBroker · Report export(PDF) │
│ UiMcpClient ──stdio──► datadesk-mcp (long-lived; sidebar/schema/register)   │
│ HF tool discovery ──HTTPS──► Hugging Face MCP (tools/list per session)      │
│ AgentRuntime ── query() from @anthropic-ai/claude-agent-sdk ──┐             │
└───────────────────────────────────────────────────────────────┼─────────────┘
                     spawns (child process)                     ▼
              ┌──────────── Claude Code native binary (SDK engine) ───────────┐
              │ cwd = userData/agent-workspace, settingSources: []            │
              │ sub-agents: profiler · sql-analyst · report-writer · scout    │
              ├─ stdio ─► datadesk-mcp  (Electron binary, ELECTRON_RUN_AS_NODE)│
              │            DuckDB · catalog · OpenAI tools · load_hf_dataset  │
              └─ HTTPS ─► Hugging Face MCP (Bearer ${DATADESK_HF_TOKEN})      │
                         └────────────────────────────────────────────────────┘

With the OpenAI provider (Phase 7) there is no agent binary: the agent loop runs inside main.

┌──────────────────────────── Main process ───────────────────────────────────┐
│ OpenAIOrchestrator ── Runner.run() from @openai/agents-core ──HTTPS──► OpenAI│
│   analyst + sub-agents as tools · tools wrapped by DataDesk (D-021)          │
│   └─ MCPServerStdio ──stdio──► datadesk-mcp (DATADESK_OPENAI_API_KEY in env) │
│ CompareRuntime: one Claude lane + one OpenAI lane, fresh sessions (D-022)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Process            | Trust        | Can touch keys?                                                     | Talks to                        |
| ------------------ | ------------ | ------------------------------------------------------------------- | ------------------------------- |
| Renderer           | untrusted UI | no, only booleans                                                   | main, via typed IPC             |
| Preload            | bridge       | no                                                                  | exposes explicit functions only |
| Main               | trusted      | decrypts, passes to children via explicit env/headers               | renderer, SDK, UiMcpClient      |
| Claude Code binary | agent engine | `ANTHROPIC_API_KEY`; the OpenAI key and HF token (env, D-018/D-019) | our MCP servers, HF MCP         |
| datadesk-mcp       | tool server  | agent copy only: `DATADESK_OPENAI_API_KEY`, `DATADESK_HF_TOKEN`     | DuckDB, OpenAI, HF Hub (keyed)  |

With the OpenAI provider, main itself holds the OpenAI key for the Responses API (pinned
endpoint, `store: false`, tracing off) and spawns its datadesk-mcp directly, with the key in that
child's env only. In compare mode up to three agent sessions run at once (chat plus two lanes),
each with its own datadesk-mcp and DuckDB temp dir.

## Security layers

1. **Window:** `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity`, and a
   CSP response header (`src/main/security/csp.ts`). Navigation, new windows and permission
   requests are denied.
2. **IPC:** one zod contract (`src/shared/ipc/contract.ts`). Main validates each request and
   response and rejects senders that aren't our app frame.
3. **Secrets:** `safeStorage` (DPAPI on Windows). Keys never leave main except as env or headers
   for child processes we spawn.
4. **Agent:** only MCP tools + `Skill` + `Agent` (our sub-agents only, scoped by one table,
   a PreToolUse hook and canUseTool), isolated config dir, plugin-only skills, and a
   `system:init` guard (D-013, D-015, D-017). Remote HF tools are discovered by main and all but
   three read-only ones are disallowed (D-019). On the OpenAI provider DataDesk builds the tool
   list itself from the same allowlist and scope table, and a missing tool fails the session
   (D-021).
5. **Approvals:** `register_dataset` and `load_hf_dataset` always ask the user through
   `ApprovalBroker`; anything but an explicit yes (timeout, abort, reset) is a no (D-010, D-020).
   Both providers share the questions (`src/main/agent/approvalQuestions.ts`); compare lanes
   decline without asking (D-022).
6. **SQL:** read-only by statement type, one statement, row caps, timeouts, and file access
   restricted to dataset directories (Phase 1).
7. **Charts and reports:** artifacts are loaded by uuid, specs are sanitized twice, Vega runs
   without eval, styles or network, and PDFs print from a JS-off hidden window (D-016).

## Source layout

```
src/shared/      zod schemas + IPC contract (no electron/node/react imports)
src/main/        app lifecycle, windows, security, IPC handlers, secrets, agent runtime
src/preload/     contextBridge API (bundled as CommonJS, required by sandboxed preloads)
src/renderer/    React UI
src/mcp-server/  datadesk-mcp stdio server (Phase 1)
tests/           mirrors src/, plus tests/e2e and tests/setup
resources/       agent-plugin (runtime skills), icons
```

## Data flow: a question (built across Phases 1–4)

1. The user types in Chat → `agent:send` IPC → main `AgentRuntime` pushes it into the streaming
   `query()` input.
2. The SDK's Claude Code process plans and calls `mcp__datadesk__get_schema`, then `run_sql`.
3. datadesk-mcp validates the SQL (statement type = SELECT), runs it with a row cap and timeout,
   and returns structured rows.
4. Main maps each SDK message/hook into a `TimelineEvent` → `agent:event` → Timeline drawer.
5. Skills (`datadesk:eda-checklist`, `chart-style`, `report-format`) load on demand via the
   `Skill` tool; only their names and descriptions sit in the context up front.
6. `create_chart` / `save_report` write artifacts to `userData/artifacts` and return ids. Main
   turns successful results into `artifact` events; the Charts & report panel loads them by id,
   renders Vega-Lite, and exports Markdown/PDF through `artifacts:exportReport`.
7. For bigger jobs the analyst delegates through the `Agent` tool: the scope hook checks the
   sub-agent type and the call shape (canUseTool strips it too), the sub-agent (profiler, sql-analyst, report-writer) runs
   with only its scoped tools in a fresh context, and the scope hook re-checks every call. Its
   tool calls and messages arrive with `parent_tool_use_id` and render as a nested timeline lane.
8. With an OpenAI key set, the agent's datadesk-mcp also offers `search_columns` (embeddings,
   cached by content hash) and `second_opinion` (a second model critiques SQL + result). The key
   reaches it through the CLI's env, never a command line (D-018).

## Data flow: finding and loading a Hub dataset (Phase 6)

1. With a Hugging Face token saved, main lists the HF MCP server's tools itself before the
   session starts (`src/main/mcp/toolDiscovery.ts`). A rejected token or an offline Hub starts the
   conversation without HF and shows a notice.
2. The session gets the `hf` server (`type: 'http'`, `Authorization: Bearer ${DATADESK_HF_TOKEN}`,
   expanded by the CLI from its env) with every non-allowlisted tool in `disallowedTools`, and
   the `dataset-scout` sub-agent. The init guard checks both.
3. The analyst (or dataset-scout, following the `evaluating-datasets` skill) searches with
   `hub_repo_search`, vets with `hub_repo_details`, and lists files with sizes via `hf_fs`.
4. The analyst calls `mcp__datadesk__load_hf_dataset`. `canUseTool` validates the input against
   the shared schema (`src/shared/hf.ts`) and the approval dialog shows the repo, file, revision,
   dataset name and size limit.
5. On approval, datadesk-mcp downloads the file (redirects followed by hand, token only to
   huggingface.co, size-capped, `.part` then rename) into `userData/datasets/hf/…` and registers
   it through a narrow `allowDirs` exception (D-020). From there it is a dataset like any other.

## Data flow: OpenAI provider and compare mode (Phase 7)

1. Settings → Provider: OpenAI. Saving resets the conversation and drops the Claude orchestrator
   (`onSettingsChanged`); the next `agent:send` creates an `OpenAIOrchestrator`.
2. The first message starts a session: main reads the OpenAI key, spawns datadesk-mcp through the
   SDK's `MCPServerStdio`, checks it lists every expected tool, and loads the plugin skills.
3. Each message is one `Runner.run(analyst, history + message, { stream: true })`. The analyst's
   tools are DataDesk-built function tools (`mcp__datadesk__*`, `Skill`) and three agents-as-tools
   (`profiler`, `sql_analyst`, `report_writer`) with their scope-table rows.
4. `openaiMapper.ts` turns stream events (including the sub-agents', via `onStream`) into the same
   `AgentEvent`s the Claude mapper produces; cost is added up per `response_done` from our price
   table. Only a completed turn is appended to the replayed history.
5. Compare mode: `compare:run` resets both lanes and sends the question to a Claude lane and an
   OpenAI lane. Their events go on `compare:event` as `{ provider, event }`; the Compare view feeds
   each lane into the chat's own reducer and shows answer, tool calls, cost and time side by side.
