# Decisions

Append-only log. Newest at the bottom. Format: Context · Decision · Alternatives · Consequences.

## D-001: Toolchain version pins (2026-10-01)

**Context:** We checked the npm registry on 2026-10-01. Latest releases conflict: electron-vite 5.0.0
peers `vite ^5‖^6‖^7`, while `@vitejs/plugin-react` 6 requires Vite 8. TypeScript 7.0.2 is
latest, but `typescript-eslint` 8.71 peers `typescript >=4.8.4 <6.1.0`.
**Decision:** electron 44.5.1, electron-vite 5.0.0, vite 7.3.x, @vitejs/plugin-react 5.2.0,
typescript 6.0.3, eslint 10 + typescript-eslint 8.71, vitest 5.0.3, tailwindcss 4.3.3,
react 19.3.0, zod 4.6.5. All installed with `--save-exact`.
**Alternatives:** electron-vite 6 beta + Vite 8 (beta tooling on day one); TS 7 without
type-aware linting (loses the lint rules that catch `any` leaks and floating promises).
**Consequences:** Upgrading to Vite 8 / TS 7 later happens as separate `chore(deps)` PRs once
peers allow.

## D-002: DuckDB in memory, datasets persisted as a catalog (2026-10-01)

**Context:** The MCP server runs as more than one process (one per agent session, plus a
long-lived one for the UI). A DuckDB database file allows only a single read-write process.
**Decision:** Each datadesk-mcp process opens an in-memory DuckDB. Registered datasets live in
`userData/catalog.json` (name, path, format, options; atomic temp+rename writes). On startup each
server recreates a view per catalog entry over the original file.
**Alternatives:** a shared `.duckdb` file (lock contention); an in-process SDK MCP server inside
main (simpler, but it's not a real stdio server and it defeats the MCP learning goal).
**Consequences:** No data is copied, since views read the source files. Large files stay on disk.
Catalog writes must be atomic and readers must tolerate concurrent updates.

## D-003: datadesk-mcp runs on the Electron binary as Node (2026-10-01)

**Context:** The packaged app can't assume a system Node.js install.
**Decision:** Spawn datadesk-mcp with `command: process.execPath`, `env.ELECTRON_RUN_AS_NODE=1`,
and args pointing to the bundled `out/main/mcp-server.js`.
**Alternatives:** require a system Node (fragile); bundle a separate Node binary (+~80 MB).
**Consequences:** The DuckDB native binding loads under Electron's Node. It uses Node-API
(ABI-stable), so no electron-rebuild is needed. The binding must be asar-unpacked when packaging.

## D-004: In-app agent isolation strategy (2026-10-01)

**Context:** The Agent SDK docs say project skills/CLAUDE.md are discovered in `cwd` _and every
parent directory_, and that `~/.claude.json`, auto memory, claude.ai connectors and managed policy
load regardless of `settingSources`. A workspace under `C:\Users\<me>\AppData\…` could otherwise
pick up the developer's own `~/.claude` skills.
**Decision:** `settingSources: []`; skills are loaded only through the SDK `plugins` option from
`resources/agent-plugin`; `env` sets `CLAUDE_CONFIG_DIR=userData/claude-config`,
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `ENABLE_CLAUDEAI_MCP_SERVERS=false`;
`strictMcpConfig: true`; an explicit `tools` list (`Skill`, `Agent`) plus a `disallowedTools`
backstop. A runtime guard reads the `system:init` message and aborts the session on any
unexpected tool, skill or MCP server.
**Alternatives:** rely on `cwd` alone (leaky per docs).
**Consequences:** Plugin skill names may be namespaced (`plugin:skill`), to be verified in Phase 3.
The guard needs updating whenever we add tools.
Source: https://code.claude.com/docs/en/agent-sdk/claude-code-features (retrieved 2026-10-01).

## D-005: Stay on MCP TypeScript SDK v1 (2026-10-01)

**Context:** MCP SDK v2 is published as split packages (`@modelcontextprotocol/server` /
`client` 2.2.0). `@anthropic-ai/claude-agent-sdk` 0.3.285 peers `@modelcontextprotocol/sdk ^1.29.0`.
**Decision:** Use `@modelcontextprotocol/sdk` 1.31.x (`McpServer`, `StdioServerTransport`,
`InMemoryTransport`) until the Agent SDK moves to v2.
**Alternatives:** v2 for our server only (two MCP SDK majors in one app, and more confusion
while learning).
**Consequences:** One migration later, tracked as a `chore(deps)` PR.

## D-006: Tests live under `tests/`, mirroring `src/` (2026-10-01)

**Context:** The `test-writer` agent must only edit test files, and we want that enforceable with a
simple path rule.
**Decision:** Unit/integration tests go in `tests/<same path as src>/*.test.ts[x]`; e2e specs go in
`tests/e2e/*.spec.ts`; fixtures go in `test-data/public/`.
**Alternatives:** colocated `*.test.ts` next to sources (harder to scope, and it clutters `src/`).
**Consequences:** The test-writer hook allows writes only under `tests/` and `test-data/public/`.
