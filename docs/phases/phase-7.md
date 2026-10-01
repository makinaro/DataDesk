# Phase 7: OpenAI Agents SDK provider and compare mode

**Branch:** `phase-7-openai-agents` · **Date:** 2026-10-01 · **Status:** ready for review. Needs one
manual run with your Anthropic and OpenAI keys.

## What was built

- **`OpenAIOrchestrator`** ([openaiOrchestrator.ts](../../src/main/agent/openai/openaiOrchestrator.ts)),
  built on `@openai/agents-core` / `@openai/agents-openai` 0.18.0. It implements the same
  `Orchestrator` seam and emits the same `AgentEvent`s as the Claude one.
  - **Same datadesk-mcp over stdio,** through the SDK's `MCPServerStdio`, with an explicit env.
    The OpenAI key goes in the child's env, never its command line
    ([openaiSession.ts](../../src/main/agent/openai/openaiSession.ts)).
  - **DataDesk builds the tool list itself** from the same allowlist
    ([analystAgents.ts](../../src/main/agent/openai/analystAgents.ts)). Tools keep neutral names
    (`mcp__datadesk__run_sql`), a missing tool fails the session, and a tool datadesk-mcp adds
    later never reaches the model.
  - **Agents-as-tools:** `profiler`, `sql_analyst` and `report_writer`, built from the shared scope
    table, prompts and preloaded skills. No nesting, and no sub-agent can register anything.
  - **Approvals** for `register_dataset` are awaited inline through `ApprovalBroker`, using the
    questions now shared by both providers
    ([approvalQuestions.ts](../../src/main/agent/approvalQuestions.ts)).
  - **Skills** are served from the same plugin files: the analyst gets a `Skill` tool, and the
    sub-agents get their skill text preloaded.
  - **Privacy:** `store: false`, with the history replayed locally (encrypted reasoning items
    included), tracing disabled, a pinned endpoint, and API errors mapped to key-free messages.
  - **Cost and limits:** a price table ([pricing.ts](../../src/main/agent/openai/pricing.ts))
    prices every model response, the analyst's and the sub-agents'. `maxBudgetUsd` and `maxTurns`
    work as on Claude.
  - **No Hugging Face on this provider** in Phase 7 (D-021).
- **Provider switch:** Settings → Analyst → Provider (Claude / GPT) and an OpenAI model list
  ([AnalystSettingsForm.tsx](../../src/renderer/src/components/AnalystSettingsForm.tsx)).
  - Settings saved before Phase 7 still load, as Claude.
  - The runtime swaps the orchestrator when you save
    ([agentRuntime.ts](../../src/main/agent/agentRuntime.ts)).
  - The OpenAI key's note now says that choosing OpenAI sends it the whole conversation.
- **Compare mode:** a header toggle swaps the chat for
  [CompareView](../../src/renderer/src/components/CompareView.tsx).
  - It asks both providers one question in fresh sessions and shows each answer, its tool calls
    (sub-agent calls indented), cost, time to answer and the SDK's turn time.
  - Main runs two "lanes" ([compareRuntime.ts](../../src/main/agent/compareRuntime.ts)). Each lane
    is a regular agent runtime pinned to one provider, with its own temp dir. Lanes decline
    approvals and run without HF.
  - New IPC: `compare:run`, `compare:stop` and `compare:reset`, plus the `compare:event` push
    channel.
- **Packaged smoke `--openai-agent`:** the packaged app runs the analyst on OpenAI with a dummy
  key. datadesk-mcp starts through `MCPServerStdio` from the package, the tool list is right, and
  the 401 becomes "OpenAI rejected the API key (401)".

## Decisions

- **D-021:** OpenAI Agents SDK provider. It covers the packages, why DataDesk wraps the tools
  instead of using `mcpServers` on agents, inline approvals instead of interrupt/resume,
  agents-as-tools instead of handoffs, skills served by DataDesk, no HF, privacy settings, the
  price table, and per-instance temp dirs.
- **D-022:** provider switch and compare mode. It covers the defaults that keep old settings
  valid, swapping on save, lanes, one-shot sessions, no approvals or HF in lanes, and requiring
  both keys.

The docs-researcher run was cut short by a usage limit, so the SDK facts come from the installed
`.d.ts` files, the SDK sources, and a no-network probe with scripted fake models. D-021 records
which is which.

## How it was verified

