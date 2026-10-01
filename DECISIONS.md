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
  2. **`PreToolUse` scope hook** (fires for every tool call, per the docs). Inside a sub-agent it
     denies any call outside the table, and any call from an unknown agent type. On the main
     thread it denies a delegation unless it is strictly `{subagent_type, description, prompt}`
     with one of our three types, so there's no `model`, `run_in_background`, `isolation`,
     `name` or `mode`. A call counts as main-thread only when both `agent_id` and `agent_type`
     are absent, so a missing field fails closed.
  3. **`canUseTool`:** a second layer. It strips delegations to the same three fields and
     denies the sub-agent tool and `register_dataset` inside sub-agents. **Unverified:** whether
     the CLI asks `canUseTool` about the main thread's own `Agent` call at all. Claude Code lists
     the tool as not requiring permission, and a real model call is needed to check. That's why
     the hook enforces delegation shape on its own.
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

## D-018: OpenAI tools inside datadesk-mcp, keyed by the user, routed via the CLI env (2026-10-01)

**Context:** Phase 5 adds two tools to our MCP server that call OpenAI: `search_columns`
(embeddings) and `second_opinion` (a second model critiques an analysis step). Verified for
`openai` 7.25.0 from its installed typings (2026-10-01):

- `new OpenAI({ apiKey, timeout, maxRetries, fetch })`;
- `embeddings.create({ model, input, dimensions })`, with `data[i].index`;
- `responses.parse({ … text: { format: zodTextFormat(schema, name) } })`, which returns
  `output_parsed`, and `openai/helpers/zod` accepts zod v4;
- typed errors (`AuthenticationError`, `RateLimitError`, `APIConnectionError`), and a
  per-request `signal`.

Model ids come from the SDK's unions: `text-embedding-3-small` (newest embedding model) and
`gpt-5.4-mini`.

The docs-researcher run for this phase was cut short by a usage limit, so facts come from the
installed `.d.ts` and are exercised by tests that run the real SDK over an injected `fetch`.

**Decision:**

- **Injectable `OpenAIClient`** (`embed`, `critique`) in `src/mcp-server/openai/client.ts`.
  Tools depend on it, never on the SDK, so tests inject a fake.
- **`search_columns`:** embeds the query and `dataset.column (TYPE): e.g. v1, v2, v3` at 512
  dimensions. The name is clipped to 200 characters, the type to 120, and there are at most 3
  distinct sample values of 40 characters each. At most 2 000 columns are searched, and a
  `truncated` flag says so.
  - Column vectors are cached by `sha256(model, dimensions, text)`, as base64 Float32 in a
    persisted file (`<userData>/cache`, 5 000 entries, least-recently-used), so a column is
    embedded once across sessions. Query vectors stay in memory.
  - Ranking (cosine similarity) uses the current search's own vectors, so eviction can't affect
    results.
  - The file loads once, even when calls race. A failed save only logs a warning.
- **`second_opinion`:** re-runs the SQL itself through the read-only guard (50 rows) and renders
  an 8 KB preview, escaping newlines and `|` in cells. It sends question, SQL, preview and draft
  answer as **one JSON object**, so data can't forge another field.
  - The request sets `store: false`. The Responses API otherwise keeps requests for 30+ days.
  - It also sets `max_output_tokens: 4000` and `reasoning.effort: 'low'`, since reasoning tokens
    are billed even when the text is clipped.
  - An `incomplete` or refused response becomes a readable error. The bounded critique is
    labelled to the analyst as untrusted advice.
- **Per-conversation caps:** 30 `search_columns` and 15 `second_opinion` calls per datadesk-mcp
  process, which means per agent session. This bounds how much data an eager or
  prompt-injected analyst can send, for example paging through a table with repeated critiques.
- **Robustness:**
  - An unreadable OpenAI key (DPAPI data from another profile) doesn't block the analyst. The
    session starts without the OpenAI tools.
  - The SDK client pins `baseURL` and nulls `organization`/`project`, so `OPENAI_*` variables
    can't redirect it.
- **Key route:** `DATADESK_OPENAI_API_KEY` goes into the agent CLI's explicitly built env. The
  CLI passes its env to datadesk-mcp (D-014), `scrubSecrets` keeps `DATADESK_*`, and the server
  drops it from `process.env` after reading. **It is not put in the server's `env` config**: the
  SDK sends `mcpServers` to the CLI as a `--mcp-config <JSON>` command-line argument, which other
  processes, logs and crash reports can see. The UI's own datadesk-mcp gets no key.
- **Opt-in and visibility:**
  - No key: the tools aren't registered. Allowed tools, guard expectations and sub-agent tools
    follow the key.
  - Setting the key is the opt-in. Settings lists exactly what is sent (including the question,
    search wording and draft answer, the storage-off setting, and that changing the key starts a
    new conversation), the tool descriptions say it, and both tools are annotated
    `openWorldHint: true`. Keys saved before Phase 5 opt in on upgrade; the phase notes say so.
  - Changing the key resets the session.
