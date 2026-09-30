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