- **Done when, the automated half:** `tests/main/agent/sameConversation.test.ts` plays one scripted
  conversation through both orchestrators: a profiler delegation with a nested tool call, `run_sql`,
  `create_chart` with an artifact, and an answer. Both must produce identical normalised events.
- **Unit/integration: 701 passed** (627 before):
  - the OpenAI orchestrator against a scripted `Model` and an in-memory server: the tool list per
    agent, `store`/tracing on every request, history replay, `Skill`, cost, the spend cap
    (including a sub-agent's spend), `maxTurns`, approve/deny/strip/invalid, stop, reset during
    start-up, a failed turn followed by a working one, and stop during start-up;
  - the mapper, prices, skills, the approval gate per caller, the session env/args/timeouts, the
    endpoint pinning, error mapping (including duck-typed errors);
  - runtime provider switching, the compare runtime, the IPC contract, handlers and preload, and
    the Settings and Compare views.
- **E2E: 28 passed** (26 before), with the normal TEMP and the 8.3 short TEMP. New:
  - the OpenAI orchestrator drives the **real built datadesk-mcp** over `MCPServerStdio` with a
    scripted model;
  - compare mode without keys says it needs both.
- **Packaged smoke:** 7/7, `--agent` 14/14, `--agent --openai` 14/14, `--agent --hf` 16/16,
  `--openai-agent` 11/11.

## Code review

The `code-reviewer` agent found no security-rule violations and no blockers, and asked for
changes. Fixes are in `f781fce` and `2591091`.

- **Should fix (all fixed):**
  - `MCPServerStdio`'s per-call `timeout` was left at the 60 s default, and the start-up timeout
    was 25 minutes.
  - `reset()` waited for a session that was still starting.
  - A failure while preparing a turn could wedge every later message.
  - Compare-mode Stop did nothing while a lane was starting. Fixed on both orchestrators.
  - No test counted sub-agent spend against the cap.
  - No test covered the endpoint pinning.
- **Nits fixed:**
  - Errors are logged in their explained form.
  - Duck-typed API errors fail closed.
  - The provider swap is atomic.
  - No approval dialog opens for an aborted turn.
  - A direct test covers the per-caller gate.
  - Compare double-submit fixed.
  - Test files now mirror their source files.
  - Added a Claude-lane approval test and updated ARCHITECTURE.md.
- **Not changed:** the `as AnalystProvider` / `as OpenAIModel` casts in the settings form. Main
  validates with zod anyway, and parsing in the renderer would pull zod values into its bundle
  for a `<select>` whose options we define.

## Needs your manual check (Anthropic + OpenAI keys; a few cents)

1. Settings → OpenAI key, then Analyst → Provider: **GPT (OpenAI)**, model GPT-5.4 mini → Save.
   Ask "Which region sold the most units?" about a registered dataset. The timeline should show
   `datadesk · run_sql` and the chat should show the answer.
2. Ask a follow-up ("And the least?"). This checks that the replayed history with `store: false`
   and encrypted reasoning items is accepted (D-021). If OpenAI rejects it, note the error: the
   fallback is `reasoningItemIdPolicy: 'omit'`.
3. Ask "Do EDA on sales and write a short report". Expect `agent · profiler`,
   `agent · sql_analyst` and `agent · report_writer` lanes, and a saved report.
4. Click **Compare** and ask the same question. Both columns should fill with an answer, tool
   calls, cost and times. Try **Stop** right after starting.
5. Switch back to Claude and check the chat still works.

Earlier phases' manual checks (2–6) are still outstanding.

## Known gaps / carried forward

- No real OpenAI call has run in this repo yet (items 1–3 above). Prices are constants as of
  2026-10-01; long-context rates aren't modelled.
- No Hugging Face on the OpenAI provider or in compare mode.
- Compare mode shows tool calls but not the charts or reports a lane creates (they are saved as
  usual).
- An interrupted OpenAI turn isn't kept in the model's context (Claude keeps it).
- `tests/mcp-server/catalog.test.ts` › "concurrent writes from different processes" failed once
  under full-suite load and passed 5/5 alone. The file is unchanged since Phase 1, so it is
  probably a timing flake. Worth watching in CI.
- Carried over: renderer bundle size, sibling SVG overwrite (Phase 3); download/artifact cleanup
  UI (Phase 6); installer size and signing (Phase 8).

## How to try it

```bash
npm ci && npm run duckdb:extensions
npm run dev     # Settings → OpenAI key → Provider: GPT; or both keys → Compare
npm run package:dir && npm run smoke:packaged -- --openai-agent
```