- **Scope:** profiler gets `search_columns`, sql-analyst gets both, report-writer neither.
- **Tests:** child processes in tests never get a key, so they have no OpenAI code path. The one
  e2e that sets a fake key only lists tools. This closes the "network guard for child processes"
  item carried since Phase 0.

**Alternatives:**

- Key in the server `env` config: it ends up on the command line.
- A side channel (pipe or temp file) from main: more moving parts for the same trust level as
  the CLI env, which already holds the Anthropic key.
- Calling OpenAI from main instead: then the tool would no longer live in the MCP server, which
  is the point of this phase.
- Approval per call: these tools are read-only and the key is an explicit opt-in. An approval
  dialog per column search would make them unusable.

**Consequences:**

- The CLI process holds the OpenAI key in its env, alongside the Anthropic key. The model has
  no tool that can read the environment.
- Column samples and small query results leave the machine when the tools are used.
- Model ids are constants; changing them invalidates the cache only for the embedding model,
  because the model is part of the key.

## D-019: Remote Hugging Face MCP server: token via CLI env, tools discovered then allowlisted (2026-10-01)

**Context:** Phase 6 attaches Hugging Face's hosted MCP server so the analyst can find public
datasets. Verified 2026-10-01 from huggingface.co/docs/hub/hf-mcp-server, the
github.com/huggingface/hf-mcp-server source (`tool-ids.ts`, `settings.ts`, `bouquet-presets.ts`),
a live anonymous `tools/list`, and dummy-key probes of `@anthropic-ai/claude-agent-sdk` 0.3.286
(CLI 2.1.286) against a local fake MCP server:

- The server is `https://huggingface.co/mcp`, stateless streamable HTTP, with an optional
  `Authorization: Bearer <token>`. Anonymous use offers `hf_whoami`, `hub_repo_search`,
  `hub_repo_details` and `hf_fs`. **A signed-in user with default settings also gets write,
  compute and Gradio tools** (`create_repo`, `hf_jobs`, `dynamic_space`, sandbox tools, a
  Gradio Space). `?login` starts HF's OAuth flow; `?no_image_content=true` keeps results text.
  `?bouquet=`/`?mix=` narrow the set, but no combination yields exactly the three we want.
- The SDK passes `mcpServers` to the CLI as a `--mcp-config <JSON>` argument (D-018), so a
  literal header would put the token on the command line.
- **Probe:** `headers: { Authorization: 'Bearer ${VAR}' }` in the SDK's `mcpServers` is
  expanded by the CLI from **its own env**; the fake server received the token. The docs only
  promise this for `.mcp.json`.
- **Probe:** with an explicit header, a 401 marks the server `failed`. No OAuth discovery
  request is made and nothing opens a browser.
- **Probe:** `disallowedTools` removes named remote tools (and `mcp__hf__*`) from `init.tools`,
  so from the model's context. The per-server `tools: [{ name, permission_policy }]` field
  filtered nothing.
- `alwaysLoad: true` makes the CLI wait (up to 5 s) for the server before init, so its tools are
  in the init message.

**Decision:**

- **Token route:** the HF token goes into the agent CLI's explicitly built env as
  `DATADESK_HF_TOKEN`. The `hf` server config carries only `Bearer ${DATADESK_HF_TOKEN}`. The
  same variable reaches datadesk-mcp through the CLI's env (D-014), where `scrubSecrets` keeps
  it for `load_hf_dataset`.
- **Opt-in:** the server is attached only when the user saved a Hugging Face token. Changing any
  key now resets the session. An unreadable token starts the session without HF.
- **Allowlist (three layers):**
  1. Only `hub_repo_search`, `hub_repo_details` and `hf_fs` are auto-approved; every other tool
     reaches `canUseTool`, which denies it.
  2. Before each session, main lists the server's tools itself with the token and passes every
     tool outside the allowlist as `disallowedTools`, so write/compute/Gradio tools and
     `hf_whoami` never reach the model's context.
  3. The init guard accepts the `hf` server only when a token was set, and refuses any HF tool
     outside the allowlist. A `failed` hf server is accepted (its tools are simply absent).
- **`hf_fs` verbs:** its live schema (anonymous `tools/list`, 2026-10-01) allows only
  `ls|cat|attach|stat|find|search`, all reads. A token could change what the server offers, so the
  PreToolUse hook enforces `ls|cat|stat|find|search` itself with a strict schema (`HfFsInput` in
  `hfTools.ts`). `attach` returns images, which we don't need.
- **Scout only:** the HF tools are auto-approved, but the hook denies them on the main thread. Only
  `dataset-scout` reads the Hub, so Hub text and the user's rows never share one context, and
  stray local values are less likely to end up in Hub search words. The analyst passes the scout a
  question, not data.
- The system prompt labels everything from the Hub as untrusted text.

**Alternatives:**

