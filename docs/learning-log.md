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
