# Learning log

One entry per phase, written at the end of the phase by `/finish-phase`. Format:
Concept · Where it lives · How it works · Gotchas · Experiments.

---

## Phase 0: Setup and secure shell (2026-10-01)

### Concept

**1. Electron has three kinds of code with different trust levels.** The **main process** is full
Node.js: files, OS encryption, child processes. The **renderer** is a Chromium page and should be
treated like an untrusted website. The **preload** is a small bridge script that runs before the
page and decides exactly what the page can call. Security comes from keeping the renderer weak
(no Node, sandboxed, strict CSP) and making every crossing into main **explicit, validated, and
typed**.

**2. Claude Code can be shaped per project, the same way we'll later shape the in-app agent.**
`.claude/` holds _sub-agents_ (separate contexts with their own tools and prompts), _skills_
(procedures loaded on demand), _permissions_ (allow/ask/deny rules) and _hooks_ (your code that
runs before a tool call and can veto it). The instructions in a prompt are _requests_. Permission
rules and hooks are _enforcement_. Phases 2–4 apply the same split to the DataDesk analyst.

### Where it lives

- Process wiring: [src/main/index.ts:23](../src/main/index.ts#L23) (single-instance lock),
  [:34](../src/main/index.ts#L34) (register `app://`), [:50](../src/main/index.ts#L50) (guards),
  [:61](../src/main/index.ts#L61) (IPC router), [:77](../src/main/index.ts#L77) (secrets handlers)
- Window hardening: [src/main/window.ts:5](../src/main/window.ts#L5) `secureWebPreferences`
- CSP: [src/main/security/csp.ts:21](../src/main/security/csp.ts#L21) `buildCsp`
- `app://` protocol: [src/main/security/appProtocol.ts:17](../src/main/security/appProtocol.ts#L17)
  (privileged scheme), [:29](../src/main/security/appProtocol.ts#L29) (`resolveAppPath`, traversal
  guard), [:55](../src/main/security/appProtocol.ts#L55) (serving + CSP header)
- Navigation and sender checks:
  [src/main/security/navigation.ts:31](../src/main/security/navigation.ts#L31) `isAppOrigin`,
  [src/main/ipc/trustedSender.ts:5](../src/main/ipc/trustedSender.ts#L5)
- IPC contract: [src/shared/ipc/contract.ts:25](../src/shared/ipc/contract.ts#L25) `ipcContract`,
  [:8](../src/shared/ipc/contract.ts#L8) `SecretsStatusSchema` (booleans only)
- IPC router: [src/main/ipc/router.ts:41](../src/main/ipc/router.ts#L41) sender check →
  [:46](../src/main/ipc/router.ts#L46) request validation →
  [:63](../src/main/ipc/router.ts#L63) response validation
- Preload bridge: [src/preload/index.ts:28](../src/preload/index.ts#L28), bundled as CJS per
  [electron.vite.config.ts:20](../electron.vite.config.ts#L20)
- Key storage: [src/main/secrets/keyStore.ts:73](../src/main/secrets/keyStore.ts#L73) `set`,
  [:89](../src/main/secrets/keyStore.ts#L89) `getKey` (main-only),
  [:120](../src/main/secrets/keyStore.ts#L120) atomic queued writes
- Settings UI: [src/renderer/src/components/SettingsDialog.tsx:96](../src/renderer/src/components/SettingsDialog.tsx#L96)
- Dev tooling: [.claude/settings.json](../.claude/settings.json),
  [.claude/hooks/policies.mjs:28](../.claude/hooks/policies.mjs#L28) /
  [:49](../.claude/hooks/policies.mjs#L49) / [:71](../.claude/hooks/policies.mjs#L71),
  agent-scoped hooks in [.claude/agents/code-reviewer.md:6](../.claude/agents/code-reviewer.md)
  and [test-writer.md:6](../.claude/agents/test-writer.md)

### How it works

What happens when you paste an OpenAI key into Settings and click **Save**:

1. `ProviderRow.save` copies the draft and clears the input _before_ awaiting anything, so the key
   is only in React state for one render.
2. It calls `window.datadesk.secrets.set('openai', key)`. `window.datadesk` isn't a Node object:
   `contextBridge` copied the preload's `api` object into the page's isolated world.
3. The preload's `set` calls `ipcRenderer.invoke('secrets:set', { provider, key })`. The preload
   imports only channel-name strings and _types_, so zod was never bundled into this sandboxed
   script (ESLint now enforces this).
4. In main, the router first checks `event.senderFrame`: is it the **top-level** frame of our
   origin (`app://datadesk`)? An iframe or foreign page gets `FORBIDDEN_SENDER`.
5. It validates the payload with the zod contract (`strictObject`, known provider, 8–4096
   chars). Failures list only field paths and codes. The key never appears in an error.
6. The handler calls `KeyStore.set`. That refuses if OS encryption is unavailable, encrypts with
   `safeStorage` (Windows DPAPI, tied to your Windows login), and queues a write: temp file, then
   `rename` over `secrets.json`, retrying if antivirus briefly locks the file.
7. The handler returns `status()`: three booleans. The router validates that too, so a buggy
   handler that returned `{ ..., key }` would be caught (`INVALID_RESPONSE`); a test proves it.
8. The renderer receives `{ ok: true, data: { openai: true, … } }` and the badge flips to **Set**.
   Nothing on the renderer side ever held the key again.

### Gotchas

- **`file://` pages can't get a CSP header.** Electron's `webRequest` hooks don't fire for
  `file://`, so a header-based CSP would have silently done nothing. We serve the renderer from a
  custom `app://` scheme instead (D-007).
- **Node's `URL` gives origin `"null"` for custom schemes.** `new URL('app://x').origin ===
new URL('evil://y').origin` is `true`. Our first `isAppOrigin` compared `.origin` and would
  have allowed navigation to _any_ custom-scheme URL. A unit test caught it. Compare scheme and
  host explicitly.
- **Sandboxed preloads must be CommonJS with dependencies bundled.** Our package is
  `"type": "module"`, so electron-vite would have emitted an ESM preload that fails to load.
- **Playwright's `page.evaluate` bypasses CSP.** It runs through DevTools, so `eval` inside it
  "works" even under a strict CSP. To test CSP, inject a real `<script>` tag and listen for
  `securitypolicyviolation`.
- **`net.connect()` normalizes arguments into an array** before `socket.connect`, which fooled
  the first version of the test network guard. Its own test caught this.
- **Version pins aren't paranoia.** On day one, latest electron-vite didn't support latest Vite,
  and latest TypeScript (7.0) wasn't supported by typescript-eslint (D-001).
- **npm 11 skips install scripts until you approve them.** Electron 44 no longer uses one (it
  downloads its binary on first run), so the dev install worked anyway.
- **Hooks are string-matching, not a sandbox.** The Phase 0 review found real bypasses in my
  first hook policies: a newline chaining a second command, `git diff --output=<file>` writing
  files, and `npm run lint:fix` matching a `lint\b` allowlist. The strict `private-paths` hook also
  blocks commands that merely _mention_ the protected names, so commit messages containing them
  must go through `git commit -F <file>`.
- **Frontmatter hooks bind to the agent _type_.** A general-purpose agent told to "act as
  code-reviewer" doesn't get the code-reviewer's hooks. New `.claude/agents/` directories also
  need a session restart before `/agents` shows them.

### Experiments

1. **Watch the sender check work.** Run `npm run dev`, open DevTools (Ctrl+Shift+I) and run
   `await window.datadesk.secrets.set('nope', 'x')`. _Expect_ `{ ok: false, error: { code:
'INVALID_REQUEST', message: '… provider: invalid_value; key: too_small …' } }`. The message
   names fields, never your input. Then try `window.require` and `process`: both `undefined`.
2. **Break the CSP on purpose.** In [src/main/security/csp.ts](../src/main/security/csp.ts), add
   `"'unsafe-inline'"` to production `script-src`, then run `npm run test:e2e`. _Expect_ both CSP
   e2e tests to fail: the header assertion, and the injected `<script>` now running. Revert
   afterwards.
3. **See the dev-agent guardrails.** In Claude Code, ask: "Use the test-writer agent to add a
   comment to src/main/index.ts". _Expect_ the hook to block the Edit with "test-writer may only
   edit files under tests/…" and the agent to report it can't. Then ask the code-reviewer agent
   to run `git status && npm install left-pad`. _Expect_ it to be blocked for chaining.

---

## Phase 1: Our MCP server (DuckDB) (2026-10-01)

### Concept

**MCP (Model Context Protocol) is a JSON-RPC protocol between a _client_ (something that wants
capabilities: an agent, an IDE, our UI) and a _server_ (something that offers them).** A server
advertises **tools**. Each tool has a name, a description written _for the model_, an input JSON
Schema and (optionally) an output JSON Schema. The client discovers them with `tools/list` and
invokes one with `tools/call`. The **transport** is pluggable: we use **stdio** (the client
spawns the server as a child process and they exchange newline-delimited JSON over
stdin/stdout). Tests use an **in-memory** pair of pipes, and Phase 6 will use **HTTP** for
Hugging Face's remote server.

Two ideas make our server safe to hand to an AI:

1. **Tools return errors as results** (`isError: true` with a readable message), not protocol
   failures, so the model sees "Only SELECT queries are allowed (got CREATE)" and can fix its SQL.
2. **Defense in depth.** "Read-only SQL" is enforced by DuckDB's own parser (statement type),
   then by a locked-down database instance that can only read the exact files you registered,
   then by row, byte and time limits. Any single layer could have a gap. Together they held up
   against a code review that tried to break them.

This phase built **both sides**: datadesk-mcp is a server, and the Electron main process runs an
MCP _client_ (`UiMcpClient`) so the sidebar uses the exact same tools the agent will use in
Phase 2.

### Where it lives

- Server assembly: [src/mcp-server/server.ts:84](../src/mcp-server/server.ts#L84) `buildServer`.
  The six `registerTool` calls start at [:98](../src/mcp-server/server.ts#L98) (`register_dataset`)
  and end at [:213](../src/mcp-server/server.ts#L213) (`run_sql`). Error mapping is at
  [:52](../src/mcp-server/server.ts#L52) `fail`.
- stdio entry: [src/mcp-server/index.ts:58](../src/mcp-server/index.ts#L58)
- Read-only guard: [src/mcp-server/db/readOnlyGuard.ts:35](../src/mcp-server/db/readOnlyGuard.ts#L35)
  (one statement) and [:41](../src/mcp-server/db/readOnlyGuard.ts#L41) (SELECT only)
- Lockdown and execution: [src/mcp-server/db/datasetDb.ts:255](../src/mcp-server/db/datasetDb.ts#L255)
  `build` → [:289-291](../src/mcp-server/db/datasetDb.ts#L289) (`allowed_paths`, external access
  off, config locked); [:195](../src/mcp-server/db/datasetDb.ts#L195) `execute` (timeout covers
  [:217](../src/mcp-server/db/datasetDb.ts#L217) binding and
  [:219](../src/mcp-server/db/datasetDb.ts#L219) streaming)
- Streaming with row and byte budgets: [src/mcp-server/db/convert.ts:46](../src/mcp-server/db/convert.ts#L46)
- Import policy: [src/mcp-server/fileAccess.ts:55](../src/mcp-server/fileAccess.ts#L55), with link
  detection at [:119](../src/mcp-server/fileAccess.ts#L119)
- Multi-process catalog lock: [src/mcp-server/catalog.ts:74](../src/mcp-server/catalog.ts#L74)
- MCP client in main: [src/main/mcp/uiClient.ts:81](../src/main/mcp/uiClient.ts#L81) `call`
  (validates `structuredContent` at [:96](../src/main/mcp/uiClient.ts#L96)); spawn + env:
  [src/main/mcp/serverProcess.ts:18](../src/main/mcp/serverProcess.ts#L18)
- Renderer → path boundary: [src/preload/index.ts:28](../src/preload/index.ts#L28) `registerFile`
- Tests that attack it: [tests/mcp-server/db/datasetDb.test.ts](../tests/mcp-server/db/datasetDb.test.ts),
  [tests/mcp-server/server.test.ts](../tests/mcp-server/server.test.ts) (protocol level),
  [tests/e2e/mcp-stdio.spec.ts](../tests/e2e/mcp-stdio.spec.ts) (real stdio, Electron-as-Node)

### How it works

What happens when you drop `sales.csv` on the sidebar and it appears with a preview:

1. The drop handler passes the DOM `File` to `window.datadesk.datasets.registerFile(file)`. The
   preload asks Electron for its real path (`webUtils.getPathForFile`). A `File` made by page
   script has no path, so page code can never name an arbitrary file.
2. IPC `datasets:register` → main validates `{ path }` with zod → `UiMcpClient.register(path)`.
3. On first use, `UiMcpClient` spawns `electron.exe out/main/mcp-server.js` with
   `ELECTRON_RUN_AS_NODE=1` and an explicit env (catalog path, temp dir, deny-listed userData, and
   no keys). It then performs the MCP handshake (`initialize` → capabilities → `initialized`).
4. It sends `tools/call register_dataset { path }`. The server validates the arguments against
   the tool's input schema.
5. `validateImportPath` checks the path is absolute and local, has no link or junction in any
   component, has a data extension, no glob characters, is under the size cap, and isn't under
   userData. It then resolves the real path.
6. `DatasetDb.register` builds a **fresh** in-memory DuckDB:
   - it sets limits, turns off extension autoinstall, and creates one view per dataset;
   - it sets `allowed_paths` to exactly those files, then disables external access and locks the
     configuration;
   - it counts rows under the timeout, and only then writes the catalog, holding the lockfile.
7. The tool returns `structuredContent` `{ name, format, path, rowCount, columns }`. The server
   checks it against the output schema, and so does the client again. Main maps it to an
   `IpcResult` for the renderer.
8. The sidebar bumps its revision and selects `sales`. `sample_rows` streams the first 20 rows
   chunk by chunk under the row and byte budgets. Numbers arrive as numbers, dates as ISO strings.

### Gotchas

- **You can't widen a locked DuckDB.** Once `enable_external_access=false`, `allowed_paths`
  can't change and extensions can't load. So every registration builds a new instance (cheap:
  views don't copy data), and the Excel extension must be `LOAD`ed first.
- **`allowed_directories` is a prefix match.** Allowing the folder of a file you dropped from
  Downloads would expose all of Downloads, so we allow exact files with `allowed_paths`.
- **Some writes never reach the statement-type check.** DuckDB rejects `INSERT` into a view, or
  `COPY` with file access off, while _binding_ inside `prepare()`. Nothing executes, just an
  earlier layer. Statement-form `PIVOT` without `IN (...)` expands into several statements (it
  creates an ENUM), so it's rejected.
- **`realpath` also expands Windows 8.3 short names** (`C:\PROGRA~1`), so "real path ≠ requested
  path" doesn't mean "link". The reviewer caught this before CI did; GitHub runners use a short
  temp dir.
- **Node has two `realpath`s** (found after merge, when CI went red): `fs.promises.realpath` and
  `realpathSync.native` call the OS and expand 8.3 names. Plain `fs.realpathSync` is a JS
  implementation that doesn't. My regression test used the JS one as its expected value, so it
  failed only on CI's `C:\Users\RUNNER~1\…` temp dir. To reproduce CI locally, set `TEMP`/`TMP` to
  the short form of a long-named folder.
- **Excel has no integer type:** whole numbers arrive as `DOUBLE`. BIGINT/DECIMAL arrive from
  DuckDB's JSON converter as _strings_, so we convert safe ones back to numbers.
- **stdout belongs to the protocol.** A stray `console.log` in the server corrupts the stream.
  Log to stderr.
- **`StdioClientTransport` gives the child only a small OS allowlist of env vars** plus what you
  pass. Great for secrets, but `ELECTRON_RUN_AS_NODE` must be passed explicitly.
- **Shell pipes hide failures.** `npm run check | grep` exits 0 even when check fails. I once
  committed a lint error that way; the fix is `set -o pipefail`.
- **React Compiler lint (`react-hooks` v7) flags `setState` called synchronously in an effect.**
  The fix: store fetched data _with the key it belongs to_ and derive staleness during render
  (`useIpcQuery`).

### Experiments

1. **Talk to the server yourself.** Run `npm run mcp:inspect`, open the printed URL, and
   _Connect_. In **Tools**, call `register_dataset` with the absolute path of
   `test-data/public/sales.csv`, then `run_sql` with
   `SELECT region, sum(units) FROM sales GROUP BY 1`. _Expect_ both the text and the
   `structuredContent`. Then try `DROP VIEW sales` and
   `SELECT * FROM read_text('C:/Windows/win.ini')`. _Expect_ `isError` results explaining why.
2. **Watch the protocol.** In the Inspector, open the **History/Notifications** panel while
   calling `list_datasets`. _Expect_ a JSON-RPC `tools/call` request with an `id`, and a response
   whose `result` has `content` and `structuredContent`. That's everything MCP is, on the wire.
3. **Break a layer and see what still holds.** In
   [src/mcp-server/db/datasetDb.ts](../src/mcp-server/db/datasetDb.ts), comment out the
   `SET enable_external_access = false` line and run
   `npx vitest run tests/mcp-server/db/datasetDb.test.ts`. _Expect_ the "lockdown" tests to fail:
   the secret file becomes readable through a plain SELECT, even though the statement-type guard
   still passes. That's why one layer isn't enough. Revert afterwards.

---

## Phase 2: Agent runtime, chat and timeline (2026-10-01)

### Concept

**An agent is a loop:** the model reads the conversation, asks to call a tool, gets the result,
and repeats until it can answer. The **Claude Agent SDK** runs that loop for you by driving a
**Claude Code process** (a native binary it spawns). Your code decides three things:

1. **What the agent can reach.** That's tools and MCP servers: here, only our 6 datadesk tools.
2. **What happens when it wants to act.** That's permissions:
   - `allowedTools` auto-approves the read-only tools;
   - `canUseTool` is a callback that decides every other call; ours denies by default and asks
     _you_ before `register_dataset`.
3. **What you show while it works.** That's the message stream. We translate the SDK's
   messages into our own provider-neutral `AgentEvent`s for the chat and timeline.

The big lesson of this phase: **isolation is something you _verify_, not something you
_configure_.** We configured `tools: []`, `settingSources: []` and an explicit env, and then
checked at runtime:

- **The init guard** checks every session reports exactly what we granted.
- **Probes with a dummy key** confirmed which tools the model really saw.
- **Probes also showed that typed `/commands` still ran**, until we disabled them.
- **The code review found that the API key reached our MCP server anyway:** the CLI passes its
  own environment to children. A probe confirmed it (D-014).

### Where it lives

- The capability surface: [src/main/agent/claude/agentOptions.ts:70](../src/main/agent/claude/agentOptions.ts#L70)
  `buildAgentOptions`:
  - no disk settings [:74](../src/main/agent/claude/agentOptions.ts#L74)
  - no built-ins [:81](../src/main/agent/claude/agentOptions.ts#L81)
  - explicit mode [:86](../src/main/agent/claude/agentOptions.ts#L86)
  - auto-approved tools [:87](../src/main/agent/claude/agentOptions.ts#L87)
  - no slash commands [:90](../src/main/agent/claude/agentOptions.ts#L90)
- Child environment: [src/main/agent/claude/agentEnv.ts:41](../src/main/agent/claude/agentEnv.ts#L41),
  second hop: [src/main/mcp/serverProcess.ts:19](../src/main/mcp/serverProcess.ts#L19) +
  [src/mcp-server/scrubEnv.ts:12](../src/mcp-server/scrubEnv.ts#L12)
- The session: [src/main/agent/claude/claudeOrchestrator.ts:80](../src/main/agent/claude/claudeOrchestrator.ts#L80) `send`,
  [:176](../src/main/agent/claude/claudeOrchestrator.ts#L176) `start`,
  [:198](../src/main/agent/claude/claudeOrchestrator.ts#L198) `consume` (guard at
  [:215](../src/main/agent/claude/claudeOrchestrator.ts#L215), fail-closed at
  [:225](../src/main/agent/claude/claudeOrchestrator.ts#L225)),
  [:117](../src/main/agent/claude/claudeOrchestrator.ts#L117) `reset`,
  [:144](../src/main/agent/claude/claudeOrchestrator.ts#L144) permission gate
- Streaming input: [src/main/agent/claude/inputQueue.ts:8](../src/main/agent/claude/inputQueue.ts#L8)
- SDK → events: [src/main/agent/claude/sdkMapper.ts:23](../src/main/agent/claude/sdkMapper.ts#L23)
- Runtime tripwire: [src/main/agent/claude/initGuard.ts:17](../src/main/agent/claude/initGuard.ts#L17)
- Human approval: [src/main/agent/approvals.ts:31](../src/main/agent/approvals.ts#L31)
- Push to the UI: [src/main/agent/eventBus.ts:8](../src/main/agent/eventBus.ts#L8) →
  [src/preload/index.ts:58](../src/preload/index.ts#L58) `onEvent` →
  [src/renderer/src/agent/agentState.ts:94](../src/renderer/src/agent/agentState.ts#L94) reducer
- Packaged binary path: [src/main/agent/claude/executable.ts:9](../src/main/agent/claude/executable.ts#L9);
  smoke test: [scripts/smoke-packaged.mjs](../scripts/smoke-packaged.mjs)

### How it works

What happens when you type "Which region sold the most units?" and press Enter:

1. The chat adds your message locally and calls `datadesk.agent.send(text)`. `agent:send` is
   validated in main (1–20 000 chars) and handed to the orchestrator. If no Anthropic key is set,
   the error "Add your Anthropic API key in Settings…" comes back instead.
2. **First message only:** `start()` reads your key and settings and builds the options. The SDK
   spawns `claude.exe` with our explicit env, and the CLI in turn spawns **its own**
   datadesk-mcp (Electron-as-Node) with secrets blanked. That server also scrubs secrets itself.
3. The message is pushed into the `InputQueue`, which is the prompt stream the SDK pulls from.
   The session stays open between messages, so the CLI and its MCP server keep running.
4. The CLI emits `system/init`. The **guard** checks it lists only our 6 tools, the datadesk
   server, no agents, `default` mode, our key and our workspace. Otherwise it aborts. Model
   output before this check also aborts.
5. The model streams text (`stream_event` → `text_delta` → the chat updates live), then asks for
   `mcp__datadesk__run_sql`. That tool is in `allowedTools`, so it runs without asking. The
   timeline shows the call, then the `tool_result` (from a `user` message), with timing.
6. If it asked for `register_dataset` instead, `canUseTool` would validate the input and ask the
   `ApprovalBroker`. You'd see a dialog, with Deny focused. Timeout, Stop, New conversation, or
   anything but "Allow" means deny.
7. The model answers. The `result` message gives cost and turns, the timeline shows
   `Turn complete · … · $0.0xx`, and the status returns to idle.

### Gotchas

- **`env` replaces the child's environment, but the child passes its env _on_.** We built the
  CLI's env carefully, and the key still reached datadesk-mcp through the CLI (D-014). Always
  check what the _grandchild_ receives.
- **An omitted `permissionMode` may mean `auto`** (a classifier decides). Set `'default'`
  explicitly if you want every non-allowlisted call to reach `canUseTool`.
- **`init.skills` lists bundled skills even with `skills: []`**, and typed `/commands` dispatch
  unless you pass `--disable-slash-commands`. A probe showed `/cost` running locally until we did.
- **The CLI re-sends `init` every turn** in streaming mode. Also, a turn can finish with no
  assistant message (e.g. a disabled command), so fall back to the result text.
- **A bad key means about 10 API retries (~minutes)** unless you set `CLAUDE_CODE_MAX_RETRIES`.
- **"New conversation" needs a boundary from the producer.** Clearing only in the UI lets
  in-flight events from the old session land in the new one. The fix is to mark the old session
  as ending _synchronously_, then emit `conversation_reset`.
- **Don't `await` a starting session in `reset()`.** It deadlocked in a test. Let the starter
  notice it was superseded instead.
- **`spawn` can't execute from inside `app.asar`.** Unpack the binary and point the SDK at it.
  The packaged app is 692 MB unpacked (the Claude binary alone is 234 MB).
- **TypeScript narrows object flags across `await`.** Read timer- or callback-mutated flags
  through a function.

### Experiments

1. **Your first real conversation** (needs your key, costs a few cents). Settings → paste your
   Anthropic key → Analyst: _Haiku_, budget $0.25. Add `test-data/public/sales.csv`, then ask
   "Which region sold the most units, and how many?". _Expect_ streamed text, then
   `datadesk · list_datasets` / `get_schema` / `run_sql` in the timeline with ✓, the answer
   **West** with a number, and a turn cost. Open a tool call to see the exact SQL it wrote.
2. **Watch the permission gate.** Ask "Please add the file C:\\…\\test-data\\public\\events.ndjson
   as a dataset" (full path). _Expect_ an approval dialog with the file path; **Deny** it and the
   analyst says it can't add it. Ask again and **Allow**: the dataset appears in the sidebar. Then
   type `/cost`. _Expect_ "/cost isn't available in this environment." (no Claude Code commands).
3. **Trip the guard on purpose.** In
   [agentOptions.ts](../src/main/agent/claude/agentOptions.ts), add a second server next to
   datadesk: `extra: { type: 'stdio', ...input.mcpServer },`, run `npm run dev` and ask anything
   (a dummy key is enough, since the guard runs before any model call). _Expect_ the timeline to
   show "Stopped for safety: … unexpected tools: mcp__extra__… ; unexpected MCP servers: extra".
   (Adding a built-in to `tools` wouldn't trip it: `disallowedTools` removes those first, which is
   the other layer working.) Revert afterwards.

## Phase 3: Runtime Agent Skills, charts and reports (2026-10-01)

### Concept

An **Agent Skill** is a folder with a `SKILL.md`: YAML frontmatter (`name`, `description`) plus
Markdown instructions. Only the frontmatter sits in the model's context up front. When a request
matches a description, the model calls the **`Skill` tool**, and the CLI injects the full body
for that turn. This is **progressive disclosure**: you pay for three short descriptions per
turn, not three pages of instructions. Compared with a system prompt, a skill is on-demand,
versioned as files, and reusable across agents (Phase 4's sub-agents will preload them).

A **plugin** is a package of skills (and optionally agents, hooks, MCP servers) with a
`.claude-plugin/plugin.json`. We ship ours inside the app and hand it to the SDK, so the
analyst's skills come only from us, never from disk discovery.

The second half of the phase is **artifacts**: tools that produce things for the _user_ (charts,
reports) rather than text for the _model_. The model gets back only an id. The UI renders the
real thing.

### Where it lives

- Skills: [eda-checklist](../resources/agent-plugin/skills/eda-checklist/SKILL.md),
  [chart-style](../resources/agent-plugin/skills/chart-style/SKILL.md),
  [report-format](../resources/agent-plugin/skills/report-format/SKILL.md) and the
  [plugin manifest](../resources/agent-plugin/.claude-plugin/plugin.json)
- Plugin options: [agentOptions.ts:98-104](../src/main/agent/claude/agentOptions.ts#L98)
  (`tools: ['Skill']`, `plugins`, `skills`, `settings`)
- Guard: [initGuard.ts](../src/main/agent/claude/initGuard.ts) (plugins, `plugin_errors`, our
  skills present)
- Slash-command neutralizer: [inputQueue.ts:9](../src/main/agent/claude/inputQueue.ts#L9)
- Spec sanitizer: [vegaSpec.ts:52](../src/shared/vegaSpec.ts#L52). Tools:
  [charts.ts:34](../src/mcp-server/charts.ts#L34) (`createChart`),
  [charts.ts:98](../src/mcp-server/charts.ts#L98) (`saveReport`)
- Artifact events: [sdkMapper.ts:27](../src/main/agent/claude/sdkMapper.ts#L27). IPC:
  [handlers/artifacts.ts](../src/main/ipc/handlers/artifacts.ts)
- Rendering: [vega.ts:24](../src/renderer/src/charts/vega.ts#L24) (CSP-safe embed),
  [ResultsPanel.tsx:31](../src/renderer/src/components/ResultsPanel.tsx#L31) (tab selection)
- Export: [reportExport.ts](../src/main/artifacts/reportExport.ts),
  [printPdf.ts:15](../src/main/artifacts/printPdf.ts#L15)

### How it works

1. **Startup:** the options pass `plugins: [{ type: 'local', path: <agent-plugin> }]`. The CLI
   loads it even with `settingSources: []` and lists `datadesk:eda-checklist` etc. in
   `init.skills`. `skills: [...]` is the allowlist the `Skill` tool accepts, and
   `disableSkillShellExecution` stops any `!command` in a skill body from running.
2. **The guard** additionally checks that the only non-builtin plugin is `datadesk` at exactly
   our path, that `plugin_errors` is empty, and that our three skills are listed.
3. You ask "do EDA on sales". The `eda-checklist` description matches, so the model calls
   `Skill({ skill: 'datadesk:eda-checklist' })`. The timeline shows `skill · eda-checklist`, and
   the body arrives as the tool result. The model follows it: `get_schema` → `profile_column` →
   `run_sql` …
4. To chart, it calls `create_chart({ title, sql, spec })`. datadesk-mcp:
   - sanitizes the spec (allowlisted keys; rejects `url`, `href`, `data`, `datasets`,
     `usermeta`, `loader` anywhere);
   - runs the SQL through the same read-only guard with a chart budget (5 000 rows / 5 MB);
   - inlines the rows as `data.values` and writes `artifacts/charts/<uuid>.json`.
     The model gets back `{ chartId, title, rowCount, truncated, fields }`, never the data.
5. Main's mapper remembers each `tool_use` id → name. When a successful `create_chart` result
   arrives, it emits an `artifact` event. The panel adds a tab and switches to it. The selection
   is _derived_ during render: "a newer artifact beats an older click".
6. `ChartView` loads the chart by uuid over IPC, re-sanitizes it, and renders with vega-embed in
   CSP mode:
   - `ast: true` + `vega-interpreter` (no `new Function`);
   - no actions menu;
   - no injected `<style>`;
   - a loader that refuses everything.
7. `save_report` stores Markdown with `[[chart:<uuid>]]` lines. `ReportView` splits on those
   lines: text goes to react-markdown (no raw HTML, no images), charts go to `ChartView`.
8. **Export:**
   - **MD:** main does it all from stored artifacts. It re-sanitizes each chart, renders it with
     a headless Vega `View` (no DOM needed), and writes `report.md` + `report-chart-N.svg`. The
     renderer sends only the report id.
   - **PDF:** the renderer renders a static copy with charts as `data:image/svg+xml` images.
     Main wraps it in a page with its own CSP and prints it from a never-shown window with
     JavaScript off and a request filter.

### Gotchas

- **`--disable-slash-commands` also disables skills.** We added it in Phase 2 to stop `/cost`.
  A probe showed that with it, the `Skill` tool and all skills vanish. Now slash commands stay
  on, and we neutralize them by prefixing a leading `/` with a space (another probe confirmed a
  leading space prevents dispatch).
- **Plugin skills are namespaced** (`datadesk:chart-style`). The `skills` allowlist and the guard
  must use the qualified names.
- **`usermeta.embedOptions` in a spec overrides your vega-embed options.** A model could re-enable
  the actions menu (which posts the data to an external editor) just by writing JSON. The
  sanitizer rejects `usermeta`.
- **Vega's default build needs `unsafe-eval`, and vega-embed injects `<style>` elements.** Both
  die under our CSP (silently for styles), so we use `ast: true` + interpreter,
  `defaultStyle: false` and `tooltip.disableDefaultStyle`, and put the CSS in `styles.css`.
  The e2e test asserts zero CSP console messages and zero `<style>` elements.
- **An SVG inside `<img>` can't run script; inline `<svg>` can.** That's why the PDF embeds
  charts as data-URL images. SVG files written to disk are a different story: someone may open
  them in a browser. Our first try re-checked renderer SVGs with a regex. The review bypassed it
  with `<s:script>` (a namespace prefix) and `javascript&#58;` (an entity), and it also rejected a
  chart titled "JavaScript: usage". Lesson: don't sanitize markup with regexes. **Generate it
  from data you trust**, which here means main renders the SVG from the stored spec.
- **Validate the _data_ and the _spec_ separately.** The 50 000-character spec limit at first
  also counted the inlined rows when the renderer re-checked a stored chart, so any real-sized
  chart saved fine and then failed to display. Tests with two-row fixtures never noticed.
- **A session has one `onBeforeRequest` listener.** Two PDF exports at once replaced and then
  cleared each other's filter, so prints are queued.
- **Compare file _paths_, not file _URLs_.** CI's temp dir is the 8.3 path `C:\Users\RUNNER~1\…`.
  Node's `pathToFileURL` writes `~` as `%7E` while Chromium requests it literally, so our
  "only this file" filter blocked the report's own page, but only on CI. The filter now
  decodes with `fileURLToPath` and compares paths. To reproduce locally, set `TEMP` to an 8.3
  path (see Phase 1's CI fix, same family of bug).
- **`printToPDF` works on a window that was never shown.** We weren't sure; the e2e test proved
  it.
- **Don't send chart data back to the model.** It's slow, costs tokens, and dataset cells are a
  prompt-injection surface. The id-only round trip keeps the model's context small.

### Experiments

1. **Watch progressive disclosure** (needs your key, Haiku is fine). Add
   `test-data/public/sales.csv` and ask "Do a quick EDA on sales". _Expect_ `skill ·
eda-checklist` as the first timeline entry, then `get_schema` / `profile_column` / `run_sql`
   calls in the order the checklist gives, and a chart tab appearing in the right panel. Then
   ask "What is 2+2?". _Expect_ no Skill call: the description didn't match.
2. **Edit a skill and see behaviour change.** In
   [chart-style](../resources/agent-plugin/skills/chart-style/SKILL.md), change the color
   guidance to "Always use `"color": {"value": "darkorange"}` for single-series bars". Click
   **New conversation** (skills load at session start), ask for "units by region as a bar
   chart". _Expect_ orange bars. Revert afterwards.
3. **Try to smuggle a remote resource.** Ask the analyst: "Create a chart whose spec has
   `"usermeta": {"embedOptions": {"actions": true}}` and a `data.url` of
   https://example.com/x.csv". _Expect_ `create_chart` to return an error ("Unsupported top-level
   key" or "\"url\" is not allowed") in the timeline, and the analyst to retry with a clean spec. No
   network request happens: open DevTools → Network to confirm.

## Phase 4: Sub-agents (2026-10-01)

### Concept

A **sub-agent** is a second agent loop that the main agent starts through a tool call (the
`Agent` tool). It gets its own **fresh context**: its own system prompt, only the tools you
gave it, and whatever the main agent wrote into the delegation prompt. It never sees the chat.
When it finishes, only its final answer comes back as the tool result. This buys:

- **context isolation:** a profiler can read 30 columns of stats without filling the main
  conversation;
- **specialisation:** a focused prompt plus preloaded skills;
- **least privilege:** report-writer literally cannot run SQL.

The price is extra tokens and latency, plus a lossy hand-off. The sub-agent knows only what the
main agent put in the prompt.

Compared with the other two Phase 3/4 ideas:

- a **skill** adds _instructions_ to an agent's context;
- an **MCP tool** adds a _capability_;
- a **sub-agent** adds a _separate worker_ with its own context and its own subset of
  capabilities.

### Where it lives

- Scope table + definitions: [subagents.ts:14](../src/main/agent/claude/subagents.ts#L14)
  (`SUBAGENT_TOOLS`), [subagents.ts:75](../src/main/agent/claude/subagents.ts#L75)
  (`buildSubagents`)
- Delegation check: [subagents.ts:98](../src/main/agent/claude/subagents.ts#L98)
  (`DelegationInput`), used in
  [claudeOrchestrator.ts:152](../src/main/agent/claude/claudeOrchestrator.ts#L152)
- Scope hook: [scopeHook.ts:10](../src/main/agent/claude/scopeHook.ts#L10)
- Options: [agentOptions.ts:111](../src/main/agent/claude/agentOptions.ts#L111) (`agents`,
  `hooks`, `forwardSubagentText`). Caps:
  [agentEnv.ts:45](../src/main/agent/claude/agentEnv.ts#L45)
- Guard: [initGuard.ts:43](../src/main/agent/claude/initGuard.ts#L43). Lanes:
  [TimelineDrawer.tsx:171](../src/renderer/src/components/TimelineDrawer.tsx#L171)

### How it works

1. **Startup:** the options pass `agents: { profiler, sql-analyst, report-writer }`, each with
   `tools` from the scope table, preloaded `skills`, `disallowedTools`, and a turn cap. The env
   turns off built-in agents, nesting, background runs and forks. The init guard checks the
   session lists exactly our three agents, and accepts the tool under its init name `Task`.
2. You ask "Analyze sales and write a short report". The main agent calls
   `Agent({ subagent_type: 'profiler', description, prompt })`. The **scope hook** sees it first.
   On the main thread, it denies the call unless it has exactly those three fields with one of
   our types, so a `model`, `run_in_background` or `isolation` field makes the model retry
   without it. If the CLI also asks **`canUseTool`** (unverified for this tool), that strips the
   input to the same three fields.
3. The CLI starts the profiler in a fresh context, with the EDA checklist preloaded. Each of
   its tool calls carries `agent_id`/`agent_type`, and the **scope hook** runs first: a
   `profile_column` from profiler passes, a `save_report` from profiler would be denied with a
   reason the sub-agent can read.
4. The profiler's messages stream with `parent_tool_use_id` = the `Agent` call's id. The mapper
   passes it through, the reducer attaches the calls and text to that call, and the timeline
   draws them as a nested **lane** (`agent · profiler · Profile sales`). The chat stays clean.
5. The profiler finishes. Its final message becomes the `Agent` tool result, which is all the
   main agent sees. The main agent then delegates questions to sql-analyst (which may
   `create_chart`), and finally hands every number and chartId to report-writer, which can only
   `save_report`.
6. Because background tasks are off, the turn ends only after the sub-agents finish, and the
   turn cost includes them.

### Gotchas

- **The tool has two names.** You request `Agent`, but `init.tools` lists `Task`. Tool calls
  may use either. Match both everywhere (guard, `canUseTool`, timeline).
- **Built-in agents are on by default.** `general-purpose` inherits _every_ tool and would sidestep
  the scope table entirely. `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` removes them; the probe
  showed five built-ins without it.
- **Sub-agents run in the background by default**, so a turn could "complete" while they still
  work, and nesting defaults to 3 levels. These are env vars, not `Options`, so they live in our
  explicitly built env.
- **`allowedTools` is inherited by sub-agents**, so `tools` (what each agent is given) and the hook
  (what it may run) carry the scoping. Our hook treats a call as main-thread only when both
  `agent_id` and `agent_type` are absent, so a CLI that drops one fails closed.
- **`canUseTool` is not a guaranteed gate.** It runs only when the CLI asks for a permission
  decision, and Claude Code lists the `Agent` tool as needing none. Hooks fire for every call,
  so anything that must always hold (the delegation shape) lives in the hook. The review caught
  this: our unit tests called `canUseTool` directly, so they passed either way.
- **The hand-off is the weak point.** report-writer can't check numbers, so its prompt says never
  to invent them, and the main prompt says to pass every number and chartId explicitly.
- **Cost:** every sub-agent re-reads its own system prompt and skills. For "what's the average
  of X?", delegating is slower and pricier than answering directly, and the prompt says so.

### Experiments

1. **Watch three lanes** (needs your key; Haiku, budget about $0.50). Add
   `test-data/public/sales.csv`, then ask "Analyze the sales dataset and write a short report
   with one chart". _Expect_ three lanes in the timeline, in order:
   - `agent · profiler` with `profile_column`/`run_sql` inside;
   - `agent · sql-analyst` with `run_sql` + `create_chart`;
   - `agent · report-writer` with only `save_report`.

   Then a chart tab and a report tab appear. Compare the turn cost with a direct question like
   "Which region sold the most units?" (no lanes).

2. **See the scope hook deny.** In [subagents.ts](../src/main/agent/claude/subagents.ts), add
   `tool('run_sql')` to report-writer's `tools` _only in `buildSubagents`_ (not in
   `SUBAGENT_TOOLS`), so the gates disagree. `npm run dev`, and ask for a report that "double-checks
   one number with SQL first". _Expect_ a ✗ `datadesk · run_sql` inside the report-writer lane
   with "report-writer may not use mcp__datadesk__run_sql". The SDK granted it, and the hook
   still refused. Revert afterwards.
3. **Trip the guard with a built-in.** In
   [agentEnv.ts](../src/main/agent/claude/agentEnv.ts), comment out
   `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS`, run `npm run dev`, and send anything (a dummy key
   is enough). _Expect_ "Stopped for safety: … unexpected agents: claude, Explore,
   general-purpose, Plan, statusline-setup" before any model call. Revert afterwards.

## Phase 5: OpenAI tools inside our MCP server (2026-10-01)

### Concept

An MCP server is just a process that offers tools. Nothing says a tool must be "local". This
phase puts two **OpenAI-backed** tools inside datadesk-mcp, so the Claude analyst uses another
vendor's models through the same protocol it uses for DuckDB. From the analyst's side,
`search_columns` and `run_sql` look identical. That's MCP's main promise: the client doesn't
care what is behind a tool.

Two model techniques come in:

- **Embeddings** turn text into vectors. Similar meaning gives nearby vectors, so "customer
  revenue" lands near `orders.amount_usd` even though no word matches. Ranking is cosine
  similarity, the angle between vectors.
- **LLM-as-critic** asks a second, independent model to review the first model's work. It is
  most useful on the steps where models fail silently: wrong denominators, missing filters,
  double counting.

### Where it lives

- Injectable client: [client.ts:10](../src/mcp-server/openai/client.ts#L10) (interface),
  [client.ts:121](../src/mcp-server/openai/client.ts#L121) (adapter over `openai`)
- Cache: [embeddingCache.ts:23](../src/mcp-server/openai/embeddingCache.ts#L23). Search:
  [searchColumns.ts:58](../src/mcp-server/openai/searchColumns.ts#L58) (what is sent),
  [searchColumns.ts:106](../src/mcp-server/openai/searchColumns.ts#L106)
- Critic: [secondOpinion.ts:47](../src/mcp-server/openai/secondOpinion.ts#L47). Registration:
  [server.ts:347](../src/mcp-server/server.ts#L347) (only with a key)
- Key route: [agentEnv.ts:79](../src/main/agent/claude/agentEnv.ts#L79)

### How it works

1. You save an OpenAI key in Settings. It goes into KeyStore (`safeStorage`) like the others.
   The change resets the session, because its tool set changes.
2. On the next message, main builds the agent CLI's env with `DATADESK_OPENAI_API_KEY`. The CLI
   spawns datadesk-mcp and passes its own env down (the D-014 behaviour, now used on purpose).
   The server keeps `DATADESK_*` through `scrubSecrets`, reads the key into config, deletes it
   from `process.env`, and registers the two tools. The options grant them, the guard expects
   them, profiler gets `search_columns`, and sql-analyst gets both.
3. **`search_columns({ query: 'customer revenue' })`:**
   - for each dataset, read the schema plus 20 rows, and build one line per column:
     `sales.unit_price (DOUBLE): e.g. 8.7, 12.5, 3.2`;
   - hash `model + dimensions + text` and look it up in the cache;
   - embed only the misses (plus the query) in one batched request, and save the cache;
   - rank columns by cosine similarity to the query and return the top N with scores.

   The second time you search, only the query is new.

4. **`second_opinion({ question, sql, answer })`:**
   - the server re-runs the SQL itself through the read-only guard, at most 50 rows;
   - it renders an 8 KB text preview and sends question, SQL, preview and draft answer to
     `gpt-5.4-mini` with a strict JSON schema (`responses.parse` + `zodTextFormat`);
   - it validates and clips the critique: verdict, summary, up to 8 issues, optional SQL.
5. The analyst reads the verdict like any tool result. It is advice, so the prompt says to
   check any suggested SQL itself.

### Gotchas

- **Command lines leak; environments leak less.** The SDK sends `mcpServers` to the CLI as
  `--mcp-config <JSON>` on the command line. A key in the server's `env` config would show in
  Task Manager and crash reports. It goes in the CLI env instead, which the CLI already passes
  on. Read the SDK's spawn code before deciding where a secret goes.
- **Re-run, don't trust.** If `second_opinion` took the result as model input, the critic would
  review whatever the analyst claimed. Re-running the SQL makes the critique about the data,
  and it also caps exactly what leaves the machine.
- **Strict structured outputs want every key required.** Express optional values as
  `.nullable()`. Bounds are enforced after parsing (clip, don't reject), so a slightly long
  summary doesn't waste a paid call.
- **Cache keys must include everything that changes the vector**: model, dimensions and exact
  text. A cache keyed only on column name would serve stale vectors after the data changed.
- **Check the vendor's defaults, not just your inputs.** The Responses API _stores_ requests for
  30+ days unless you pass `store: false`. Our first version leaked every critique's real result
  rows into the user's OpenAI account history, and the review caught it. The same goes for
  cost: clipping the critique text afterwards doesn't un-bill the reasoning tokens, so
  `max_output_tokens` caps them at the source.
- **A cache must never change results.** The first version read vectors back from the cache
  after inserting new ones. With a full cache, inserts evicted the current search's own hits, and
  those columns silently scored 0. Ranking now uses a local map of this search's vectors.
- **`[].some()` skips holes.** `new Array(n)` plus `.some(v => !v)` never sees the missing slots,
  so the "incomplete response" check could never fire. Iterate by index.
- **The key is the opt-in, so say what it opts into.** Settings, tool descriptions and
  `openWorldHint` all say data goes to OpenAI.
- **Testing a vendor SDK without a network:** fake the _interface_ for tool tests, and run the
  _real SDK_ over an injected `fetch` for adapter tests. That catches request-shape mistakes
  without a single real call.

### Experiments

1. **Semantic search vs. names** (needs both keys; costs a fraction of a cent). Add
   `sales.csv` and `events.ndjson`, then ask "Which column tells me how much money each order
   made?". _Expect_ `datadesk · search_columns` in the timeline, with `unit_price`/`units` near
   the top. Ask again with a different wording. _Expect_ `newlyEmbedded: 1` in the result: only
   the new query was embedded, and the cache file `%APPDATA%\DataDesk\cache\embeddings.json`
   didn't grow by more than one entry.
2. **Catch a wrong answer.** Ask "What's the total revenue by region? Get a second opinion
   before answering." The analyst may sum `units`. _Expect_ a `second_opinion` call whose
   verdict flags that units are not revenue, followed by a corrected query using
   `units * unit_price * (1 - discount)`.
3. **Remove the key.** Clear the OpenAI key in Settings. _Expect_ a "New conversation (key
   changed)" line, and the next session's timeline header showing "10 tools" instead of "12 tools" (Task and Skill plus 8 datadesk tools, versus 10). Check with `npm run smoke:packaged -- --agent --openai` vs. without `--openai`.

## Phase 6: Hugging Face: a remote MCP server, human approval, untrusted content (2026-10-01)

### Concept

Until now every tool the analyst used ran on this machine. Phase 6 adds a **remote MCP server**:
Hugging Face hosts one at `https://huggingface.co/mcp`, and the Claude Code CLI talks to it over
streamable HTTP with your token as a bearer header. To the model, `mcp__hf__hub_repo_search` looks
just like `mcp__datadesk__run_sql`. What changes is everything around it:

- **Auth to someone else's server:** a token has to travel with every request without leaking
  (command lines, logs, error messages, other hosts).
- **You don't control its tool list:** HF decides what tools exist, and a signed-in account gets
  write, compute and Gradio tools by default. So the tool set is _discovered at runtime_ and cut
  down to an allowlist.
- **Human in the loop:** downloading data from the internet into the app is the user's call. The
  analyst asks, a dialog shows exactly what will happen, and only an explicit "allow" proceeds.
- **Prompt-injection surfaces:** dataset cards and READMEs are written by strangers and land in
  the model's context. Anything they say is data, never instructions. The design keeps that text
  away from the user's own rows and away from any tool that can act.

### Where it lives

- Server config with the token placeholder: [agentOptions.ts:159](../src/main/agent/claude/agentOptions.ts#L159)
  (`alwaysLoad` at [:161](../src/main/agent/claude/agentOptions.ts#L161)); the token in the CLI
  env: [agentEnv.ts:87](../src/main/agent/claude/agentEnv.ts#L87)
- Allowlist and `hf_fs` verbs: [hfTools.ts:27](../src/main/agent/claude/hfTools.ts#L27),
  [hfTools.ts:37](../src/main/agent/claude/hfTools.ts#L37), [hfTools.ts:54](../src/main/agent/claude/hfTools.ts#L54)
- Discovery before a session: [toolDiscovery.ts:20](../src/main/mcp/toolDiscovery.ts#L20),
  used at [agentRuntime.ts:67](../src/main/agent/agentRuntime.ts#L67)
- Guard: [initGuard.ts:49](../src/main/agent/claude/initGuard.ts#L49). Scope hook (Hub tools only
  in dataset-scout): [scopeHook.ts:30](../src/main/agent/claude/scopeHook.ts#L30)
- Approval: [claudeOrchestrator.ts:118](../src/main/agent/claude/claudeOrchestrator.ts#L118),
  shared input schema [hf.ts:79](../src/shared/hf.ts#L79)
- Download: [loadHfDataset.ts:129](../src/mcp-server/hf/loadHfDataset.ts#L129) (redirects),
  [loadHfDataset.ts:164](../src/mcp-server/hf/loadHfDataset.ts#L164) (capped save),
  [loadHfDataset.ts:65](../src/mcp-server/hf/loadHfDataset.ts#L65) (local path); registration
  exception [fileAccess.ts:119](../src/mcp-server/fileAccess.ts#L119)
- Scout: [subagents.ts:35](../src/main/agent/claude/subagents.ts#L35); skill
  [evaluating-datasets/SKILL.md](../resources/agent-plugin/skills/evaluating-datasets/SKILL.md)

### How it works

"Find me public data on Iris flowers and tell me the average sepal length per species":

1. You saved an HF token in Settings, which reset the conversation. On your message, main reads
   the token and **lists the HF server's tools itself** (MCP client, bearer header, no OAuth). It
   gets `hf_whoami, hub_repo_search, hub_repo_details, hf_fs, create_repo, …`.
2. Main builds the session: the `hf` server with `Authorization: Bearer ${DATADESK_HF_TOKEN}`
   (literally that text; the CLI expands it from its env), `disallowedTools` with
   `mcp__hf__hf_whoami`, `mcp__hf__create_repo`, …, and the `dataset-scout` sub-agent. The token
   goes in the CLI's env only.
3. The CLI connects to HF before init (`alwaysLoad`), so the init message lists the three HF tools.
   The guard checks there is nothing else.
4. The analyst can't search the Hub itself (the hook denies it on the main thread), so it delegates
   to `dataset-scout` with the question. The scout preloads the evaluating-datasets checklist,
   runs `hub_repo_search`, `hub_repo_details` and `hf_fs ls` (the hook checks the verb), and
   returns `scikit-learn/iris, file Iris.csv, 5.1 KB, CC0`.
5. The analyst calls `load_hf_dataset({repo_id: 'scikit-learn/iris', path: 'Iris.csv'})`. It isn't
   auto-approved, so the CLI asks `canUseTool`. Main validates the input strictly and shows the
   dialog: dataset, URL, file, revision, the name `hf_iris`, the 500 MB limit.
6. You click Allow. datadesk-mcp requests `…/resolve/main/Iris.csv` with the token, gets a
   relative 307 to `/api/resolve-cache/…`, follows it by hand, and streams the body into a `.part`
   file under `userData/datasets/hf/scikit-learn/iris/main-<hash>/`, counting bytes. It renames
   the file and registers it with the one-off `allowDirs` exception.
7. The analyst runs `SELECT Species, avg(SepalLengthCm) FROM hf_iris GROUP BY 1` as usual.

### Gotchas

- **`${VAR}` in MCP headers works through the SDK, but only a probe says so.** The docs promise
  env expansion for `.mcp.json`. A fake local MCP server that printed the `Authorization` header
  showed it also works for the SDK's `mcpServers` (which reach the CLI as `--mcp-config`). It is
  observed behaviour, so a test pins the config shape and D-019 records what happens if it
  changes.
- **The per-server `tools` policy filters nothing; `disallowedTools` does.** The obvious knob was
  a no-op in the probe. Verify filters by reading `init.tools`, not the option's name.
- **A rejected header doesn't start OAuth.** With an explicit `Authorization`, a 401 marks the
  server `failed` and no browser opens. Don't add `?login` to the URL.
- **Tool lists are per account.** Anonymous `tools/list` showed 4 tools; HF's source says a
  signed-in default adds write, compute and Gradio tools. An allowlist from an anonymous probe
  would have been wrong for real users. Hence discovery with the user's token.
- **Redirects are where tokens leak.** HF serves big files from a CDN on another host. Following
  redirects by hand lets us send the token to `huggingface.co` only, and only follow https HF
  hosts. Small files get a _relative_ redirect, which `new URL(location, base)` handles.
- **Headers lie; count bytes.** `Content-Length` can be absent (it was for Iris) or wrong. The cap
  is checked on `X-Linked-Size` and `Content-Length` first, then enforced on the actual stream.
- **A stalled read ignores your abort flag.** Checking `signal.aborted` between reads never
  fires while `reader.read()` hangs. Cancel the reader on abort, then re-check the signal before
  keeping the file, or a cancelled download looks complete. A test with a stalling body caught it.
- **Safe names collide.** Replacing odd characters with `_` plus case-insensitive NTFS mapped
  `a b.csv` and `a_b.csv` (or `Data/` and `data/`) to one file, so a new download could silently
  replace another dataset's data. A hash of the exact input fixed it (review finding).
- **What the user sees must be what runs.** The approval schema is strict (unknown keys are
  denied) and shared with the tool. Pull-request revisions are refused (anyone can write one),
  and bidi or control characters in a path are rejected because they could make the dialog lie.
- **Isolation is about contexts, not tools.** Giving the main analyst Hub search next to the
  user's rows would let local values slip into search words, and put Hub text where
  `second_opinion` and `save_report` live. The review moved Hub reading into `dataset-scout` only.

### Experiments

1. **See the placeholder, not the token.** With a token saved, start a conversation and open Task
   Manager → Details → `claude.exe` → add the "Command line" column. You should find
   `--mcp-config` with `Bearer ${DATADESK_HF_TOKEN}` in it, and not your `hf_…` token.
2. **Watch discovery fail closed.** In Settings, replace the token with `hf_wrong` and ask
   something. The chat should show "Hugging Face rejected your token…", the timeline's session
   event should list only the `datadesk` server, and the analyst should still answer from local
   data.
3. **Trip the cap.** Ask the analyst to load a Parquet file over 500 MB (e.g. one shard of
   `HuggingFaceFW/fineweb`) and approve it. Expect a "larger than the 500.0 MB download limit"
   error before any bytes are written, and nothing new under `%APPDATA%/DataDesk/datasets/hf`.

## Phase 7: A second agent SDK (OpenAI) and compare mode (2026-10-01)

### Concept

An "agent SDK" packages one idea: a loop that calls a model, runs the tools it asks for, feeds
the results back, and repeats until the model answers. Phase 7 runs the same analyst on a second
vendor's loop, the **OpenAI Agents SDK**, and shows the two side by side. Where the two SDKs
differ is the lesson:

|                     | Claude Agent SDK                              | OpenAI Agents SDK                                           |
| ------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Where the loop runs | a separate Claude Code process                | inside our main process                                     |
| Conversation memory | the CLI keeps it                              | we replay the history every turn                            |
| Sub-agents          | `agents` + the `Agent` tool                   | agents-as-tools (`agent.asTool()`)                          |
| Skills              | built in (plugin `SKILL.md`)                  | none: we serve the same files ourselves                     |
| Approvals           | `canUseTool` callback                         | interrupt + resume, which we replace with an inline `await` |
| Cost                | reported in USD                               | tokens only: we price them                                  |
| Tool lists          | the CLI connects MCP servers; we guard `init` | we build the tool list ourselves                            |

The trick that makes this cheap is the **provider seam** from Phase 2: the chat, timeline,
approval dialog and IPC only consume provider-neutral `AgentEvent`s. A second orchestrator has to
emit the same events, and a test proves it does by playing one scripted conversation through both.

### Where it lives

- The orchestrator: [openaiOrchestrator.ts:86](../src/main/agent/openai/openaiOrchestrator.ts#L86).
  Session start and the allowlist check are at [:156](../src/main/agent/openai/openaiOrchestrator.ts#L156)
  and [:168](../src/main/agent/openai/openaiOrchestrator.ts#L168), one turn is at
  [:191](../src/main/agent/openai/openaiOrchestrator.ts#L191), the run at
  [:318](../src/main/agent/openai/openaiOrchestrator.ts#L318), and the privacy settings at
  [:55](../src/main/agent/openai/openaiOrchestrator.ts#L55).
- The agent tree and our tool wrappers: [analystAgents.ts:233](../src/main/agent/openai/analystAgents.ts#L233)
  (agents-as-tools at [:246](../src/main/agent/openai/analystAgents.ts#L246)), the approval
  gate at [:152](../src/main/agent/openai/analystAgents.ts#L152), and the `Skill` tool at
  [:199](../src/main/agent/openai/analystAgents.ts#L199).
- Events: [openaiMapper.ts:38](../src/main/agent/openai/openaiMapper.ts#L38). The delegation is
  normalised at [:90](../src/main/agent/openai/openaiMapper.ts#L90).
- The session (datadesk-mcp over `MCPServerStdio`, the pinned client):
  [openaiSession.ts:59](../src/main/agent/openai/openaiSession.ts#L59) and
  [:38](../src/main/agent/openai/openaiSession.ts#L38). Prices are in
  [pricing.ts:31](../src/main/agent/openai/pricing.ts#L31).
- Shared with Claude: [approvalQuestions.ts:95](../src/main/agent/approvalQuestions.ts#L95) and
  the scope table [subagents.ts](../src/main/agent/claude/subagents.ts).
- Provider switch: [agent.ts:140](../src/shared/agent.ts#L140) and
  [agentRuntime.ts:211](../src/main/agent/agentRuntime.ts#L211).
- Compare mode: [compareRuntime.ts:20](../src/main/agent/compareRuntime.ts#L20),
  [CompareView.tsx:100](../src/renderer/src/components/CompareView.tsx#L100), and
  [laneSummary.ts:37](../src/renderer/src/compare/laneSummary.ts#L37).
- The cross-provider test: [sameConversation.test.ts:64](../tests/main/agent/sameConversation.test.ts#L64)
  with the script in [conversationFixture.ts:24](../tests/main/agent/conversationFixture.ts#L24).

### How it works

"Which region sold the most units?" with Provider: OpenAI, model gpt-5.4-mini:

1. `agent:send` reaches `agentRuntime.get()`. The settings say `openai` and the OpenAI key is
   set, so main creates an `OpenAIOrchestrator`. `send()` queues the turn.
2. The first turn starts a session. Main spawns datadesk-mcp through `MCPServerStdio`. Its env is
   `buildServerEnv(…, 'agent', 'openai')` plus `DATADESK_OPENAI_API_KEY`, and the SDK adds only an
   OS allowlist. Main lists the server's tools and checks that every expected one exists, then
   reads the three skills from `resources/agent-plugin`.
3. For this turn main builds the agent tree. The **analyst** gets `Skill`,
   `mcp__datadesk__list_datasets`, `…run_sql` and the other datadesk tools, and the tools
   **profiler**, **sql_analyst** and **report_writer**. Each of those runs a nested agent with only
   its scope-table row and its skill text in its instructions.
4. `Runner.run(analyst, [...history, user(question)], { stream: true, maxTurns, signal })` sends
   one Responses API request (`store: false`, tracing off). The model streams "Let me check…" and
   a `function_call` to `mcp__datadesk__run_sql`.
5. The SDK calls our wrapper's `invoke()`. It is not an approval tool, so it calls datadesk-mcp's
   `run_sql` over stdio and returns the text result. Errors are recorded by `callId`.
6. Every stream event goes through `openaiMapper`. The text delta becomes `text_delta`,
   `tool_called` becomes `tool_call`, `tool_output` becomes `tool_result`, and `response_done`
   adds `responseCostUsd(...)` to the session's cost and checks the spend cap.
7. The model answers "West sold the most units (512)". The run completes, `result.history`
   becomes the new history, and main emits `turn_complete` with cost and duration. The chat shows
   the same things it shows for Claude.
8. In **compare mode** the same question goes to two fresh lanes, a Claude runtime and an OpenAI
   runtime. Their events arrive on `compare:event`, and each lane runs through the chat's own
   reducer, so the two columns can't be measured differently.

### Gotchas

- **The SDK renames agent tools.** `sql-analyst` reaches the model as `sql_analyst`. Our first
  version named the tools after the agents and lost the delegation for every hyphenated name;
  the test that caught it was the one asserting the exact tool list. Now we name them ourselves
  and map them back.
- **`MCPServerStdio` has two clocks.** `clientSessionTimeoutSeconds` bounds start-up and tool
  listing, while `timeout` (default 60 s) bounds each tool call. Setting only the first one capped
  every tool call at 60 s and let a hung server block session start for 25 minutes. The reviewer
  found it by reading the SDK source; the option names suggest otherwise.
- **Usage from nested runs is merged.** A probe with fake models showed `result.state.usage`
  already includes the sub-agents' usage, and `onStream` sees their `response_done` too. We price
  each `response_done` once (from the analyst's stream or a sub-agent's), so nothing is counted
  twice.
- **"Interrupt and resume" vs "await".** The SDK's documented human-in-the-loop ends the run with
  `interruptions`, then resumes from a `RunState`. Awaiting `ApprovalBroker` inside the tool keeps
  one stream per turn and works the same inside sub-agents. The cost: approval isn't visible to
  the SDK's own tracing (which is off anyway).
- **Never await a starting session in `reset()`.** The Claude orchestrator already had this rule;
  the OpenAI one broke it at first, so settings, key changes and quit could hang until datadesk-mcp
  finished starting.
- **One provider swap, one reset marker.** The renderer adds the user's message before main
  answers. A second `conversation_reset` after that would wipe it, which is why the swap happens
  in `onSettingsChanged`, synchronously, and not on the next send.
- **A stopped OpenAI turn leaves no trace.** It is not added to the replayed history. On Claude,
  the CLI keeps the interrupted turn in its context.

### Experiments

1. **Run the fixture with a wrong mapping.** In `openaiMapper.ts`, report sub-agent calls under
   their raw name instead of `Agent`. Run `npx vitest run tests/main/agent/sameConversation.test.ts`.
   Expected: the cross-provider test fails on `call call_profile: Agent profiler`. That diff is
   what "provider-neutral" means in practice.
2. **Watch the price table work.** In compare mode (both keys), ask "How many rows does sales
   have?". Expected: both lanes show a cost; the OpenAI one is tokens × our price table
   (gpt-5.4-mini: $0.75 in / $4.50 out per million). Then switch the OpenAI model to gpt-5.5 and
   ask again: about 6.7× the mini cost for a similar number of tokens. Compare "Turn (SDK)" with
   "Time to answer": the gap is the session start (the Claude CLI process, or spawning datadesk-mcp).
3. **See what reaches the child.** With Provider: OpenAI, start a conversation and run
   `Get-CimInstance Win32_Process | Where-Object CommandLine -like '*mcp-server.js*' | Select-Object CommandLine`.
   Expected: the datadesk-mcp command line has no key in it; the key lives only in that process's
   environment (D-021).

## Phase 8: Packaging: asar, native code, and shipping an agent runtime (2026-10-01)

### Concept

An Electron app is shipped as a folder: `DataDesk.exe` (a renamed Electron), plus `resources\`.
Your code goes in **`app.asar`**, a single read-only archive file. Electron patches Node's `fs`
so that `require` and `readFile` can look inside it, as if it were a folder. That works for
JavaScript. It does **not** work for:

- **Native code:** Windows' loader opens `.node` and `.exe` files from real disk paths. So
  DuckDB's binding and the 234 MB `claude.exe` must be **unpacked** into `app.asar.unpacked\`.
- **Other programs:** the Claude Code CLI isn't Electron, so it can't see inside the archive.
  Anything it reads (our skills plugin) ships next to it as an **extra resource**.

The **installer** (NSIS) copies that folder to the user's machine, adds shortcuts and an entry in
Apps, and can remove it all again. Because this build is **unsigned**, Windows SmartScreen warns
on first run. The README explains that, rather than hiding it.

Shipping an _agent runtime_ adds one more consideration. The biggest file in the install is the
Claude binary the Agent SDK drives. That one is **signed by Anthropic**, and we must not re-sign or
modify it.

### Where it lives

- Builder config: [electron-builder.yml:21](../electron-builder.yml#L21) (`asarUnpack`),
  [:24](../electron-builder.yml#L24) (`extraResources`), [:42](../electron-builder.yml#L42)
  (NSIS options); custom install/uninstall hooks [installer.nsh:8](../build/installer.nsh#L8).
- Paths at runtime: [resourcePaths.ts:23](../src/main/resourcePaths.ts#L23) (plugin and
  extensions from `resources\`), [executable.ts:9](../src/main/agent/claude/executable.ts#L9)
  (`claude.exe` in `app.asar.unpacked`), and [paths.ts:12](../src/main/paths.ts#L12) (`mainDir`,
  which is inside app.asar when packaged).
- Readable failures: [resourcePaths.ts:44](../src/main/resourcePaths.ts#L44), checked before
  each session at [agentRuntime.ts:84](../src/main/agent/agentRuntime.ts#L84) (OpenAI) and
  [agentRuntime.ts:114](../src/main/agent/agentRuntime.ts#L114) (Claude).
- The real-installer smoke: [smoke-packaged.mjs:86](../scripts/smoke-packaged.mjs#L86) (install),
  [:114](../scripts/smoke-packaged.mjs#L114) (uninstall), [:317](../scripts/smoke-packaged.mjs#L317)
  (the flow).
- Icon source: [make-icon.mjs](../scripts/make-icon.mjs).

### How it works

What happens between double-clicking the installer and the first answer:

1. `npm run package` runs `electron-vite build` (main, preload, renderer and `mcp-server.js` into
   `out/`), then electron-builder:
   - It packs `out/` plus the runtime `dependencies` into `app.asar`. React and friends are
     already in the renderer bundle, so they're devDependencies and stay out.
   - It moves `@duckdb/**` and `claude-agent-sdk-win32-x64/**` into `app.asar.unpacked`, copies
     `agent-plugin` and `duckdb-extensions` into `resources\`, and wraps it all in an NSIS
     installer.
2. The user runs `DataDesk-Setup-0.0.1-x64.exe`. It is a per-user install, so there is no admin
   prompt; it goes to `%LOCALAPPDATA%\Programs\DataDesk`. Our `customInstall` hook deletes the
   copy of the installer that electron-builder leaves in `%LOCALAPPDATA%\datadesk-updater`.
3. The user starts DataDesk. `serverPaths()` sees `app.isPackaged` and resolves the plugin and
   the extensions under `process.resourcesPath`. `mainDir` stays inside `resources\app.asar\out\main`.
4. The sidebar's datadesk-mcp is started as `DataDesk.exe resources\app.asar\out\main\mcp-server.js`
   with `ELECTRON_RUN_AS_NODE=1`. In Node mode, Electron still reads from the asar archive.
   DuckDB's `require` of its `.node` file is redirected by Electron to the `app.asar.unpacked`
   copy.
5. The user saves an Anthropic key and asks a question. Main computes
   `…\app.asar.unpacked\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe`, checks
   it and the plugin manifest exist, and passes it as `pathToClaudeCodeExecutable`. The CLI loads
   the plugin from `resources\agent-plugin`, a real folder it can read.
6. Uninstall removes the program, the shortcuts, the Apps entry and (our `customUnInstall` hook)
   the updater folder. `%APPDATA%\DataDesk` (keys, settings, catalog, artifacts) stays until the
   user deletes it.

### Gotchas

- **The roadmap said to unpack the MCP bundle, but that wasn't needed.** An asar is only opaque
  to _non-Electron_ processes. datadesk-mcp runs under Electron in Node mode, so it reads its
  own bundle from the archive. Only the files the Claude CLI touches (`claude.exe` itself, the
  plugin) must be real files.
- **electron-builder keeps a 215 MB copy of your installer.** It does this for
  `electron-updater`, there is no option to turn it off, and the uninstaller never deletes it. The
  code review found it by reading the NSIS templates, after the smoke had already left one behind
  on this machine. It is fixed with the two NSIS hooks.
- **"signing with signtool.exe" in the build log doesn't mean anything was signed.** Without a
  certificate the exe stays unsigned (`Get-AuthenticodeSignature`). `claude.exe` keeps Anthropic's
  signature. If a certificate is ever added, make sure electron-builder doesn't re-sign that
  binary.
- **NSIS's `/D=` must be the last argument and must not be quoted, even with spaces.** Node
  quotes arguments that contain spaces, so the smoke passes them with
  `windowsVerbatimArguments`. A first version went through `cmd.exe`, where `&` or `%` in a path
  would have been interpreted.
- **A per-user uninstaller returns before it has finished.** It copies itself to TEMP and
  continues there, so the smoke polls until the files, shortcuts and registry entry are gone.
- **The installer replaces an existing install with the same app id.** That's why the smoke
  refuses to run on a machine where DataDesk is really installed.

### Experiments

1. **Look inside the archive.** After `npm run package:dir`, run
   `npx @electron/asar list release/win-unpacked/resources/app.asar | Select-String -SimpleMatch '\node_modules\react\'`.
   Expected: no output, because React is only inside `out/renderer` (the listing uses
   backslashes). The same command with `'\node_modules\vega-lite\'` does print files, because main
   renders charts for PDF export. Then compare
   `release/win-unpacked/resources/app.asar.unpacked/node_modules` with what's listed: only DuckDB
   and the Claude binary are there as real files.
2. **Break the runtime on purpose.** In `release/win-unpacked`, rename
   `resources\app.asar.unpacked\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe`,
   start `DataDesk.exe`, save any Anthropic key and send a message. Expected: "DataDesk's Claude
   runtime is missing (…). It may have been quarantined by antivirus software; reinstall
   DataDesk." No spawn error appears. Rename it back afterwards.
3. **Watch an install from the outside.** Run `npm run package`, then
   `npm run smoke:packaged -- --installer --agent`. While it runs, open
   `%TEMP%\datadesk-install-*\Data Desk` and Windows' Apps list. Expected: the folder (with a
   space in its name) and a "DataDesk" entry appear, then both disappear, and the last line reads
   "uninstaller removed app, shortcuts, uninstall entry and cache".

## Phase 9: UI polish: design tokens, frameless windows, safe markdown, split panes (2026-10-02)

### Concept

Four ideas carry this phase.

- **Design tokens.** Components never name a colour. They name a _role_ (`bg-canvas`,
  `text-muted`, `border-line`), and each theme is just a set of values for those roles on
  `<html data-theme="…">`. Switching theme changes a few CSS variables. No component
  re-renders, and no CSS is rebuilt. The same idea reaches outside CSS: main paints the window
  background and the native window buttons, and Vega draws charts, all from copies of the same
  values, kept equal by a test.
- **Frameless windows.** With `titleBarStyle: 'hidden'` the page draws the title bar itself,
  while Windows still draws minimize, maximize and close (`titleBarOverlay`). The menu bar is
  gone, so main now handles the few shortcuts it used to give us.
- **Safe markdown.** The analyst's answer is text written by a model that has read your data,
  so it is _untrusted input_. Rendering it as markdown is safe only if it can't become HTML,
  can't load anything, and can't navigate anywhere. react-markdown builds React elements from a
  syntax tree and never uses `innerHTML`. We leave raw HTML disabled, unwrap links, and turn
  images into their alt text.
- **Accessible split panes.** A draggable divider is a real control: a `role="separator"` with
  a value, a min and a max, and arrow keys. It isn't just a decorative line that happens to
  react to the mouse.

### Where it lives

- Tokens: [styles.css:9](../src/renderer/src/styles.css#L9) (`@theme inline` maps roles to
  variables), [styles.css:68](../src/renderer/src/styles.css#L68) (one theme's values); the
  appearance setting [appearance.ts:13](../src/shared/appearance.ts#L13), stored in main by
  [appearanceStore.ts:15](../src/main/settings/appearanceStore.ts#L15), applied by
  [AppearanceProvider.tsx:44](../src/renderer/src/appearance/AppearanceProvider.tsx#L44).
- Title bar: [window.ts:43](../src/main/window.ts#L43) (hidden title bar + overlay),
  [window.ts:62](../src/main/window.ts#L62) (shortcuts in `before-input-event`, decided by
  [shortcuts.ts:18](../src/main/shortcuts.ts#L18)), [window.ts:78](../src/main/window.ts#L78)
  (repainting the native buttons on a theme change), [index.ts:80](../src/main/index.ts#L80) (no
  menu).
- Markdown: [ChatMarkdown.tsx:27](../src/renderer/src/components/ChatMarkdown.tsx#L27)
  (languages), [:40](../src/renderer/src/components/ChatMarkdown.tsx#L40) (the `[[chart:id]]`
  plugin), [:107](../src/renderer/src/components/ChatMarkdown.tsx#L107) (code block + copy),
  [:173](../src/renderer/src/components/ChatMarkdown.tsx#L173) (links unwrapped); the write-only
  clipboard [contract.ts:152](../src/shared/ipc/contract.ts#L152) and
  [clipboard.ts:8](../src/main/ipc/handlers/clipboard.ts#L8).
- Chat and steps: [agentState.ts:116](../src/renderer/src/agent/agentState.ts#L116) (a user
  message starts a turn), [agentState.ts:188](../src/renderer/src/agent/agentState.ts#L188) (a
  tool call remembers its turn), [ChatPanel.tsx:31](../src/renderer/src/components/ChatPanel.tsx#L31),
  [TurnSteps.tsx:11](../src/renderer/src/components/TurnSteps.tsx#L11).
- Panels and layouts: [Splitter.tsx:26](../src/renderer/src/layout/Splitter.tsx#L26),
  [panelSizes.ts:49](../src/renderer/src/layout/panelSizes.ts#L49) (validated read),
  [panelSizes.ts:66](../src/renderer/src/layout/panelSizes.ts#L66),
  [App.tsx:105](../src/renderer/src/App.tsx#L105) (the two arrangements),
  [ResultsFocus.tsx:8](../src/renderer/src/results/ResultsFocus.tsx#L8) and
  [ResultsPanel.tsx:69](../src/renderer/src/components/ResultsPanel.tsx#L69) (a chip brings its
  chart forward).
- Charts: [chartTheme.ts:22](../src/shared/chartTheme.ts#L22) and
  [:64](../src/shared/chartTheme.ts#L64),
  [interactive.ts:22](../src/renderer/src/charts/interactive.ts#L22) (fill width) and
  [:34](../src/renderer/src/charts/interactive.ts#L34) (zoom, legend),
  [vega.ts:38](../src/renderer/src/charts/vega.ts#L38),
  [ChartView.tsx:68](../src/renderer/src/components/ChartView.tsx#L68) (ResizeObserver) and
  [:77](../src/renderer/src/components/ChartView.tsx#L77) (save), the export channel
  [contract.ts:130](../src/shared/ipc/contract.ts#L130) and handler
  [artifacts.ts:50](../src/main/ipc/handlers/artifacts.ts#L50), main's themed SVG
  [chartSvg.ts:26](../src/main/artifacts/chartSvg.ts#L26).
- Packaged check: [smoke-packaged.mjs:149](../scripts/smoke-packaged.mjs#L149).

### How it works

One question in the Results-first layout, from Enter to a saved PNG:

1. You type "Units by day per region?" and press Enter. `ChatPanel` sends it, and the reducer
   adds your message and sets `turnId` to its id.
2. The analyst calls `run_sql`, then `create_chart`. Each `tool_call` event lands in the timeline
   with `turnId` set. Under your question, `TurnSteps` folds them into "● Working ·
   datadesk · create_chart…".
3. The `artifact` event adds the chart. `ResultsPanel` sees a newer artifact and switches to its
   tab. `ChartView` loads the stored spec, re-sanitizes it, then:
   - `fillWidth` adds `width: "container"`, and `addInteractivity` adds a zoom param (x is
     temporal) and a legend param (colour is nominal);
   - vega-embed renders it with `chartConfig(resolvedTheme)`, on the theme's canvas with the
     validated palette;
   - the ResizeObserver keeps it as wide as the panel, even while you drag a splitter.
4. Text deltas stream in. Each delta re-renders `ChatMarkdown`. An unclosed `sql` fence is
   already a code block, and highlight.js classes colour it with `--dd-hl-*` tokens.
5. The finished answer says `See [[chart:<id>]]`. The remark plugin turns that into a span. The
   `span` component shows it as a chip named after the chart. Clicking the chip calls
   `useResultsFocus()`, App bumps `focus`, and `ResultsPanel` selects the tab.
6. You click **Save PNG**. The view renders itself to a PNG at 2x. The renderer sends only the
   base64 to `artifacts:exportChart`:
   - zod checks the id and that the string is base64;
   - main decodes it, checks the 8-byte PNG signature, and opens a native save dialog;
   - main writes the file and answers `{ saved, path }`, which shows up under the chart.

### Gotchas

- **`navigator.clipboard` doesn't work here.** `hardenApp.ts` denies every permission check,
  clipboard writes included. Opening that permission would widen a deny-all, so copying goes
  through a one-method, write-only IPC channel instead (D-026).
- **Losing an image loses its words.** `unwrapDisallowed` keeps an element's _children_, but
  `<img>` has none, so the alt text vanished. Images now render as their alt text through a
  component, without ever creating an `<img>`.
- **`style` props are fine under `style-src 'self'`.** The CSP blocks style _attributes in
  markup_ and `<style>` elements. React and Vega write styles through the CSSOM
  (`el.style.width = …`), which the CSP allows. The splitter e2e test drags in the real app to
  prove it.
- **Container-width charts never grew.** `.vega-embed` was `inline-block`, so its width came
  from its content, and Vega measured that and stayed at 300 px. It also only re-measures on
  _window_ resize, and panels resize without one. The fix was `display: block` plus a
  ResizeObserver that sets Vega's `width` signal.
- **Zoom made bar charts blank.** Zoom needs `clip: true`, and the theme's rounded bar ends
  (`cornerRadiusEnd`) make Vega-Lite draw each bar inside a group with no width. Clipping that
  group clipped every bar to nothing, so you got axes and no bars. Tests missed it twice: unit
  tests only looked at the spec, and the e2e test counted bar `<path>`s, which still exist when
  clipped. Zoom is now limited to lines, areas and points. The e2e test hit-tests each bar's
  centre with `elementFromPoint`, which respects `clip-path`.
- **Vega line opacity is the `opacity` attribute**, not `stroke-opacity`. The e2e legend check
  first looked at the wrong one. Also, legend symbols are covered by a transparent hit area, so
  the test clicks the label's coordinates the way a user would.
- **A CSP test that only ever sees silence proves nothing.** Before trusting "zero violations",
  a throwaway probe injected a `<style>` element to check the console listener really catches
  one.
- **The installer smoke refuses to run where DataDesk is really installed**, as it should. This
  phase ran the unpacked-build smoke instead.

### Experiments

1. **Add a theme.** Copy the `[data-theme='slate']` block in `styles.css` as
   `[data-theme='paper']` with warm greys, then add `paper` to `ThemeSchema`, `THEME_CHROME` and
   `CHART_INK`. _Expect:_ `npm run check` fails until every token is defined and the tooling test
   finds main's and the charts' colours equal to the stylesheet. Then the whole app (title bar
   buttons, code highlighting, charts) switches with one click.
2. **Try to break the markdown renderer.** With the dev app running, emit an `assistant_message`
   containing `<img src=x onerror=alert(1)>`, `[click](javascript:alert(1))` and
   `![x](https://example.com/p.png)`. _Expect:_ the tag shows as literal text, the link is plain
   text, the image is the word "x", and DevTools' Network tab shows no request.
3. **Drive a splitter with the keyboard only.** Tab to the line between the results and the
   chat, then press ←, Home and End, and restart the app. _Expect:_ the chat grows by 24 px per
   press and jumps to 300 px and 960 px. The chart re-fits as you go, a screen reader announces
   the size, and the size survives the restart for that layout only.
