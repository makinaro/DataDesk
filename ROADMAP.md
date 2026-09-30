# DataDesk Roadmap

Each phase runs on branch `phase-N-<slug>`, commits once per task, and ends with `/finish-phase`
(checks → code review → learning log → PR). **Stop after each phase for review.**

Legend: `[ ]` todo · `[x]` done

---

## Phase 0: Setup and secure shell

- [x] Docs: CLAUDE.md, ROADMAP.md, DECISIONS.md, docs/ARCHITECTURE.md, docs/learning-log.md
- [x] Scaffold electron-vite + React + strict TypeScript + Tailwind v4
- [x] ESLint (flat, type-checked) + Prettier + EditorConfig
- [x] Vitest (network guard) + Playwright Electron smoke test
- [x] Hardened window: isolation, sandbox, CSP header, navigation/permission guards
- [x] Typed zod IPC contract + validated `handle()` + explicit preload bridge
- [x] safeStorage KeyStore + Settings dialog (set / clear / status only)
- [x] App shell placeholders: dataset sidebar, chat, charts/report panel, timeline drawer
- [x] CI: GitHub Actions on windows-latest (check + e2e)
- [x] `.claude/`: settings permissions + hooks, 3 agents, 3 skills

**Done when:** `npm run check` and `npm run test:e2e` pass locally and in CI. The e2e test proves
that `webPreferences` are hardened, `window.require` is undefined, the bridge exposes only the
whitelisted methods, and a key can be set and cleared while status returns booleans only.
**Learn:** Electron's process model, context isolation, typed IPC; Claude Code agents, skills,
hooks and permissions from the developer side.

## Phase 1: Our MCP server (DuckDB)

- [x] DuckDB wrapper: in-memory instance, `memory_limit`, `threads`, query timeout via `interrupt()`
- [x] Catalog (`userData/catalog.json`, atomic writes) and view re-creation on startup
- [x] `register_dataset` (CSV, Parquet, JSON, XLSX via pre-fetched `excel` extension)
- [x] `list_datasets`, `get_schema`, `sample_rows`, `profile_column`
- [x] `run_sql`: single statement, `statementType === SELECT` (by statement type, not regex),
      row cap via `streamAndReadUntil(cap+1)` with a truncation flag, timeout/cancel via `interrupt()`,
      file access locked to exactly the registered files (`allowed_paths` + `enable_external_access=false` + `lock_configuration`; D-009)
- [x] stdio entry point + `mcp:inspect` (web UI) / `mcp:tools` (CLI) scripts
- [x] InMemoryTransport tests incl. escape attempts (COPY, ATTACH, INSTALL, multi-statement, `read_text` outside allowed dirs)
- [ ] Main-process `UiMcpClient` + IPC channels for datasets
- [ ] Sidebar: drag-drop registration and schema preview

**Done when:** tests prove every write/escape attempt is rejected, MCP Inspector lists 6 tools,
and a dropped CSV appears in the sidebar with its schema.
**Learn:** MCP primitives (tools, schemas, structured content), JSON-RPC lifecycle, stdio
transport, being both an MCP server _and_ client.

## Phase 2: Agent runtime, chat and timeline

- [ ] `Orchestrator` interface (provider seam for Phase 7)
- [ ] `ClaudeOrchestrator`: streaming-input `query()`, isolated options builder, abort
- [ ] `system:init` guard: abort if any tool/skill/server outside the allowlist appears
- [ ] Agent-initiated `register_dataset` requires human approval (`canUseTool`; D-010)
- [ ] Cost/loop limits: `maxBudgetUsd`, `maxTurns`
- [ ] SDK message → `TimelineEvent` mapper + `agent:event` channel
- [ ] Chat UI with streaming partial messages
- [ ] Agent timeline drawer (tool calls, results, timing, cost)
- [ ] Settings: model + budget
- [ ] Packaging spike: `electron-builder --dir`; DuckDB loads, Claude binary resolves from `app.asar.unpacked`, datadesk-mcp starts