- Token as a literal header: on the command line.
- An in-process `type: 'sdk'` proxy server in main: keeps the token out of the CLI, but the CLI
  already holds the Anthropic key, and the phase is about a _remote_ MCP server.
- A bouquet only: can't express our set, and HF's settings may override it.
- Fail the session on any unknown HF tool without discovery: a new HF default tool would break
  DataDesk until updated.

**Consequences:**

- `${…}` expansion via `--mcp-config` is observed CLI behaviour, not documented. If a CLI update
  drops it, HF requests carry the literal placeholder, get a 401, and the server shows `failed`.
  The token still never reaches the command line.
- Session start makes one extra request to HF when a token is set.
- Tools HF adds _during_ a session (`tools/list_changed`) aren't in `disallowedTools` and the
  guard has already run; `canUseTool` still denies them.

## D-020: load_hf_dataset downloads into userData/datasets/hf through a narrow exception (2026-10-01)

**Context:** The analyst can find datasets on the Hub (D-019), but to query one, a file must be
on disk and registered. datadesk-mcp denies registering anything under userData
(`DATADESK_DENY_DIRS`), because that folder holds the encrypted keys, the catalog and logs.
Verified 2026-10-01 from the HF OpenAPI description, the huggingface.js `file-download-info` and
`list-files` sources, and a live anonymous probe (Node 24 `fetch`, `redirect: 'manual'`):

- `https://huggingface.co/datasets/{repo}/resolve/{revision}/{path}` serves a file. Small files
  get a **relative** 307 to `/api/resolve-cache/…`. Large files get a 302 to a CDN host
  (`us.aws.cdn.hf.co`, `cas-bridge.xethub.hf.co`; observed, not documented) with the real size in
  `X-Linked-Size`. A 200 may have no `Content-Length`.
- Errors carry `X-Error-Code` (`GatedRepo`, `RepoNotFound`, `EntryNotFound`). Gated access can
  only be granted in a browser.
- `@huggingface/hub` 2.17.5 exists, but plain `fetch` covers one-file downloads. The library's
  extra is Xet chunked transfer (WASM), not needed for files of this size.

**Decision:**

- **Tool:** `load_hf_dataset({ repo_id, path, revision?, name? })` in datadesk-mcp, registered
  only when `DATADESK_HF_TOKEN` is set. One file per call, `.csv/.tsv/.parquet/.json/.jsonl/
.ndjson` only. The input schema lives in `src/shared/hf.ts`, so main's approval dialog and the
  tool validate the same thing. The default name is `hf_<repo>_<file>`, so a Hub dataset doesn't
  silently replace a local one.
- **Location:** `userData/datasets/hf/<owner>/<repo>/<revision>-<hash>/<path>`, with each segment
  made file-system safe and the result checked to stay inside the folder. The hash covers the
  exact repo, revision and path: the safe-name mapping and case-insensitive NTFS would otherwise
  let two Hub files share one local file, so one download could replace the data behind another
  dataset.
- **Input rules:** no `refs/pr/*` revisions, because anyone can author a Hub pull request; the
  dialog points out any other non-`main` revision. Paths may not contain controls, bidi or
  separator characters (they would make the dialog misleading), nor names Windows can't store
  (trailing dot or space, device names, segments over 255 characters).
- **Exception:** `ImportPolicy.allowDirs` lets a path inside a denied directory through only if
  it is inside an allowed one. Only `load_hf_dataset` passes `allowDirs: [hfDir]`, for the file
  it just wrote. `register_dataset` (model or UI) still refuses all of userData, the HF folder
  included.
- **Cap:** 500 MB per file by default (`DATADESK_HF_MAX_BYTES`), and never more than the import
  cap. It's checked against `X-Linked-Size` and `Content-Length` before the body, and enforced on
  the bytes actually received. The download goes to a `.part` file that is renamed only when
  complete; on any failure, cancel or timeout (20 minutes) it is deleted.
- **Redirects by hand:** follow at most 5, over https only, to `huggingface.co`,
  `*.huggingface.co` or `*.hf.co`. The token is sent to `huggingface.co` only, never to the CDN.
- **Approval:** always asks the user, main analyst only (see the approval route in
  `claudeOrchestrator.ts`).
- **Client seam:** the tool takes `fetch` as a dependency; tests script a fake Hub.

**Alternatives:**

- A download folder outside userData (e.g. Documents): it would need a new user-visible setting,
  and the roadmap asks for app-managed storage.
- Lifting the userData deny for the whole agent server: `register_dataset` could then point at
  the key file.
- `@huggingface/hub`: an extra dependency (plus WASM) for one HTTP GET.
- Letting fetch follow redirects: whether the Authorization header is stripped on a cross-origin
  redirect depends on the fetch implementation, and the hosts would be unchecked.

**Consequences:**

- Downloaded files stay in userData until removed by hand; there's no cleanup UI yet.
- If HF moves its CDN outside `*.hf.co`, downloads fail with "not a Hugging Face host" until the
  list is updated. That fails closed.
