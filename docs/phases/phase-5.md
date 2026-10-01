# Phase 5: OpenAI tools inside our MCP server

**Branch:** `phase-5-openai-tools` · **Date:** 2026-10-01 · **Status:** ready for review. Needs one
manual run with your Anthropic and OpenAI keys.

## What was built

- **Injectable `OpenAIClient`** (`src/mcp-server/openai/client.ts`) with two methods, `embed` and
  `critique`. Tools depend only on this interface. The real adapter wraps `openai@7.25.0`, whose
  API was verified from its installed typings:
  - embeddings in batches, placed by `index`;
  - structured critiques via `responses.parse` + `zodTextFormat`;
  - `store: false`, `max_output_tokens: 4000` and `reasoning.effort: 'low'`;
  - a pinned endpoint with no org or project taken from the environment;
  - errors mapped to readable messages that never echo the key.
- **`search_columns`:** finds columns by meaning across datasets.
  - It embeds a short, bounded description per column (dataset, column and type clipped, plus up
    to 3 sample values of 40 characters each) and the query, then ranks by cosine similarity.
  - Column vectors are cached by content hash (model + dimensions + text). The cache is stored as
    base64 Float32 in a persisted, least-recently-used file of 5 000 entries, so a column is
    embedded once across sessions. Queries stay in memory.
- **`second_opinion`:** a second model critiques "does this SQL answer the question, and does the
  result support the draft answer?"
  - It re-runs the SQL itself through the read-only guard (50 rows) and sends one JSON object.
    Result cells are escaped.
  - It returns a bounded verdict, issues and optional SQL, labelled as untrusted advice.
- **Opt-in by key:**
  - Without an OpenAI key the tools don't exist. With one, the agent's datadesk-mcp registers
    them, and the options, init guard and sub-agents follow: profiler gets `search_columns`,
    sql-analyst gets both, report-writer gets neither.
  - Settings lists exactly what is sent. Changing the key starts a new conversation.
  - Per conversation, there are at most 30 searches and 15 critiques.
- **Key route (D-018):** main puts `DATADESK_OPENAI_API_KEY` in the agent CLI's explicitly built
  env, and the CLI hands it to datadesk-mcp. It is not put in the MCP server config, because the
  SDK passes that config to the CLI on its command line (`--mcp-config <JSON>`). The server takes
  the key out of its environment after reading it.
- An unreadable OpenAI key no longer blocks the analyst; it starts without the OpenAI tools.
- Closes the **network guard for child processes** item carried since Phase 0. Test processes
  never get a key, so they have no OpenAI code path.

## Decisions

D-018 (OpenAI tools inside datadesk-mcp: client seam, what is sent, caching, caps, the key route
via the CLI env, and the opt-in).

## How it was verified

- **Unit/integration: 508 passed.**
  - **Adapter:** runs the real SDK over an injected `fetch`, covering request shapes, batching and
    index placement, `store: false` and the cost caps, JSON input, structured parsing, and
    incomplete, refused, malformed, offline, aborted and 401/429/500 responses.
  - **Tool logic:** uses a fake client and real DuckDB, covering ranking, caching across processes,
    eviction during a search, races, failed saves, clipping, re-run SQL with the guard, cell
    escaping and the caps.
  - **Absent without a key:** checked at the MCP server, the agent options, the sub-agents and the
    guard. The key-removal helper also has a test.
- **E2E: 25 passed**, with both the normal TEMP and an 8.3 short TEMP. The new stdio test starts
  the real server with a fake key, sees 10 tools, and checks the key isn't logged. No tool is
  called, so no network is used.
- **Packaged smoke: 14/14**, run both with and without the new `--openai` flag. With a dummy
  OpenAI key, the real packaged CLI handed the key to its datadesk-mcp through the env: 10 datadesk
  tools, and the guard passed.

## Code review

The `code-reviewer` agent asked for changes. It confirmed the key never reaches the renderer,
logs, tool results, the UI's server or a command line. It flagged **one blocker**:
`second_opinion` didn't set `store: false`, so OpenAI would have kept every critique request (real
result rows included) for 30+ days.

All findings are fixed in `fb2d397`:

- **Cost:** the critic had no output cap.
- **Cache:**
  - a full cache could evict the current search's own vectors, so those columns scored 0;
  - concurrent loads raced and could re-send everything;
  - the file was oversized;
  - a failed save failed the tool.
- **Bounds:** column names and types weren't clipped.
- **Critic input:** a data cell could forge another section.
- **Caps:** there was no per-conversation limit.
- **Unreadable key:** an unreadable OpenAI key blocked the analyst.
- **Disclosure:** the Settings text was incomplete.
- **Missing tests:** refusal and malformed output, connection errors, races, eviction, and key
  removal.
- **Nits:** abort mapping, and pinning the SDK endpoint.

I also found and fixed a bug of my own: the incomplete-embeddings check used `.some()` on a sparse
array, so it could never fire.

**Not changed:**

- Keys saved in Settings before this phase opt in automatically on upgrade. The field existed
  earlier, and its hint promised these tools. The new hint and this note disclose it, and there
  is no separate first-use notice.
- **Commit scopes:** the two `docs:` commits have no scope.

## Needs your manual check (both keys; a few cents)

Follow **learning-log Phase 5, experiments 1–2**:

1. Add `sales.csv` and `events.ndjson`, then ask "Which column tells me how much money each order
   made?". Expect `datadesk · search_columns` with `unit_price`/`units` near the top.
2. Ask "What's the total revenue by region? Get a second opinion before answering." Expect a
   `second_opinion` call. If the first query summed `units`, expect the critic to flag it.

Still unverified without real keys: response quality, and whether `gpt-5.4-mini` accepts
`reasoning.effort: 'low'` (if it doesn't, the tool returns "OpenAI request failed (400)"; tell me
and I'll drop it).

## Known gaps / carried forward

- Embedding and critic model ids are constants, not settings.
- Carried over from Phase 3: renderer bundle size, no artifact cleanup, sibling SVG overwrite.
- Phase 8: installer size and signing.

## How to try it

```bash
npm ci && npm run duckdb:extensions
npm run dev     # Settings → Anthropic + OpenAI keys → "Which column tells me how much money…?"
npm run package:dir && npm run smoke:packaged -- --agent --openai
```