**Done when:** fake-`query()` tests cover the options builder (no forbidden tools, correct
`cwd`/`env`), the guard and the mapper. A manual run with a real key answers a question with
`run_sql` visible in the timeline, and the spike's smoke script passes.
**Learn:** the agent loop, tool permissions (`tools` vs `allowedTools` vs `canUseTool`), how the
SDK drives a CLI subprocess.

## Phase 3: Runtime Agent Skills, charts and reports

- [ ] `resources/agent-plugin` loaded via the SDK `plugins` option
- [ ] Skills: `eda-checklist`, `chart-style`, `report-format`
- [ ] MCP tools: `create_chart` (guarded SQL + capped inline data + spec validation), `save_report`
- [ ] Vega-Lite panel, CSP-safe (`ast: true` + vega-interpreter, no `data.url`, sanitized spec)
- [ ] Markdown + PDF export (`webContents.printToPDF`)

**Done when:** the `init` message lists exactly our skills, tests cover spec sanitizing and export,
and manually "do EDA on X" invokes `eda-checklist` (visible in the timeline) and yields a chart.
**Learn:** skill anatomy, progressive disclosure, plugin packaging, skills vs system prompt.

## Phase 4: Sub-agents

- [ ] AgentDefinitions: `profiler`, `sql-analyst`, `report-writer` with scoped tools and preloaded skills
- [ ] Programmatic `PreToolUse` scope hook (defense in depth, e.g. report-writer never gets `run_sql`)
- [ ] Nested timeline lanes via `parent_tool_use_id`
- [ ] Depth/concurrency caps via env

**Done when:** tests assert each agent's tool set and that the hook denies `run_sql` for
report-writer. Manually, "analyze and write a report" shows three sub-agent lanes.
**Learn:** context isolation, delegation, tool scoping, cost/latency trade-offs.

## Phase 5: OpenAI tools inside our MCP server

- [ ] Injectable `OpenAIClient` interface (mockable)
- [ ] `search_columns`: embeddings over column name/type/samples, content-hash cache, cosine ranking
- [ ] `second_opinion`: structured critique of question + SQL + result
- [ ] Key passed to datadesk-mcp via explicit env; tools hidden when no key

**Done when:** mocked tests cover ranking, caching and critique parsing, and the tools are absent
without a key.
**Learn:** one MCP server fronting several model providers, embeddings, LLM-as-critic.

## Phase 6: Hugging Face

- [ ] Remote HF MCP server (streamable HTTP, `Authorization: Bearer`), URL and tool names verified first
- [ ] Runtime tool discovery + allowlist
- [ ] `load_hf_dataset`: size-capped download to `userData/datasets/hf`, then register
- [ ] ApprovalBroker + approval dialog (`canUseTool` → IPC → user)
- [ ] `dataset-scout` sub-agent + `evaluating-datasets` skill

**Done when:** tests cover approval allow/deny/timeout and the download cap (mocked). Manually
you can find a dataset, approve it, load it, and query it.
**Learn:** remote MCP + auth, human-in-the-loop, prompt-injection surfaces.

## Phase 7 (stretch): OpenAI Agents SDK provider and compare mode

- [ ] `OpenAIOrchestrator` (`@openai/agents`, MCP stdio to the same datadesk-mcp, agents-as-tools)
- [ ] Provider switch in settings
- [ ] Compare mode: side-by-side answer, tool calls, cost, latency

**Done when:** the same mocked conversation runs through both orchestrators, and compare mode
works manually.
**Learn:** how agent SDK abstractions differ across vendors.

## Phase 8: Packaging

- [ ] `electron-builder.yml`: NSIS x64, `asarUnpack` (DuckDB, Claude binary, MCP bundle), `extraResources` (agent-plugin, DuckDB extensions)
- [ ] Packaged path resolution (`pathToClaudeCodeExecutable`, resources)
- [ ] Playwright smoke against the built app
- [ ] README install notes (unsigned build, SmartScreen)

**Done when:** the installer installs, the app launches, a dataset registers and queries, and the
agent starts after a manual key entry.
**Learn:** asar, native modules, shipping an agent runtime.
