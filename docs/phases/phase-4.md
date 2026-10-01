# Phase 4: Sub-agents

**Branch:** `phase-4-subagents` · **Date:** 2026-10-01 · **Status:** ready for review. Needs one
manual run with your Anthropic key.

## What was built

- **Three sub-agents** (`src/main/agent/claude/subagents.ts`), all from one scope table:

  | Agent         | Tools                                                                     | Preloaded skill          |
  | ------------- | ------------------------------------------------------------------------- | ------------------------ |
  | profiler      | `list_datasets`, `get_schema`, `sample_rows`, `profile_column`, `run_sql` | `datadesk:eda-checklist` |
  | sql-analyst   | `list_datasets`, `get_schema`, `sample_rows`, `run_sql`, `create_chart`   | `datadesk:chart-style`   |
  | report-writer | `save_report` only (writes from the findings it is handed)                | `datadesk:report-format` |

  Settings for every agent:
  - `disallowedTools`: Agent, Task, Skill, register_dataset;
  - `model: 'inherit'`, `maxTurns: 20`, `omitClaudeMd`;
  - no `permissionMode`, `mcpServers` or `memory`.

- **Scope hook** (`scopeHook.ts`), a `PreToolUse` hook that sees every tool call:
  - **Inside a sub-agent:** anything outside that agent's row is denied, with a reason the model
    can read.
  - **On the main thread:** delegations must be exactly `{subagent_type, description, prompt}`
    with one of our three types.
  - **Fails closed:** a call counts as main-thread only if both `agent_id` and `agent_type` are
    absent.
- **`canUseTool`** (second layer): strips delegations to those three fields, and denies the
  sub-agent tool and `register_dataset` from inside sub-agents.
- **Caps via env** (`SUBAGENT_LIMITS`): no built-in agents, spawn depth 1, 3 concurrent,
  foreground only, no forks.
- **Init guard:** requires exactly our three agents (no extras, none missing) and accepts the
  tool under both its names (`Agent` requested, `Task` reported).
- **Timeline lanes:** each `Agent` call becomes a lane holding the sub-agent's own tool calls and
  its latest message (via `forwardSubagentText`). Sub-agent text never enters the chat.
- **Analyst prompt:** says when to delegate (bigger jobs only) and what a hand-off must contain.

## Decisions

D-017 (sub-agents from one scope table, gated three ways; env caps; what is verified vs not).

## How it was verified

- **Unit/integration: 467 passed.** New tests cover:
  - each agent's exact tool set, and that report-writer has nothing that runs SQL or reads rows;
  - no nesting, no register_dataset, no widening fields;
  - the hook denying `run_sql` for report-writer, plus out-of-scope calls, unknown agents,
    missing agent fields, and malformed or over-specified delegations;
  - `canUseTool` delegation stripping and the sub-agent denials;
  - the guard's agent checks (including an `init` without `agents`);
  - env caps, lane grouping (including a parent cycle), and the reducer routing sub-agent text.
- **E2E: 24 passed**, with both the normal TEMP and an 8.3 short TEMP like CI's.
- **Packaged smoke: 14/14** with a dummy key. The real CLI session passed the guard, which proves
  `init.agents` is exactly our three, and the sub-agent tool is present as `Task`.
- **Probes** (dummy key):
  - without `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS` there are 5 built-in agents, and with it,
    only ours;
  - the tool is listed as `Task`.
- **Docs** (via `docs-researcher`): the env caps' semantics and defaults, that hooks and
  `canUseTool` fire for sub-agent calls, inherited MCP tools, and `skills` preloading.

## Code review

The `code-reviewer` agent **approved**, with no blockers. It found no way for a sub-agent to get
more tool power than its row in the scope table. Fixed in `94610a4`:

- **The `canUseTool` delegation gate might never run.** The CLI may not ask about the main
  thread's `Agent` call, and our tests called `canUseTool` directly, so they passed either way.
  The hook now enforces the delegation shape itself, and D-017 marks this question as
  unverified.
- **The hook failed open if `agent_id` ever went missing.** It now needs both fields absent
  before treating a call as main-thread.
- **Orphaned doc comment** in `agentEnv.ts`.
- **Nits:**
  - lane cycles could hide items, and building lanes was quadratic; it is now memoized;
  - the name helper is shared via `src/shared`;
  - `omitClaudeMd` added;
  - the scope-hook tests moved to their own file;
  - a test added for an `init` without `agents`.

**Not changed:** commit `fe828e3` covers three ROADMAP tasks (definitions, hook, caps). They
share one options builder and test file, and the commit body says so.

## Needs your manual check (real key, about $0.50 on Haiku)

The phase's "Done when" includes a manual check: "analyze and write a report" should show three
sub-agent lanes. Please follow **learning-log Phase 4, experiment 1**. Add `sales.csv` and ask
"Analyze the sales dataset and write a short report with one chart". You should see lanes for
profiler, then sql-analyst, then report-writer, followed by a chart tab and a report tab.

Still unverified without a real key:

- whether `canUseTool` is asked about the main `Agent` call (the hook covers it either way);
- whether the model's delegations pass the strict shape first time. If they don't, you'll see a
  denied `agent · …` call and a retry in the timeline. Tell me and I'll loosen it to stripping.

## Known gaps / carried forward

- Each sub-agent re-reads its system prompt and preloaded skill, which costs more than a direct
  answer. The prompt tells the analyst to delegate only bigger jobs.
- The lanes show only each sub-agent's latest message, not a running transcript.
- Carried over from Phase 3: renderer bundle size, no artifact cleanup, sibling SVG overwrite.
- Carried over from earlier phases: installer size and signing (Phase 8), and the network guard
  for child processes (Phase 5).

## How to try it

```bash
npm ci && npm run duckdb:extensions
npm run dev        # Settings → key → "Analyze the sales dataset and write a short report"
npm run package:dir && npm run smoke:packaged -- --agent
```
