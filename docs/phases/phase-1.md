# Phase 1: Our MCP server (DuckDB)

**Branch:** `phase-1-mcp-server` · **Date:** 2026-10-01 · **Status:** ready for review

## What was built

- **datadesk-mcp**, a real stdio MCP server ([src/mcp-server/](../../src/mcp-server/)) on
  `@modelcontextprotocol/sdk` 1.31 and `@duckdb/node-api` 1.5.6. It has six tools
  (`register_dataset`, `list_datasets`, `get_schema`, `sample_rows`, `profile_column`,
  `run_sql`), each with zod input and output schemas and annotations. Errors return as
  `isError` results the model can act on.
- **Read-only SQL in three layers** (D-009):
  1. DuckDB's parser: exactly one statement, of type SELECT.
  2. A fresh in-memory instance per catalog change: views, `allowed_paths` set to exactly the
     registered files, then external access off and configuration locked.
  3. Chunked streaming under a row cap _and_ a 2 MB byte budget, with long cells clipped, and
     `interrupt()` on timeout or MCP cancellation (covering binding too).
- **Import policy for `register_dataset`** (D-010, D-012): absolute local paths only; no UNC,
  network drives, links or junctions (checked per component); known extensions only; no glob
  characters; a size cap; userData deny-listed.
- **Formats:** CSV/TSV, Parquet, JSON/NDJSON (built in) and XLSX, via the `excel` extension
  fetched by `npm run duckdb:extensions` (signature-checked, gitignored, cached in CI).
- **A catalog shared by several server processes:** atomic writes plus a cross-process lockfile.
  Row counts are stored at registration, and failed datasets recover on the next listing.
- **Main-process MCP client** (`UiMcpClient`): spawns the server with Electron-as-Node and an
  explicit env, validates `structuredContent`, and reconnects if the server exits.
- **Five new IPC channels** (`datasets:list|register|pick|schema|preview`). The bridge takes
  dropped `File` objects, never path strings, and the file picker runs in main.
- **UI:** a dataset sidebar (drag-drop and "Add file…", with each dataset's schema) and a 20-row
  preview table.
- **Dev scripts:** `npm run mcp:inspect` (Inspector web UI), `npm run mcp:tools` (CLI listing),
  `npm run duckdb:extensions`.

## Decisions

D-009 (three-layer read-only, `allowed_paths` plus a rebuild per change) · D-010 (register is a
security boundary; agent calls need approval in Phase 2) · D-011 (MCP surface conventions) ·
D-012 (hardening after review).

## Deviations from the plan

- The plan proposed `allowed_directories`. Probing showed it's a prefix match, which would expose
  sibling files, so we use exact-file `allowed_paths`.
- The plan named `mcp:dev`. We shipped `mcp:inspect` and `mcp:tools` instead, because the server
  needs a catalog path and is best explored through the Inspector.
- The roadmap row cap said `runAndReadUntil`. We stream chunks instead, which also lets us enforce
  a byte budget.
- There's no `remove_dataset` tool or UI yet (the Done-when asked for six tools).
  `DatasetDb.unregister` exists for later.

## Test results

- Unit/integration: **277 passed** (27 files). They include 30+ SQL guard and lockdown escape
  cases, protocol-level tests over `InMemoryTransport`, cross-process catalog concurrency, a
  bind-time timeout on a 3M-row CSV, byte and cell limits, and Windows 8.3 short paths and
  junctions.
- E2E: **18 passed**. That includes the built server over real stdio under Electron-as-Node, and
  the full UI → IPC → MCP → DuckDB flow (with only the OS dialog stubbed) showing schema and
  preview. It also checks that page-constructed `File`s are refused.
- Also checked by hand:
  - The MCP Inspector CLI lists all 6 tools, with annotations.
  - The Inspector web UI starts.
  - A screenshot of the sidebar and preview.
  - Learning-log experiment 3: disabling the lockdown makes the lockdown tests fail.

## Code review

The `code-reviewer` agent ran for real this time, with its git-read-only hook active. **It found
no lockdown or boundary escape.** It requested changes for:

- a blocker: Windows 8.3 short paths were rejected as links, which would have failed CI on GitHub
  runners;
- one broken dataset failing the whole listing;
- stale "unavailable" state that never cleared;
- the session signature race;
- cross-process lost updates to the catalog;
- binding outside the timeout;
- no byte cap on results;
- glob characters in file names;
- duplicated types;
- several nits.

All were fixed with regression tests (`4f01ad2`, `fa7e09d`, `6378167`).

Not fixed, deliberately:

- **Extra deny dirs** (`%APPDATA%`, dot-directories): they'd also block legitimate files (e.g.
  temp-extracted zips). The Phase 2 approval gate for agent registrations is the real control
  (D-010).
- **Commit subject nit** on `fc8052b` (not in the imperative). It would need a history rewrite.

## Known gaps / carried forward

- **Network guard for child processes** (from the Phase 0 review): still not extended. In this
  phase the child server has no network code: extension autoinstall is off, and external access
  is disabled after build. Phase 5 introduces the OpenAI client _inside_ the server; it will be
  injected and mocked there, and the guard will be revisited then.
- **Row counts are taken at registration** and can be stale if a file changes afterwards.
- **No `remove_dataset`** in the UI or tools yet.
- **Real OS drag-and-drop isn't automated** (Playwright can't synthesize OS drags). It's covered
  by a simulated-drop unit test and the picker e2e test. Please try it by hand.

## How to try it

```bash
npm ci
npm run duckdb:extensions   # once, for Excel support
npm run dev                  # drop test-data/public/sales.csv on the sidebar
npm run mcp:inspect          # explore the MCP server directly (see learning log)
```
