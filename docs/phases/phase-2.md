# Phase 2: Agent runtime, chat and timeline

**Branch:** `phase-2-agent-runtime` (based on `fix/ci-short-temp-paths`) · **Date:** 2026-10-01 ·
**Status:** ready for review. Needs one manual run with your Anthropic key.

## What was built

- **Provider seam:** the `Orchestrator` interface plus a provider-neutral `AgentEvent` zod union.
  The chat and timeline never see SDK types, so Phase 7's OpenAI provider is additive.
- **`ClaudeOrchestrator`** on `@anthropic-ai/claude-agent-sdk` 0.3.286:
  - One long-lived streaming-input session per conversation.
  - All capabilities live in one tested builder: nothing from disk, no built-in tools, only
    datadesk, explicit `permissionMode: 'default'`, 5 auto-approved read-only tools, slash
    commands disabled, budget and turn caps, and an explicit env (D-013).
- **Init guard:** aborts sessions with unexpected tools, servers, agents, mode, key source or
  cwd. It also fails closed on any output before verification.
- **Human approval:** `register_dataset` input is validated, then goes to the ApprovalBroker and
  a modal (Deny focused, Esc denies). Approvals are queued and scoped per session, and anything
  but Allow is a deny (D-010).
- **Secrets stay out of the MCP server:** blanked in the agent server config and scrubbed at
  server startup, found by review and confirmed by probe (D-014).
- **UI:**
  - The chat streams text, with Stop and New conversation.
  - The timeline shows the session, each tool call with input, result and timing, turn cost,
    approvals, and resets.
  - Settings adds model, budget and max steps.
  - Main emits `conversation_reset` boundaries, so the UI never mixes conversations.
- **Packaging spike:** `electron-builder --dir` plus `npm run smoke:packaged [-- --agent]`,
  11/11 checks on the packaged exe (below).
- **CI fix** (`1e5e769`, also its own PR): tests compare against the native `realpath`, so
  GitHub's `RUNNER~1` temp dir passes.

## Decisions

D-013 (embedding the Agent SDK: verified behaviors and choices) · D-014 (secrets must not reach
the agent's MCP server; second-hop env).

## How it was verified

- **Unit/integration: 355 passed.** Agent tests drive the orchestrator with a scripted fake
  `query()`; no API calls.
- **E2E: 22 passed.** These include the chat-without-key path and settings validation.
- **Packaged smoke: 11/11**, run on the rebuilt package after the review fixes:
  - isolated profile, `app://`, no Node in the renderer;
  - Parquet and Excel registered via the packaged MCP server;
  - the Claude binary spawned from `app.asar.unpacked`, seeing exactly the 6 datadesk tools,
    with datadesk connected;
  - the dummy key rejected readably.
- **Dummy-key probes (manual, not in CI):**
  - `tools: []` leaves exactly 6 tools;
  - `init.skills` lists bundled skills anyway;
  - `/cost` runs locally without `--disable-slash-commands`, and is refused with it;
  - the key reaches the MCP server without the fix, and doesn't with it;
  - the guard stops a session with an extra MCP server before any model call (learning-log
    experiment 3).

## Code review

The `code-reviewer` agent found **no capability escape**, and **no path for `register_dataset`
to run without a click on Allow**. It flagged **one blocker**: the API key reaching the agent's
MCP server through the CLI's env. Fixed in `d0a2192` and verified by probe.

Also fixed (`dbf4bbe`):

- New conversation could mix in old-session events.
- Settings or key resets left a stale transcript.
- A second approval overwrote the first.
- Long errors were dropped instead of truncated.
- The approval input was unvalidated.
- `stop()` could leave the UI busy.
- The guard failed open if `init` never arrived.
- The model setting could start with `-`.
- The approval dialog had no focus handling.

Not fixed, deliberately:

- **Commit subjects over 72 characters** (`a35ba57`, `1197de3`, `71ad7eb`) and the scopes
  `test`/`e2e`. Fixing them needs a history rewrite.

## Needs your manual check (real key, a few cents)

The "Done when" line asks for one real answer with `run_sql` visible in the timeline. I can't
run it without your key. Please follow **learning-log Phase 2, experiments 1–2**:

1. Settings → paste your Anthropic key → Analyst: Haiku, $0.25. Add
   `test-data/public/sales.csv`, then ask "Which region sold the most units?". You should see
   `run_sql` with ✓ in the timeline, and the answer **West**.
2. Ask it to add `events.ndjson` by full path, and try both Deny and Allow. Then type `/cost`.

Also unverified without a real key:

- whether `maxTurns` and `maxBudgetUsd` apply per turn or per session in streaming mode;
- whether `total_cost_usd` is cumulative.

The mapper assumes cumulative (the docs say so). If the costs in the timeline look off, tell me.

## Known gaps / carried forward

- **Installer size:** 692 MB unpacked, including the 234 MB Claude binary; `react` is shipped in
  `node_modules` although it's bundled. To trim in Phase 8.
- **Unsigned binaries** (signtool ran with no certificate); Phase 8.
- **The approval dialog can't yet warn** that a name collides with an existing dataset. It shows
  the name with "(replaces any dataset with this name)".
- **Network guard for child processes** (carried from Phase 0/1): still moved to Phase 5.

## How to try it

```bash
npm ci && npm run duckdb:extensions
npm run dev                                   # Settings → Anthropic key → ask a question
npm run package:dir && npm run smoke:packaged # packaged app, offline checks
```
