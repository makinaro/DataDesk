# CLAUDE.md: how we work on DataDesk

DataDesk is a local AI data analyst desktop app (Electron + TypeScript strict + React + Vite, npm).
The in-app analyst runs on the Claude Agent SDK in the main process and reaches data only through
MCP tools. This repo is also a learning project: **working software and the owner understanding it
matter equally.** Explain choices in PR descriptions and the learning log.

Doc map: [ROADMAP.md](ROADMAP.md) (what's next) · [DECISIONS.md](DECISIONS.md) (why) ·
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how it fits) · [docs/learning-log.md](docs/learning-log.md).

## Session start routine

1. Read this file, then `ROADMAP.md`. The current phase is the first phase with unchecked tasks.
2. Read the last ~3 entries of `DECISIONS.md` and the last learning-log entry.
3. Run `git status` and `git branch --show-current`. You should be on `phase-N-<slug>` for the
   current phase. If you're on `main` and the phase's work hasn't started, create the branch.
4. State the next task (from the ROADMAP) and your approach in 2–3 lines before writing code.
5. Load the `using-agent-skills` skill and route the task through it: it says which skill or
   agent applies (spec, planning, docs-researcher, add-* skills, reviewers) and the rules every
   session follows.

## One phase at a time

- Work only on the current phase. **Never start the next phase without the owner's go-ahead.**
- Per task: implement → tests → `npm run check` (must pass) → one conventional commit → tick the
  task's box in `ROADMAP.md` (in the same commit).
- At the end of the phase, run `/finish-phase`. It runs all checks and the `code-reviewer` agent,
  writes the learning-log entry and phase summary, pushes the branch, and gives the PR link. Then **STOP**.
  The owner reviews the PR, and merging it is the approval to continue.
- Never push to `main` directly after the initial commit. Never force-push.

## Commits

Conventional commits: `type(scope): summary` in the imperative, ≤72 chars.

- Types: `feat` `fix` `test` `docs` `refactor` `chore` `build` `ci` `perf`
- Scopes: `main` `preload` `ipc` `ui` `secrets` `mcp` `agent` `skills` `claude` `deps`
- Body: _why_, not what. End with the co-author trailer from the harness.

## Verify before use (fast-moving SDKs)

These change monthly: **Claude Agent SDK, MCP SDK, OpenAI SDK / Agents SDK, DuckDB node API,
Hugging Face MCP, electron-vite, electron-builder.** Before relying on any API signature, option
name or package name, use the `docs-researcher` agent (or read the installed `.d.ts`). Record the
verified version + source URL in `DECISIONS.md` whenever an API choice matters. Install with
`--save-exact`.

## DECISIONS.md

Append-only. Format:

```
## D-NNN: Title (YYYY-MM-DD)
**Context** … **Decision** … **Alternatives** … **Consequences** …
```

To reverse an earlier decision, add a new entry that references the old one. Don't rewrite history.

## Security rules (non-negotiable)

1. **API keys** (Anthropic, OpenAI, Hugging Face) live only in the main process, encrypted with
   Electron `safeStorage` (`src/main/secrets/keyStore.ts`). The renderer can _set_, _clear_, and
   check _status_ (boolean). **No IPC channel ever returns a key.** There is no plaintext fallback.
2. Every `BrowserWindow`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
   `webSecurity: true`, and the strict CSP from `src/main/security/csp.ts`. Navigation and new windows are denied.
3. **All IPC is typed with zod** in `src/shared/ipc/contract.ts`. Main validates every request
   _and_ response, and checks the sender frame. The preload exposes explicit methods only, never a
   generic `invoke`.
4. **The in-app agent** gets no Bash/Write/Edit/Read/Glob/Grep/Web tools. It gets only `Skill`,
   `Agent` and the MCP tools we grant. Its `cwd` is `userData/agent-workspace`, and it runs with
   `settingSources: []` and an isolated `CLAUDE_CONFIG_DIR`, so it never loads this repo's
   CLAUDE.md or dev skills.
5. Child-process environments are **built explicitly** (Windows needs `SystemRoot`, `PATH`, `TEMP`).
   Never spread all of `process.env` into a child, and never log secrets.
6. Never read `.env*` or `test-data/private/`.

## Testing rules

- Vitest for unit/integration and Playwright (`_electron`) for e2e smoke.
- **No real API calls in automated tests.** `tests/setup/no-network.ts` makes `fetch` throw.
  Mock the Agent SDK with fake `SDKMessage` async generators. Test MCP with `InMemoryTransport`.
  Test OpenAI and Hugging Face through injected client interfaces.
- DuckDB runs for real (it's local) against fixtures in `test-data/public/`.
- Tests live under `tests/` as `*.test.ts` / `*.test.tsx`, mirroring `src/` paths
  (e.g. `tests/main/secrets/keyStore.test.ts`). E2E specs live in `tests/e2e/*.spec.ts`.
- Every security rule above has at least one test that would fail if the rule were broken.

## Code conventions

- TypeScript strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`. No `any`. Use `unknown` and narrow.
- Derive types from zod (`z.infer`). Never hand-write a type that duplicates a schema.
- `src/shared/` must not import from `electron`, `node:*`, or React.
- Comments are sparse and explain _why_. Explanations for the owner go in PRs and the learning log.
- npm scripts: `dev` `build` `typecheck` `lint` `format` `test` `test:e2e` `check`.

## Learning log format

`docs/learning-log.md`, one entry per phase, written by `/finish-phase`:

```
## Phase N: Title (YYYY-MM-DD)
### Concept        (what the idea is, in plain words)
### Where it lives (file links, e.g. src/main/ipc/register.ts:12)
### How it works   (numbered flow of a real request through the code)
### Gotchas        (what bit us or will bite you)
### Experiments    (2–3 things to try, each with the expected observation)
```

## Dev tooling in `.claude/`

- Agents: `docs-researcher` (read-only + web, cited signatures), `code-reviewer` (read-only
  review of `main...HEAD` against this file), `test-writer` (may only edit test files).
- Skills: `using-agent-skills` (the router, start here), `spec-driven-development`,
  `planning-and-task-breakdown`, `/spec-designer`, `/add-ipc-channel`, `/add-mcp-tool`,
  `/finish-phase`. Agent: `plan-auditor` (blind review of `planning/`).
