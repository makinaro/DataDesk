# Phase 0: Setup and secure shell

**Branch:** `phase-0-setup` · **Date:** 2026-10-01 · **Status:** ready for review

## What was built

- **Repo operating manual:** [CLAUDE.md](../../CLAUDE.md), [ROADMAP.md](../../ROADMAP.md) (Phases
  0–8), [DECISIONS.md](../../DECISIONS.md) (D-001…D-008),
  [ARCHITECTURE.md](../ARCHITECTURE.md), [learning log](../learning-log.md).
- **Scaffold**, hand-written: Electron 44.5.1 · electron-vite 5.0.0 · Vite 7.3.6 · React 19.3 ·
  TypeScript 6.0.3 (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) · Tailwind 4.3.
  Main is ESM; the preload is bundled CJS for the sandbox.
- **Hardened window** ([src/main/window.ts](../../src/main/window.ts),
  [src/main/security/](../../src/main/security/)): contextIsolation, sandbox, no Node; the renderer
  is served from `app://datadesk/` with a strict CSP header; navigation, new windows, webviews and
  permission requests are denied; single-instance lock.
- **Typed IPC** ([src/shared/ipc/](../../src/shared/ipc/), [src/main/ipc/](../../src/main/ipc/),
  [src/preload/index.ts](../../src/preload/index.ts)): one zod contract, a router that checks the
  sender frame and validates request _and_ response, `IpcResult` envelopes, and a preload with
  explicit methods only (lint-enforced type-only contract imports).
- **Secrets** ([src/main/secrets/keyStore.ts](../../src/main/secrets/keyStore.ts)): safeStorage
  (DPAPI), atomic queued writes with transient-lock retry, no plaintext fallback, `getKey`
  main-only. The Settings dialog shows set/not-set only.
- **App shell** with placeholder dataset sidebar, chat, charts/report panel and timeline drawer.
- **Tests:** Vitest projects (node + jsdom) with a network guard; Playwright Electron e2e.
- **CI:** [.github/workflows/ci.yml](../../.github/workflows/ci.yml) runs check + e2e on
  windows-latest (Node 24, actions v7).
- **`.claude/`:** `settings.json` (allow npm scripts and git; ask on force-push/reset --hard/clean;
  deny reading the env files and private test data), agents `docs-researcher`, `code-reviewer`
  and `test-writer` (the last two restricted by frontmatter hooks), skills `/add-ipc-channel`,
  `/add-mcp-tool` and `/finish-phase`, and a project-wide `private-paths` hook.

## Decisions (see DECISIONS.md)

- D-001 version pins (TS 6 not 7; Vite 7 not 8) · D-002 in-memory DuckDB + catalog · D-003
  Electron-as-Node for datadesk-mcp · D-004 agent isolation · D-005 MCP SDK v1 · D-006 tests under
  `tests/` · **D-007 `app://` instead of `file://`** (the plan's header CSP wouldn't have applied to
  `file://`) · **D-008 hook-enforced dev-agent limits**.

## Deviations from the approved plan

- The renderer is served via `app://` (D-007). The plan assumed a header CSP on `file://`, which
  Electron can't do.
- Tests live under `tests/` instead of colocated, which makes the test-writer's write scope a
  single path rule (D-006).
- An extra `tsconfig.e2e.json` exists, because e2e specs need both DOM and Node types.

## Test results

- Unit/integration: **129 passed** (14 files: main, preload, shared, renderer, setup, tooling).
- E2E (Electron): **13 passed**. Hardened webPreferences, no Node globals, CSP header, CSP blocks
  injected inline script, 404s carry CSP, window.open/navigation denied, bridge shape whitelisted,
  `app:info` round-trip, key set/clear with booleans-only status and ciphertext-only on disk,
  malformed IPC rejected, Settings UI flow.
- Also checked manually: dev mode (Vite HMR connects under the dev CSP, no CSP violations, IPC
  works from the dev origin), and live hook blocking of a shell read of the env file.

## Code review

A reviewer ran with the `code-reviewer` instructions. The agent type wasn't loaded yet, so it was
a general-purpose stand-in. **Verdict: APPROVE, no blockers.** Fixed:

- Hook policy bypasses: newline chaining, `git --output/--ext-diff/--textconv`, test-writer
  `lint:fix`/`test:e2e`/`-u`, `<`/`,` prefixes, and a Grep-pattern false positive
  (`40a0a68`, with regression tests).
- KeyStore rename retry on EPERM/EACCES/EBUSY (`426767f`).
- Lint rule keeping zod out of the preload (`d1d47a5`).
- Startup `.catch` → quit, single-instance lock, test-only userData override, clean `app://`
  404s (`afe6851`).
- Settings dialog `busy` stuck on bridge rejection (`eadc858`).
- Network guard numeric-port hole.

Not fixed, deliberately:

- **Commit message nits:** two subjects exceed 72 chars (`706b05c`, `efbd1a5`) and `5919b72` uses
  scope `lint`. Fixing needs a history rewrite; not worth it.
- **Network guard doesn't cover `dns`/`dgram`, child processes, or the e2e run.** Phase 1's stdio
  MCP tests will spawn children, so extending the guard (e.g. `NODE_OPTIONS=--import` of the guard
  into children) is scheduled there.

## Known gaps and deferred items

- CI runs on `pull_request` and pushes to `main`, so it will first run when this PR opens. Its
  result wasn't observed locally. **Check it's green before merging.**
- The `app://` handler serves whatever is in `out/renderer`. Packaging (Phase 8) needs to confirm
  the asar path.
- No real app icon yet.

## How to try it

```bash
npm ci
npm run dev          # opens the app with HMR
npm run check        # typecheck + lint + format + unit tests
npm run test:e2e     # builds, then runs the Electron e2e suite
```

In the app: **Settings** → paste any 8+ character dummy key → **Save**. The badge flips to _Set_
and the input clears. Open DevTools and try the experiments in the
[learning log](../learning-log.md#experiments).