- A file is downloaded again each time it is loaded; there is no cache by ETag.

## D-021: OpenAI Agents SDK provider: SDK loop, DataDesk-owned tools and approvals (2026-10-01)

**Context:** Phase 7 runs the same analyst on the OpenAI Agents SDK as a second provider behind
the `Orchestrator` seam. Verified 2026-10-01 against the npm registry and the installed typings
of `@openai/agents-core` / `@openai/agents-openai` **0.18.0** (they depend on `openai` ^7.2.0,
deduped to our 7.25.0, and optionally on `@modelcontextprotocol/client` 2.2.0). The docs-researcher
run was cut short by a usage limit, so the facts below come from the `.d.ts` files and from a
probe that runs the SDK with scripted fake models (no network):

- `Runner.run(agent, input, { stream: true, maxTurns, signal })` returns a `StreamedRunResult`.
  It yields `raw_model_stream_event` (`response_started`, `output_text_delta`, `response_done`
  with usage), `run_item_stream_event` (`message_output_created`, `tool_called`, `tool_output`)
  and `agent_updated_stream_event`. `result.history` is the replayable conversation.
- `agent.asTool({ toolName, toolDescription, runConfig, runOptions, onStream })` runs a fresh
  nested agent. `onStream` receives the nested run's events with the parent's `toolCall.callId`.
  The nested run inherits the runner's model settings, and its usage is added to the parent's.
- **Agent-tool names are rewritten:** `sql-analyst` reaches the model as `sql_analyst`.
- A function tool's `invoke(context, input, details)` gets `details.toolCall.callId` and
  `details.signal`. The Responses API's tool outputs carry no error flag.
- `MCPServerStdio({ command, args, env, cwd, cacheToolsList, clientSessionTimeoutSeconds })`
  spawns through `@modelcontextprotocol/client`'s `StdioClientTransport`. That transport merges a
  short OS allowlist (`getDefaultEnvironment()`) with our `env`, never all of `process.env`.
- Tracing: `RunConfig.tracingDisabled`. Core's default exporter is the console. The OpenAI
  exporter is only installed by `setDefaultOpenAITracingExporter()`, which we never call.
- The SDK reports tokens, not dollars. Prices come from developers.openai.com/api/docs/pricing
  (2026-10-01), in USD per 1M tokens (input / cached / output): gpt-5.4-mini 0.75 / 0.075 / 4.50,
  gpt-5.4 2.50 / 0.25 / 15, gpt-5.5 5 / 0.50 / 30.

**Decision:**

- **Packages:** `@openai/agents-core` and `@openai/agents-openai` (exact versions). The umbrella
  `@openai/agents` adds the realtime package, which we don't need.
- **Same datadesk-mcp, our own tool wrappers.** datadesk-mcp runs over stdio through the SDK's
  `MCPServerStdio`, with the env from `buildServerEnv(…, 'agent', instance)` plus
  `DATADESK_OPENAI_API_KEY`. That env goes to the child's environment, not its command line. We
  don't put the server on agents (`mcpServers`). Instead `analystAgents.ts` lists the server's
  tools once and builds one `FunctionTool` per allowed tool per caller. This gives us:
  - **One allowlist, built by us.** A tool datadesk-mcp adds later never reaches the model, and a
    missing expected tool fails the session. This is the stand-in for Claude's init guard.
  - **Neutral names** (`mcp__datadesk__run_sql`), so events, artifacts, the timeline and the
    shared test fixture are identical across providers.
  - **Approvals inline:** `register_dataset` awaits `ApprovalBroker` inside the tool. The
    questions, validation and stripping come from the shared `approvalQuestions.ts`. The SDK's
    `needsApproval` would interrupt the run and need a serialize-and-resume step for each
    approval, including inside nested agents. Only the analyst may ask; for a sub-agent the tool
    itself refuses, on top of not being in its row.
  - **An error flag:** each wrapper records which calls failed, for `tool_result.isError`.
- **Sub-agents as tools:** `profiler`, `sql_analyst` and `report_writer` come from the same
  `SUBAGENT_TOOLS` rows, prompts and preloaded skills as on Claude (D-017). They are fresh nested
  runs with at most 20 turns and no sub-agent tools, so nesting is impossible. The mapper reports
  a delegation as the neutral `Agent {subagent_type, prompt}`, the Claude shape, so the timeline
  lanes work unchanged.
- **Skills served by DataDesk:** the SDK has no Agent Skills. The same plugin `SKILL.md` files are
  read at session start. Sub-agents get theirs appended to their instructions, and the analyst
  gets a `Skill` tool that returns a skill's body on demand: the same progressive disclosure.
- **No Hugging Face on this provider (Phase 7).** The remote HF server, its discovery, guard and
  scope hook are wired into the Claude CLI. Without the token, datadesk-mcp doesn't register
  `load_hf_dataset`, and there is no `dataset-scout`.
