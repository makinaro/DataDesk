---
name: add-mcp-tool
description: Add a tool to DataDesk's own MCP server (datadesk-mcp, src/mcp-server) with zod input/output schemas, registration, agent allowlisting, sub-agent scoping and InMemoryTransport tests. Use whenever the in-app analyst needs a new capability.
argument-hint: '[tool_name] [short purpose]'
---

# Add an MCP tool to datadesk-mcp

Arguments: `$ARGUMENTS` (e.g. `profile_column "min/max/nulls/top values for one column"`).

**Before writing code**, run the `docs-researcher` agent to confirm the current
`@modelcontextprotocol/sdk` `McpServer.registerTool` signature (input/output schema format,
`structuredContent`, annotations). We're on SDK v1 (see DECISIONS D-005).

## 1. Design the contract

- Name: `snake_case` verb_noun. The agent sees it as `mcp__datadesk__<name>`.
- Write the **description for the model**: when to use it, what it returns, its limits (row
  caps, timeouts). This text is the tool's UX.
- Decide: is it read-only? Does it touch the filesystem or network? Does it need an API key?

## 2. Implement

- Tool logic lives in a module next to the server (e.g. `src/mcp-server/datasets.ts`,
  `src/mcp-server/charts.ts`), taking its dependencies (`DatasetDb`, `ArtifactStore`, …) as
  arguments so it can be unit-tested without MCP.
- Bound every input (string lengths, row limits, enum values) in the zod `inputSchema`.
- Return both `content` (short human-readable text) and `structuredContent` (matches `outputSchema`).
- Report errors as tool results with `isError: true` and a message the model can act on. Don't
  throw: expected failures are typed errors (`ImportPathError`, `QueryTimeoutError`, `ArtifactInputError`, …) that
  `fail()` in `server.ts` turns into tool errors.
- Model-supplied SQL only ever runs through `DatasetDb` (`src/mcp-server/db/datasetDb.ts`), which
  applies `db/readOnlyGuard.ts` plus its row/byte budgets and timeouts. Never call DuckDB directly.
- Keys come from deps/config (`src/mcp-server/config.ts`, `DATADESK_*` env only; see D-014).
  Never log them.

## 3. Register

- Add the name to `TOOL_NAMES` and call `server.registerTool(...)` in `buildServer()`
  (`src/mcp-server/server.ts`) with honest annotations (`readOnlyHint`, `openWorldHint`, …).

## 4. Grant it to the agent (Phase 2+)

- Add `mcp__datadesk__<name>` to `AUTO_APPROVED_TOOLS` in `src/main/agent/claude/agentOptions.ts`
  **only if** it is safe to auto-approve. Otherwise route it through `canUseTool` /
  ApprovalBroker (`src/main/agent/claude/claudeOrchestrator.ts`).
- The `system:init` guard (`src/main/agent/claude/initGuard.ts`) derives its expected tools from
  `EXPECTED_TOOLS` in `agentOptions.ts`; update tests in `tests/main/agent/claude/` and the
  fake init in `fakeSdk.ts`.
- Sub-agent scoping: add it to the scope table `SUBAGENT_TOOLS` in
  `src/main/agent/claude/subagents.ts` for the sub-agents that may call it. `report-writer` must never
  get `run_sql` or anything that executes SQL.
- Update the tool count in `tests/e2e/mcp-stdio.spec.ts` and `scripts/smoke-packaged.mjs`.

## 5. Tests (`tests/mcp-server/`)

- Unit-test the logic module directly, and the MCP surface in `tests/mcp-server/server.test.ts`
  (a real `Client` over `InMemoryTransport.createLinkedPair()`).
- Cover: listed in `tools/list` with the right schema; happy path `structuredContent`; invalid
  input rejected; limits enforced; error path returns `isError`.
- For SQL-touching tools, add escape attempts (multi-statement, COPY, ATTACH, file functions
  outside allowed dirs).
- External APIs (OpenAI/HF) are injected fakes. Never hit the network.

## 6. Finish

- `npm run check` passes. Optionally check the tool by hand with `npm run mcp:inspect`.
- Update `docs/ARCHITECTURE.md` if the tool changes data flow.
- Commit: `feat(mcp): add <name> tool`.
