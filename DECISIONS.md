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

## D-007: Serve the production renderer from `app://datadesk/`, not `file://` (2026-10-01)

**Context:** The plan delivered the production CSP as a response header, but Electron's
`webRequest` hooks don't run for `file://` pages, so the header would silently never apply.
`file://` pages also get extra privileges (e.g. reading other local files).
**Decision:** Register a privileged `app` scheme (`standard`, `secure`, `supportFetchAPI`) and serve
`out/renderer` through `protocol.handle` with a path-traversal-checked resolver. Every response
carries the CSP and `X-Content-Type-Options: nosniff`. In dev the Vite server's responses get the dev
CSP through `onHeadersReceived`.
**Alternatives:** a `<meta http-equiv>` CSP (no `frame-ancestors`, and it's a second source of
truth); keeping `file://`.
**Consequences:** Navigation checks must compare scheme and host explicitly: Node's `URL` reports
origin `"null"` for non-special schemes, so a naive `.origin` comparison matched _every_ custom
scheme. A regression test guards this.

## D-008: Enforce dev-agent limits with hooks, not just prompts (2026-10-01)

**Context:** The owner asked for a read-only `code-reviewer` and a `test-writer` that edits only
test files. Claude Code subagent `tools` lists can't scope Bash to specific commands, because a
specifier in `disallowedTools` removes the whole tool. Read deny rules are best-effort for
Grep/Glob and don't cover arbitrary subprocesses.
**Decision:** One Node hook script (`.claude/hooks/agent-guards.mjs`) with three pure policies in
`policies.mjs`: `private-paths` (project-wide PreToolUse on shell, search and file tools),
`git-readonly` (code-reviewer frontmatter hook) and `tests-only` (test-writer frontmatter hook).
Hooks exit 2 to block, and fail closed on bad input. The policies are unit-tested in
`tests/tooling/`.
**Alternatives:** prompt-only instructions (not enforced); shell-script hooks (bash/PowerShell
portability issues on Windows).
**Consequences:** String matching is deliberately strict. Any shell command that merely _mentions_
the protected names (a heredoc, a `git commit -m` message) is blocked too, so write such text with
the file tools and commit with `git commit -F <file>`. It can still be bypassed by an indirect read
(e.g. a script that opens files itself), so it's defense in depth, not a sandbox. Verified live in
the Phase 0 session: a shell read of the env file was blocked.

## D-009: `run_sql` is read-only in three layers; lockdown uses `allowed_paths` + rebuild (2026-10-01)

**Context:** A statement-type check alone can't stop `SELECT * FROM read_text('C:/…')`. Verified
on DuckDB 1.5.6 (probe scripts + `docs-researcher`): once `enable_external_access = false`,
neither `allowed_paths` nor `allowed_directories` can change, access can't be re-enabled, and
extensions can't be loaded. `allowed_directories` is a prefix match, so allowing the folder of a
dropped file would expose every sibling (e.g. all of Downloads).
**Decision:**

1. **Parser layer:** `extractStatements().count === 1` and `prepared.statementType === SELECT`.
2. **Instance layer:** each catalog change builds a fresh in-memory instance: set limits, disable
   autoinstall/autoload, `LOAD excel` if needed, create one view per dataset, set
   `allowed_paths` = exactly the registered files, then `enable_external_access = false` and
   `lock_configuration = true`.
3. **Execution layer:** `streamAndReadUntil(cap + 1)` for row caps, `interrupt()` on timeout or
   MCP cancellation, and one serialized connection.