- **OpenAI tools on:** `search_columns` and `second_opinion` are enabled, because the key that
  runs the analyst already sends the conversation to OpenAI.
- **Privacy:**
  - `store: false` with `include: ['reasoning.encrypted_content']`, and the history replayed from
    memory. The Responses API otherwise keeps requests for 30+ days.
  - Tracing is disabled per run, also for nested runs.
  - Errors are mapped by class (`explainOpenAIError`), so a raw API message, which can echo a
    masked key, never reaches the chat.
  - The client pins `baseURL` and nulls org/project, as in D-018.
- **Cost and limits:**
  - The model must be one of `OPENAI_MODELS`, a fixed list matching our price table.
  - Cost is added up per `response_done`, from the analyst and its sub-agents. Reaching
    `maxBudgetUsd` aborts the turn (`error_max_budget_usd`) and refuses later turns.
  - `maxTurns` maps to the run's `maxTurns` (`error_max_turns`).
  - `toolNotFoundBehavior: 'return_error_to_model'`, so a hallucinated tool name doesn't end the
    turn.
- **Lifecycle:**
  - Turns run one after another.
  - `stop()` aborts the turn's signal, which also reaches nested runs and tools, and denies its
    approvals. A stopped turn is not added to the history.
  - `reset()` emits the boundary marker, drops the history and closes datadesk-mcp.
- **Temp dirs:** concurrent agent servers (chat and compare mode, two providers) each get their
  own DuckDB spill directory (`duckdb-tmp/agent-<instance>`).

**Alternatives:**

- `mcpServers` + `toolFilter` on each agent: SDK-native, but it gives raw tool names, no error
  flag and approval only through interrupt/resume. Scoping per caller would need a callable
  filter keyed on the agent.
- `needsApproval` + `result.interruptions` + `RunState` resume: the documented
  human-in-the-loop path. It ends and restarts the stream on every approval, and a sub-agent's
  interruption surfaces through the parent's state. The inline `await` matches how the Claude
  side's `canUseTool` already works.
- Handoffs instead of agents-as-tools: control would pass to the sub-agent for the rest of the
  conversation, which is not how the Claude sub-agents behave.
- `previousResponseId` instead of replaying the history: needs `store: true`.
- A free-text model field: cost and the spend cap would be unknown for unlisted models.

**Consequences:**

- The OpenAI key now also _runs the analyst_ when the user picks OpenAI. The Settings text has to
  say so; that comes with the provider switch.
- `store: false` with encrypted reasoning items is the documented stateless pattern, but no real
  call has exercised it here. It is on the manual-check list. If OpenAI rejects replayed
  reasoning items, the fallback is `reasoningItemIdPolicy: 'omit'`.
- Prices are constants; a price change needs a code change. Long-context rates (prompts over
  272K tokens) are not modelled.
- An interrupted turn leaves no trace in the model's context (on Claude it does).

## D-022: Provider switch and compare mode (2026-10-01)

**Context:** Phase 7 lets the user pick the analyst's provider, and adds a compare mode that
asks both providers the same question and shows answer, tool calls, cost and latency side by
side. Both orchestrators emit the same `AgentEvent`s (D-021), so the UI can treat them alike.

**Decision:**

- **Settings:**
  - `provider` (`anthropic` | `openai`) and `openaiModel` (from the priced `OPENAI_MODELS`) are
    added to `AgentSettings`. Both have zod defaults, so a `settings.json` from before Phase 7
    still loads, as Claude.
  - `model` stays the Claude model, so switching back and forth keeps both choices.
- **Switching:**
  - The runtime needs the selected provider's key (`UNAVAILABLE` names it). Saving settings goes
    through `onSettingsChanged`: it resets the current orchestrator once (`'settings'`) and drops
    it if the provider changed. The next message creates the other one.
  - Swapping lazily on the next send would emit a second reset marker after the renderer had
    already shown the user's new message, and the marker would clear it.
- **Compare mode is two "lanes":** each lane is an ordinary `createAgentRuntime` with
  `lane: { provider, instance }`.
  - **Fixed provider:** each lane ignores the chat's provider setting.
  - **Own event bus:** each lane numbers its own events. They go on a separate push channel,
    `compare:event`, as `{ provider, event }`, with the envelope validated
    (`CompareEventSchema`).
  - **Own datadesk-mcp temp dir:** `agent-compare-<provider>`.
  - **No approvals:** tools that need the user are declined without asking. One question would
    otherwise raise two dialogs, and both lanes would register or download the same thing.
  - **No Hugging Face:** the OpenAI lane has none (D-021), so the Claude lane runs without it
    too, keeping the comparison fair. That also means no HF discovery traffic.
- **Each question starts fresh sessions on both sides** (one-shot), so earlier comparisons don't
  colour the next. Leaving compare mode (`compare:reset`) ends both sessions, so no Claude CLI
  or datadesk-mcp stays idle in the background. Settings and key changes reset the lanes too.
- **Both keys are required** (`compare:run` refuses with `UNAVAILABLE`) rather than running one
  lane alone, which wouldn't be a comparison.
