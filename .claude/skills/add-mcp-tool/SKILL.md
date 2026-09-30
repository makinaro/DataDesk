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

## 2. Implement (`src/mcp-server/tools/<name>.ts`)

- Export `inputSchema` and `outputSchema` (zod), plus `register<Name>(server, deps)`.
- Bound every input (string lengths, row limits, enum values).
- Return both `content` (short human-readable text) and `structuredContent` (matches `outputSchema`).
- Report errors as tool results with `isError: true` and a message the model can act on. Don't throw.
- Any SQL goes through `db/readOnlyGuard.ts` and `db/limits.ts`. Never call DuckDB directly with
  model-supplied SQL.
- Keys come from `deps` (read from env by `src/mcp-server/index.ts`). Never log them.

## 3. Register

- Call `register<Name>` from `src/mcp-server/server.ts` → `buildServer()`.

## 4. Grant it to the agent (Phase 2+)

- Add `mcp__datadesk__<name>` to the allowlist in `src/main/agent/options.ts` **only if** it is
  safe to auto-approve. Otherwise route it through `canUseTool` / ApprovalBroker.
- Update the `system:init` guard's expected tool list (`src/main/agent/guard.ts`).
- Update the sub-agent scope table in `src/main/agent/agents.ts` (Phase 4+): which sub-agents
  may call it? `report-writer` must never get `run_sql` or anything that executes SQL.

## 5. Tests (`tests/mcp-server/tools/<name>.test.ts`)

- Connect a real `Client` to `buildServer()` over `InMemoryTransport.createLinkedPair()`.
- Cover: listed in `tools/list` with the right schema; happy path `structuredContent`; invalid
  input rejected; limits enforced; error path returns `isError`.
- For SQL-touching tools, add escape attempts (multi-statement, COPY, ATTACH, file functions
  outside allowed dirs).
- External APIs (OpenAI/HF) are injected fakes. Never hit the network.

## 6. Finish

- `npm run check` passes. Optionally check the tool by hand with `npm run mcp:inspect`.
- Update `docs/ARCHITECTURE.md` if the tool changes data flow.
- Commit: `feat(mcp): add <name> tool`.
