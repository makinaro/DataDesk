# Architecture

## Processes

```
┌────────────── Renderer (sandboxed, contextIsolation, no Node) ──────────────┐
│ React: DatasetSidebar · Chat · Charts/Report panel · AgentTimeline drawer   │
│ Talks only to window.datadesk (explicit methods built by the preload)       │
└───────────────▲──────────────── ipcRenderer.invoke / on ────────────────────┘
                │ zod-validated both ways (src/shared/ipc/contract.ts)
┌───────────────┴──────────── Main process (Node, ESM) ───────────────────────┐
│ KeyStore (safeStorage) · IPC handlers · ApprovalBroker · Report export(PDF) │
│ UiMcpClient ──stdio──► datadesk-mcp (long-lived; sidebar/schema/register)   │
│ AgentRuntime ── query() from @anthropic-ai/claude-agent-sdk ──┐             │
└───────────────────────────────────────────────────────────────┼─────────────┘
                     spawns (child process)                     ▼
              ┌──────────── Claude Code native binary (SDK engine) ───────────┐
              │ cwd = userData/agent-workspace, settingSources: []            │
              │ sub-agents: profiler · sql-analyst · report-writer · scout    │
              ├─ stdio ─► datadesk-mcp  (Electron binary, ELECTRON_RUN_AS_NODE)│
              │            DuckDB (in-memory) · catalog · OpenAI tools        │
              └─ HTTPS ─► Hugging Face MCP (Bearer token set by main)         │
                         └────────────────────────────────────────────────────┘
```

| Process            | Trust        | Can touch keys?                                       | Talks to                        |
| ------------------ | ------------ | ----------------------------------------------------- | ------------------------------- |
| Renderer           | untrusted UI | no, only booleans                                     | main, via typed IPC             |
| Preload            | bridge       | no                                                    | exposes explicit functions only |
| Main               | trusted      | decrypts, passes to children via explicit env/headers | renderer, SDK, UiMcpClient      |
| Claude Code binary | agent engine | receives `ANTHROPIC_API_KEY` in env                   | our MCP servers                 |
| datadesk-mcp       | tool server  | receives OpenAI/HF keys in env (Phase 5+)             | DuckDB, OpenAI, HF Hub          |

## Security layers

1. **Window:** `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity`, and a
   CSP response header (`src/main/security/csp.ts`). Navigation, new windows and permission
   requests are denied.
2. **IPC:** one zod contract (`src/shared/ipc/contract.ts`). Main validates each request and
   response and rejects senders that aren't our app frame.
3. **Secrets:** `safeStorage` (DPAPI on Windows). Keys never leave main except as env or headers
   for child processes we spawn.
4. **Agent:** only MCP tools + `Skill` + `Agent` (our three sub-agents only, scoped by one table,
   a PreToolUse hook and canUseTool), isolated config dir, plugin-only skills, and a
   `system:init` guard (D-013, D-015, D-017).
5. **SQL:** read-only by statement type, one statement, row caps, timeouts, and file access
   restricted to dataset directories (Phase 1).
6. **Charts and reports:** artifacts are loaded by uuid, specs are sanitized twice, Vega runs
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
7. For bigger jobs the analyst delegates through the `Agent` tool: `canUseTool` checks the
   sub-agent type and strips the call, the sub-agent (profiler, sql-analyst, report-writer) runs
   with only its scoped tools in a fresh context, and the scope hook re-checks every call. Its
   tool calls and messages arrive with `parent_tool_use_id` and render as a nested timeline lane.