- **Renderer:** each lane feeds the chat's own `agentReducer`, and `summarizeLane` reduces the
  state to the comparison. "Cost" is the turn's cost. "Turn (SDK)" is the duration the provider
  reports. "Time to answer" runs from the click to `turn_complete`, including session start (the
  Claude CLI process or the datadesk-mcp spawn).

**Alternatives:**

- Tagging every `AgentEvent` with a lane id: it would touch every event producer and consumer
  for a feature that only compare mode needs.
- One shared approval dialog for both lanes: twice the side effects for one click.
- Keeping compare sessions alive for follow-up questions: then the comparison depends on the
  history, and processes linger while the user is back in the chat.

**Consequences:**

- Compare mode costs two analyst runs per question, and the user sees both prices.
- Charts and reports created in compare mode are saved as usual, but compare mode shows only
  their tool calls, not the artifacts.
- Up to three agent sessions can run at once (chat plus two lanes), each with its own
  datadesk-mcp. They share the catalog file, as the UI's server already does.

## D-023: Windows installer: assisted per-user NSIS, unsigned, trimmed runtime deps (2026-10-01)

**Context:** Phase 8 turns the Phase 2 packaging spike (`electron-builder --dir`) into an
installer. Option names and defaults were verified 2026-10-01 against electron-builder
**26.15.3**'s own schema (`node_modules/app-builder-lib/scheme.json`), which is the source the
docs at electron.build are generated from. Measured on the spike build: 730 MB unpacked; the
signed `claude.exe` alone is 234 MB, DuckDB's binding 38 MB, and `app.asar` 73 MB (with
React, Vega Embed, Markdown and `@anthropic-ai/sdk` in it although nothing loads them at
runtime).

**Decision:**

- **Installer:** NSIS x64, assisted (`oneClick: false`), per-user (`perMachine: false`), so no
  admin prompt. The default folder is `%LOCALAPPDATA%\Programs\DataDesk` and the user may change
  it. The installer creates Start-menu and desktop shortcuts and is named
  `DataDesk-Setup-<version>-x64.exe`. `compression: normal` (the schema notes `maximum` gains
  little). `publish: null`, so a local build never uploads anything.
- **Layout (unchanged from the spike, now final):**
  - `asarUnpack`: DuckDB's binding and the Claude binary, because native code can't run from an
    archive.
  - `extraResources`: `agent-plugin` (the CLI reads it from disk) and `duckdb-extensions`.
  - **`mcp-server.js` stays inside `app.asar`.** The roadmap listed "the MCP bundle" under
    `asarUnpack`, but datadesk-mcp runs under the Electron binary in Node mode, which reads
    asar archives, and both providers' packaged smoke runs prove it. Unpacking it would only
    duplicate files.
- **Trimmed dependencies:** `react`, `react-dom`, `react-markdown`, `remark-gfm` and `vega-embed`
  are bundled into `out/renderer` by Vite, and `@anthropic-ai/sdk` is a type-only peer of the
  Agent SDK. All six moved to `devDependencies`, which electron-builder doesn't ship. `vega`,
  `vega-lite` and `vega-interpreter` stay, because main renders chart SVGs for PDF export.
  `app.asar` went from 73 MB to 55 MB.
- **No leftover installer copy:** every non-web electron-builder installer copies itself (about
  215 MB) to `%LOCALAPPDATA%\datadesk-updater` for `electron-updater`, and its uninstaller never
  removes it (`templates/nsis/include/installer.nsh`; there is no option to turn this off). We
  have no updater, so `build/installer.nsh` deletes the copy in `customInstall` (which runs after
  the copy is made) and removes the folder in `customUnInstall`. The installer smoke checks both.