**Alternatives:** regex filtering (bypassable); `allowed_directories` (exposes siblings);
materialising data into tables (copies large files into memory).
**Consequences:** A registration costs one instance rebuild (milliseconds; views don't copy data).
Some writes are rejected by DuckDB's binder before our type check runs, which is fine because
nothing executes. Statement-form `PIVOT` without `IN (...)` is rejected, because DuckDB expands
it into several statements (it creates an ENUM type).

## D-010: `register_dataset` is a security boundary (2026-10-01)

**Context:** Registering a file grants the analyst read access to it, so a model-chosen path is
a way to read arbitrary files (SSH keys, other apps' JSON configs).
**Decision:** `validateImportPath` accepts only absolute local paths (no UNC, since on Windows those
can leak credentials), no symlinks or junctions (the real path must equal the requested path),
regular files with a data extension, under a size cap, and never inside deny-listed dirs (the
app's userData). **In Phase 2, agent-initiated `register_dataset` calls go through human
approval**; files the user drops in the UI are trusted.
**Alternatives:** trusting the model (unsafe); removing the tool from the agent entirely (the
roadmap wants it).
**Consequences:** `.json` files are importable, so approval (Phase 2) matters. Tracked in ROADMAP
Phase 2.

## D-011: MCP server surface conventions (2026-10-01)

**Context:** MCP SDK 1.31 turns every handler failure into an `isError` tool result, and only
validates `structuredContent` against `outputSchema` when not `isError`.
**Decision:** Every tool declares input and output zod schemas and annotations (read-only tools:
`readOnlyHint: true, openWorldHint: false`). Tools return `structuredContent` plus a text mirror
for clients that only read `content`. Expected failures (guard, timeout, import policy,
unavailable dataset) return their message. Unexpected errors return only the first line (no
stacks or paths). Logs go to stderr, because stdout is the protocol.
**Consequences:** The model sees every mistake and can retry. Tests assert on `isError` and
message text rather than thrown errors.

## D-012: Phase 1 review hardening (2026-10-01)

**Context:** The Phase 1 `code-reviewer` run found no lockdown escape, but it did find robustness
gaps: an 8.3 short-path false positive (it would break on CI runners), a whole-list failure from
one broken dataset, cross-process catalog lost updates, bind-time work outside the timeout, and
no byte limit on results.
**Decision:**

- **Link detection** walks each path component with `lstat` instead of comparing against
  `realpath` (which also expands `C:\PROGRA~1`).
- **File names with `* ? [ ]` are rejected**, because DuckDB would treat them as globs.
- **Catalog read-modify-write holds a cross-process lockfile** (`catalog.json.lock`, created
  exclusively, taken over after 15 s if stale).
- **Row counts are taken once at registration** (under the timeout) and stored in the catalog.
  Listings never scan files, and a failed entry is reported per dataset.
- **Failed datasets are retried on each listing**, so a reconnected drive recovers.
- **Sessions are stamped with the signature they were built from**, so a concurrent change in
  another process always triggers a rebuild.
- **Timeout and cancellation now cover `prepare` (binding) as well as streaming.** Verified by a
  test: `interrupt()` aborts a full-file CSV sniff.
- **Results stream chunk by chunk under a row cap _and_ a byte budget** (2 MB), with cells over
  10 000 characters clipped (`clippedCells`).

**Alternatives:** last-write-wins catalog (silently loses registrations once agent servers exist).
**Consequences:** One chunk (up to 2048 rows) is the granularity of the byte budget, so
DuckDB's `memory_limit` remains the backstop for pathological rows. Row counts can be stale if a
file changes after registration.

## D-013: Embedding the Claude Agent SDK (0.3.286) (2026-10-01)

**Context:** The `docs-researcher` agent checked the installed SDK types, and dummy-key probes
verified behavior. Findings:

- When `permissionMode` is omitted, the CLI may pick `auto`.
- The `env` option _replaces_ the child environment.
- On Windows the CLI refuses to start without PowerShell or Git Bash on `PATH`.
- A packaged app resolves the binary inside `app.asar`, which `spawn` can't execute.
- With `tools: []` the model saw exactly our 6 MCP tools (probe).
- `init.skills` still _lists_ 16 bundled skills.
- Typed slash commands are dispatched even with `skills: []`. `/cost` ran locally (probe).
- A bad key caused about 10 API retries before failing.

**Decision:** One long-lived **streaming-input** session per conversation (`InputQueue`), so the
agent's datadesk-mcp process lives across turns. All capability options sit in one tested builder
(`buildAgentOptions`):

- **Nothing from disk:** `settingSources: []`, `strictMcpConfig`, and `tools: []` / `skills: []`
  plus a `disallowedTools` backstop.
- **Permissions:** `permissionMode: 'default'` set explicitly. `allowedTools` holds only the 5
  read-only datadesk tools. `canUseTool` denies by default and routes `register_dataset` to the
  ApprovalBroker (D-010).
- **No slash commands:** `extraArgs: { 'disable-slash-commands': null }`. A probe confirmed
  `/cost` → "isn't available in this environment".
- **Explicit env:** the OS allowlist, the key, `CLAUDE_CONFIG_DIR` in userData, no auto memory, no
  claude.ai connectors, no built-in agents, no nonessential traffic, no auto-update, and
  `CLAUDE_CODE_MAX_RETRIES=2`.
- **Packaged builds** pass `pathToClaudeCodeExecutable` into `app.asar.unpacked`.
- **An init guard** aborts the session on unexpected tools, servers, agents, permission mode,
  credential source or cwd. It ignores `init.skills`, which lists skills regardless of the
  allowlist; without the Skill tool they can't run.

**Alternatives:** single-shot `query()` per message (re-spawns the CLI and MCP server each time,
and loses context); the `auto` permission mode (a classifier decides, not the user).
**Consequences:** The guard must be updated when phases add tools (Skill in Phase 3, Agent in
Phase 4). The CLI re-sends `init` every turn, so the mapper reports each session once. Turns
answered without an assistant message fall back to the result text.

## D-014: Secrets must not reach the agent's MCP server (second-hop env) (2026-10-01)

**Context:** The Phase 2 review read the minified CLI and suspected a leak, and a probe confirmed
it. When Claude Code spawns a stdio MCP server, it passes down **its own environment** and then
applies the server's `env`. So `ANTHROPIC_API_KEY`, which we gave only to the CLI, plus the CLI's
`CLAUDE_CODE_MESSAGING_TOKEN`/`SOCKET`, reached datadesk-mcp: a process that parses untrusted
files and runs model-written SQL. Our unit test only checked the env _we_ built, not what the
child _received_.
**Decision:** Two layers:

1. The agent's server config sets those variables to `''`. Server `env` is applied last, and the
   probe showed this blanks them.
2. datadesk-mcp calls `scrubSecrets` first thing at startup. It deletes any secret-looking
   variable not prefixed `DATADESK_` and logs the names only. Secrets the server legitimately
   needs (Phase 5+) will arrive as `DATADESK_*`.

**Alternatives:** `CLAUDE_CODE_MCP_ALLOWLIST_ENV` (undocumented, unverified semantics).
**Consequences:** Anything that must reach the server needs a `DATADESK_` name. The lesson for
future phases: verify what a child process _actually_ receives with a probe, not only what we
pass.

## D-015: Runtime skills ship as a bundled local plugin; slash commands stay on (2026-10-01)

**Context:** Phase 3 gives the in-app analyst Agent Skills. The agent runs with
`settingSources: []`, so it can't discover skills from `.claude/skills` (that's also how we keep
this repo's dev skills out). Probes against `@anthropic-ai/claude-agent-sdk` 0.3.286 found:

- a `plugins: [{ type: 'local', path }]` entry loads its skills even with `settingSources: []`;
- the skills are namespaced `datadesk:<skill>`;
- `--disable-slash-commands`, which we passed in Phase 2, **also disables skills and the Skill
  tool**;
- a message starting with a space is not dispatched as a slash command.

**Decision:**

- Skills live in `resources/agent-plugin` (plugin `datadesk`). Packaged builds copy it to
  `resources/agent-plugin` via `extraResources`.
- Options: `tools: ['Skill']` plus the MCP tools; `plugins` (with `skipMcpDiscovery`);
  `skills: SKILL_NAMES`; and `settings: { disableSkillShellExecution, disableBundledSkills }`.
  No skill declares `allowed-tools`, hooks or `!` commands.
- The init guard now checks the plugins (only built-ins or exactly ours, at our path), that
  `plugin_errors` is empty, and that our skills are listed (this replaces D-013's "ignore
  `init.skills`").
- Slash commands stay enabled. `InputQueue` prefixes a leading `/` with a space, so `/cost` or
  `/compact` typed in chat reach the model as text.

**Alternatives:**

- Put skills in the system prompt: always paid for, no progressive disclosure, and nothing to
  learn about skills.
- Use a `.claude/skills` dir in the agent workspace: needs `settingSources: ['project']`,
  which reopens the CLAUDE.md and settings leak.
- Keep `--disable-slash-commands`: no skills.

**Consequences:** Skills add the `Skill` tool to the allowlist. If a future CLI dispatches
commands despite leading whitespace, the neutralizer must change; the probe is in the Phase 3
learning log. The same probe (SDK 0.3.286, dummy key) showed that the TUI's other prefixes don't
apply in SDK mode: `!echo …` and `# …` both went to the model (401), so only `/` is neutralized.

## D-016: Artifacts by id, CSP-safe Vega, PDF from a locked-down hidden window (2026-10-01)

**Context:** Charts and reports must reach the UI without file tools, without sending chart data
back through the model, and without loosening the renderer CSP (`script-src 'self'`,
`style-src 'self'`, `connect-src 'self'`).
**Decision:**

- **Artifacts:** `create_chart` runs the guarded SQL (5k rows / 5 MB budget), inlines the rows
  into a sanitized spec, and writes `userData/artifacts/charts/<uuid>.json`. `save_report`
  writes `reports/<uuid>.json`. Only ids go back to the model. Reports embed charts with
  `[[chart:<uuid>]]` lines. Main parses successful tool results into `artifact` events. The
  renderer loads artifacts by uuid over IPC (`artifacts:getChart|getReport`); paths are never
  accepted.
- **Specs:** `sanitizeVegaLiteSpec` (`src/shared/vegaSpec.ts`) allowlists top-level keys and
  rejects `url`, `href`, `data`, `datasets`, `usermeta` and `loader` anywhere. The renderer
  re-sanitizes before rendering (`charts/prepareSpec.ts`).
- **Vega under CSP:**
  - `ast: true` + `vega-interpreter` (no `Function()`);
  - `actions: false` (the editor action posts data off-site);
  - `defaultStyle: false` and `tooltip.disableDefaultStyle` (no injected `<style>`; rules are
    in `styles.css`);
  - a loader that rejects every request.
    The e2e test asserts zero CSP violations and no `<style>` elements.
- **Export:** Markdown is built entirely in main from stored artifacts: the report text, plus
  SVGs main renders from the re-sanitized charts with headless Vega (`renderer: 'none'`), written
  as sibling files. Main never writes renderer-supplied markup to disk. (A regex SVG checker was
  tried first; review showed it was bypassable with namespace prefixes and entities, and it
  rejected harmless titles.) For PDF, the renderer builds static HTML with charts as
  `data:image/svg+xml` `<img>`s (an SVG loaded as an image can't run script). Main wraps it in
  a document with its own CSP (`default-src 'none'; img-src data:; style-src 'unsafe-inline'`)
  and prints it with `printToPDF` from a never-shown window: `javascript: false`, sandboxed,
  its own partition, and a request filter allowing only the temp file and `data:` images.

**Alternatives:**

- Return chart data to the model: costs tokens and risks prompt injection.
- Add `'unsafe-eval'` to the CSP.
- Print the main window: it has the app's JS and state.
- Use a PDF library in main: re-implements layout.

**Consequences:** Vega adds ~2.5 MB to the renderer bundle (fine for a local app; could be
lazy-loaded later). Artifacts accumulate in userData (no cleanup UI yet).

## D-017: Sub-agents from one scope table, gated three ways (2026-10-01)

**Context:** Phase 4 adds sub-agents. Verified for `@anthropic-ai/claude-agent-sdk` 0.3.286
(installed `sdk.d.ts`, code.claude.com/docs/en/agent-sdk/subagents, /sub-agents, /env-vars,
2026-10-01, plus dummy-key probes):

- the sub-agent tool is requested as `Agent` but listed as `Task` in `init`;
- by default a session also has built-in agents (`general-purpose` inherits every tool),
  sub-agents run in the background, and may nest 3 deep;
- sub-agents inherit the parent's MCP tools unless `tools` narrows them;
- `canUseTool` (with `agentID`) and `PreToolUse` hooks (with `agent_id`/`agent_type`) fire for
  sub-agent calls;
- the caps exist only as env vars, not `Options` fields.

**Decision:**

- **One scope table** (`src/main/agent/claude/subagents.ts`):
  - profiler: read tools + `run_sql`;
  - sql-analyst: read tools + `run_sql` + `create_chart`;
  - report-writer: `save_report` only. It never runs SQL; it writes from findings in its prompt.

  The table feeds each `AgentDefinition.tools` and the scope hook. Each agent also has
  `disallowedTools` (Agent, Task, Skill, register_dataset), preloaded `skills`, `model: 'inherit'`
  and `maxTurns: 20`. No `permissionMode`, `mcpServers` or `memory`.

- **Three gates:**
  1. **`tools`:** each agent is given only its tools.
  2. **`PreToolUse` scope hook:** keyed on `agent_id`, it denies any sub-agent call outside the
     table, and any call from an unknown agent type.
  3. **`canUseTool`:** it validates delegations (only our three `subagent_type`s) and strips
     them to `{subagent_type, description, prompt}`, so there's no `model`, `run_in_background`,
     `isolation`, `name` or `mode`. It also denies the sub-agent tool and `register_dataset` from
     inside sub-agents.
- **Env caps:**
  - `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1`;
  - `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`;
  - `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=3`;
  - `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` (foreground, so a turn ends after its sub-agents);
  - `CLAUDE_CODE_FORK_SUBAGENT=0`.
- **Init guard:** requires exactly our three agents and accepts `Agent`/`Task`.
- **Timeline:** `forwardSubagentText: true` sends sub-agent text to its timeline lane.

**Alternatives:**

- Prompt-only delegation (one agent): no context isolation or tool scoping to learn from.
- Trusting `tools` alone: one layer, and SDK defaults change.
- `disallowedTools: ['Agent(general-purpose)', …]` deny rules: only partially documented for
  the SDK option. The env var removes all built-ins, and the guard verifies it.

**Consequences:**

- Sub-agents cost extra tokens and latency; the prompt tells the analyst to delegate only bigger
  jobs.
- Adding a DataDesk tool now also means deciding its row in the scope table (the
  `add-mcp-tool` skill says so).
- If a future CLI renames `Task`/`Agent` again, the guard will stop the session rather than run
  with an unknown tool.