- **Icon:** `build/icon.ico` (a bar chart in the app's accent colour), generated by
  `scripts/make-icon.mjs`, so it has a reviewable source instead of an opaque binary.
- **Unsigned:** there is no code-signing certificate. `DataDesk.exe` and the installer are
  unsigned, so SmartScreen warns on first run. The README explains "More info → Run anyway".
  `claude.exe` keeps Anthropic's valid signature; electron-builder doesn't re-sign it without a
  certificate.

**Alternatives:**

- One-click installer: no choice of folder, and less clear for a first-time user.
- Per-machine install: needs admin rights for a single-user desktop app.
- `asarUnpack` the MCP bundle: duplicates files for no benefit (see above).
- `compression: store` (the spike's): faster builds, but an installer of roughly 700 MB.
- Signing with a self-signed certificate: SmartScreen still warns, and users would be taught to
  trust an unknown publisher.

**Consequences:**

- Installed size is about 713 MB, and the installer is about 215 MB. Most of it is the Claude
  binary, which the Agent SDK needs. Trimming further would mean downloading it on first use,
  which is out of scope.
- If a certificate is added later (`cscLink`), check that `claude.exe` keeps Anthropic's
  signature (`signExts` / `signtoolOptions`), so it isn't re-signed with ours.
- Updates mean reinstalling; there is no auto-updater (no `electron-updater`, no publish target).

## D-024: Theme tokens and a separate appearance store (2026-10-01)

**Context:** Phase 9 (UI polish). The owner wants a black-and-white look and a theme switcher.
Every component hard-coded Tailwind palette classes (`bg-slate-900`, `bg-sky-700`, ...), so any
new theme meant editing every component. Main also draws colours the page can't reach: the
window background before first paint, and (from the next task) the native window controls.
Verified 2026-10-01: Tailwind **4.3.3** `@theme inline` (https://tailwindcss.com/docs/theme,
"Referencing other variables"); Electron **44.5.1** `nativeTheme.themeSource` /
`shouldUseDarkColors` / `'updated'` (`node_modules/electron/electron.d.ts:10130-10236`), and
`prefers-color-scheme` in the renderer follows `themeSource` (same lines;
https://www.electronjs.org/docs/latest/tutorial/dark-mode).

**Decision:**

- **Tokens:** components use semantic colours only (`bg-canvas`, `bg-surface`, `bg-raised`,
  `text-muted`, `text-faint`, `border-line`, `bg-accent`, `text-danger`, ...). `@theme inline`
  maps each to a `--dd-*` variable, and `[data-theme='dark'|'light'|'slate']` blocks set the
  values. The selectors work on any element, so Settings previews each theme in place.
- **Themes:** Dark (neutral black and white, default), Light, Slate (the pre-Phase-9 look), and
  System (Dark or Light from the OS).
- **Storage:** `userData/appearance.json` (`{ version: 1, appearance: { theme, layout } }`) via
  `AppearanceStore`, behind `settings:getAppearance` / `settings:setAppearance`. It is separate
  from `settings.json` because saving agent settings restarts the conversation; a theme change
  must not.
- **Who resolves System:** main sets `nativeTheme.themeSource` (`system`, or `dark`/`light`;
  slate counts as dark), so `prefers-color-scheme` in the page follows it and the renderer
  resolves System with `matchMedia`. Main resolves it again with `shouldUseDarkColors` for the
  colours it paints, and repaints on `nativeTheme` `'updated'`.
- **No flash:** main creates the window with the saved theme's background. `<html>` gets no
  `data-theme` until the saved appearance has loaded, and the body background applies only
  once it has, so the window background shows through until then.
- **Guards:** a tooling test fails on any palette class in `src/renderer`, on a theme missing a
  token, and on `THEME_CHROME` (main's colours) drifting from `styles.css`.

**Alternatives:**

- `localStorage` for the theme: main still needs it for the window background and title bar,
  so it would be stored twice.
- A `dark:` variant per class: it only handles two themes, and every component would spell out
  every theme.
- Keeping the theme in `AgentSettings`: saving it would reset the conversation.

**Consequences:**

- A new theme is one CSS block plus one `THEME_CHROME` entry. The tests point at anything
  missing.
- Charts keep a white surface until they get a theme-aware Vega config (later Phase 9 task).

## D-025: Page-drawn title bar with native window controls (2026-10-01)

**Context:** The owner wanted the "File, Edit, View, Window" menu gone and a title bar that
belongs to the app, like VS Code, Discord or Obsidian. Verified 2026-10-01 against Electron
**44.5.1** (`node_modules/electron/electron.d.ts:4055-4067, 24145-24167, 9640, 16241`;
https://www.electronjs.org/docs/latest/tutorial/custom-title-bar; source of
`NativeWindow::IsWindowControlsOverlayEnabled` and `setTitleBarOverlay` at tag v44.5.1).

**Decision:**

- `titleBarStyle: 'hidden'` plus `titleBarOverlay: { color, symbolColor, height: 40 }`.
  Windows keeps drawing its own minimize, maximize and close buttons (with snap layouts and
  the right hover states), in the theme's colours. The page draws the rest of the bar.
  `setTitleBarOverlay` repaints the controls on a theme change. It throws if the window was
  created without an overlay, which can't happen here because every window gets one.
- `Menu.setApplicationMenu(null)` removes the menu and its accelerators app-wide. Hiding it
  (`autoHideMenuBar`) would let Alt bring it back.
- **CSS:** `.titlebar` sets `app-region: drag`, and its buttons set `no-drag`. Its right padding
  comes from `env(titlebar-area-x/width)`, so nothing sits under the native controls. The e2e
  test checks that `navigator.windowControlsOverlay.visible` is true.
- **Shortcuts the menu used to provide** are handled in `before-input-event`
  (`src/main/shortcuts.ts`): Ctrl+= / Ctrl+- / Ctrl+0 zoom in every build; F12, Ctrl+Shift+I,
  F5 and Ctrl+R only when not packaged. Copy, paste, cut, select-all and undo need no menu on
  Windows, because Blink handles them in text fields (`editing_behavior.cc`). The e2e test
  checks cut and paste.

**Alternatives:**

- `frame: false` with page-drawn window buttons: you lose Windows snap layouts and the native
  hover and maximize behaviour, and the app has to reimplement them.
- Keeping a hidden menu just for its roles: the accelerators we need fit in one small module.

**Consequences:**

- Playwright's `press()` is injected into the page, below `before-input-event`, so the zoom
  e2e test sends native key events with `webContents.sendInputEvent`.
- No reload or DevTools in packaged builds (neither was reachable before without the menu).
- `TITLE_BAR_HEIGHT` (main) and `.titlebar { height }` (CSS) must stay equal.

## D-026: Chat markdown with class-only highlighting and a write-only clipboard (2026-10-02)

**Context:** Analyst answers were shown as plain text, so tables, lists and SQL arrived as raw
markdown. Model output is untrusted (it can echo text from datasets), and the CSP forbids
inline scripts and injected `<style>`. Verified 2026-10-02 against the installed packages:
**react-markdown 10.1.0**, **remark-gfm 4.0.1**, **rehype-highlight 7.0.2**
(`node_modules/rehype-highlight/lib/index.d.ts`: `languages`, `aliases`, `detect`, `plainText`;
an unknown language only adds a vfile warning), **highlight.js 11.11.2**
(`types/index.d.ts` declares `highlight.js/lib/languages/*`). Sources:
https://github.com/remarkjs/react-markdown, https://github.com/rehypejs/rehype-highlight.

**Decision:**

- `ChatMarkdown` uses the same safety rules as `ReportMarkdown`: no `rehype-raw`, so raw HTML
  shows as text; links are unwrapped to their text; images become their alt text and never an
  `<img>`. Highlighting runs through rehype-highlight, which emits `hljs-*` classes only. The
  colours are theme tokens (`--dd-hl-*`), so code follows Dark, Light and Slate.
- Only eight languages are registered (sql, python, r, json, javascript, typescript, bash,
  yaml), with `duckdb` as an alias for sql. That keeps the bundle small; other fences stay plain.
- Streaming needs no special parser. CommonMark already treats an unclosed fence as code to
  the end of the text, and a GFM table renders once its delimiter row arrives.
- A tiny remark plugin turns `[[chart:<id>]]` in prose (not in code) into a chip. The chip is
  named after the chart and, via `ResultsFocusProvider`, brings that chart's tab forward in the
  Results panel. Ids not in this conversation show as a disabled chip.
- Copying a code block goes through a new **write-only** `clipboard:writeText` IPC channel
  (zod-validated, text ≤ 1 MB). `hardenApp.ts` denies every permission check, so
  `navigator.clipboard` would be rejected.

**Alternatives:**

- Allowing the `clipboard-sanitized-write` permission: this widens a deny-all handler, and the
  renderer could then also ask for other clipboard permissions. An explicit write-only method
  is easier to reason about and test.
- Shiki: it emits inline `style` colours by default, and its WASM engine would need
  `wasm-unsafe-eval` in the CSP.
- `lowlight`'s `common` set (~37 languages): a larger bundle for languages an analyst rarely
  writes.

**Consequences:**

- No IPC channel can read the clipboard. `tests/shared/ipc/contract.test.ts` fails if one is
  added.
- A new language needs one import in `ChatMarkdown.tsx`. If the token colours look off for it,
  extend the `.hljs-*` rules in `styles.css`.

## D-027: Resizable panels as ARIA window splitters, sizes in localStorage (2026-10-02)

**Context:** The panels had fixed widths. The owner wanted to drag them, like the prototype,
and the roadmap asks for keyboard access and sizes remembered per layout.

**Decision:**

- A small `Splitter` component follows the WAI-ARIA window-splitter pattern:
  `role="separator"`, focusable, `aria-valuenow/min/max`, arrow keys move it 24 px, Home/End
  jump to the limits. Pointer drag uses pointer capture, so a fast drag doesn't lose the 1 px
  line. No library: the whole thing is about 80 lines.
- Sizes are plain px values, applied through React's `style` prop. React writes them through
  the CSSOM, which `style-src 'self'` allows (the CSP only blocks style attributes in markup and
  `<style>` elements). The e2e test drags in the real app to prove it.
- Sizes are kept per layout in the renderer's `localStorage` (`datadesk.panelSizes.v1`), read
  through a zod schema and clamped, so a corrupt entry falls back to the defaults.

**Alternatives:**

- Saving in main next to the appearance settings: main needs the theme before the first paint
  (D-024), but it never needs panel sizes, and a drag would mean a stream of IPC writes.
- `react-resizable-panels`: works in percentages and brings its own layout model. Fixed-px
  side panels with one growing area is what the prototype does.

**Consequences:**

- Sizes live in `userData/Local Storage`. Clearing site data resets them, which is harmless.
- `PANEL_LIMITS` holds fixed px limits. On a very small window the growing area can get
  narrow, but every panel keeps `min-w-0` and scrolls.
