# Phase 6: Hugging Face

**Branch:** `phase-6-hugging-face` · **Date:** 2026-10-01 · **Status:** ready for review. Needs one
manual run with your Anthropic key and a Hugging Face read token.

## What was built

- **Remote HF MCP server** (`https://huggingface.co/mcp?no_image_content=true`, streamable HTTP),
  attached only when you save a Hugging Face token.
  - The server config carries only `Authorization: Bearer ${DATADESK_HF_TOKEN}`. The CLI expands it
    from its own env, where main puts the token
    ([agentOptions.ts](../../src/main/agent/claude/agentOptions.ts),
    [agentEnv.ts](../../src/main/agent/claude/agentEnv.ts)). A probe verified this, because the
    SDK hands `mcpServers` to the CLI on its command line.
  - `alwaysLoad: true`, so the server connects before init and the guard sees its tools.
- **Runtime tool discovery + allowlist** ([toolDiscovery.ts](../../src/main/mcp/toolDiscovery.ts),
  [hfTools.ts](../../src/main/agent/claude/hfTools.ts)).
  - Before each session, main lists the server's tools with your token. Everything except
    `hub_repo_search`, `hub_repo_details` and `hf_fs` goes into `disallowedTools`.
  - The init guard refuses any other HF tool, `canUseTool` denies tools added mid-session, and
    the PreToolUse hook allows only `ls|cat|stat|find|search` for `hf_fs`.
  - A rejected token or an unreachable Hub starts the conversation without HF and says so.
- **`load_hf_dataset`** in datadesk-mcp ([loadHfDataset.ts](../../src/mcp-server/hf/loadHfDataset.ts)):
  - downloads ONE `.csv/.tsv/.parquet/.json/.jsonl/.ndjson` file into
    `userData/datasets/hf/<owner>/<repo>/<revision>-<hash>/…`, then registers it;
  - 500 MB cap, checked against `X-Linked-Size` and `Content-Length`, then enforced on the bytes
    received; `.part` file + rename, deleted on failure, cancel, timeout (20 min) or failed
    registration;
  - redirects followed by hand: https HF hosts only, and the token only to `huggingface.co`;
  - registration goes through a narrow `allowDirs` exception that `register_dataset` never gets
    ([fileAccess.ts](../../src/mcp-server/fileAccess.ts)).
- **Approval** for `load_hf_dataset`, reusing ApprovalBroker and the existing dialog
  ([claudeOrchestrator.ts](../../src/main/agent/claude/claudeOrchestrator.ts)).
  - Main analyst only; strict validation against a schema shared with the tool
    ([src/shared/hf.ts](../../src/shared/hf.ts)).
  - The dialog shows the dataset and its URL, file, revision (non-main flagged), the dataset name
    it creates or replaces, and the size limit. Deny, timeout, abort and reset all mean no.
  - `refs/pr/*` revisions are refused, and paths with control, bidi or Windows-invalid names are
    rejected.
- **`dataset-scout` sub-agent** ([subagents.ts](../../src/main/agent/claude/subagents.ts)) and the
  **`evaluating-datasets` skill**
  ([SKILL.md](../../resources/agent-plugin/skills/evaluating-datasets/SKILL.md)).
  - The scout is the only context that reads the Hub. It has the 3 HF tools plus `list_datasets`,
    and no rows, SQL or downloads. The main analyst delegates to it, then loads the file the scout
    names.
  - It exists only with HF on; the guard's expected agents follow the token.
- **Settings** says what the token sends and that it reaches private and gated datasets. Any key
  change now resets the session.
- **Smoke `--hf`:** with a dummy token, the packaged app gets a 401 from HF during discovery, starts
  without HF and says so.

## Decisions

- **D-019:** HF MCP server, the token route through the CLI env, discovery plus a three-layer
  allowlist, `hf_fs` verbs, and Hub tools in the scout only.
- **D-020:** `load_hf_dataset`'s location, the `allowDirs` exception, the cap, redirect rules,
  input rules and approval. The handoff suggested numbering the download decision D-019. It is
  D-020 so the entries stay in the order things were decided.

D-019 and D-020 were amended in place after the review. They are new in this branch, so no
merged history was rewritten.

## How it was verified

- **Facts:**
  - `docs-researcher`: the HF docs and server source, the HF Hub HTTP API, the SDK types.
  - Dummy-key probes of SDK 0.3.286 / CLI 2.1.286 against a fake local MCP server: `${VAR}`
    expansion, no OAuth on 401, `disallowedTools` filtering, and the tool policy being a no-op.
  - Live anonymous probes: HF `tools/list` and the `hf_fs` schema; resolve redirects and size
    headers.
- **Unit/integration: 627 passed** (508 before):
  - discovery over InMemoryTransport and an injected `fetch` (ok, 401, offline, timeout);
  - options, env, guard, scope hook and sub-agents with HF on and off;
  - approval allow, deny, timeout, sub-agent and invalid input, and the revision flags;
  - downloader against a scripted fake Hub: redirects, token scoping, all three cap checks, a
    lying server, cancel and timeout with a stalled body, HTTP errors, foreign and userinfo
    hosts, collisions, cleanup after a failed registration;
  - the shared schema and the `allowDirs` exception (`register_dataset` still refuses).
- **E2E: 26 passed**, with the normal TEMP and the 8.3 short TEMP. The new stdio test starts the
  real server with a fake token, sees `load_hf_dataset`, and checks the token isn't logged.
- **Packaged smoke:** 7/7, `--agent` 14/14, `--agent --openai` 14/14, `--agent --hf` 16/16.

## Code review

The `code-reviewer` agent asked for changes. All but two minor items are fixed, in `16c5274` and
`2ce78a6`.

- **Blocker:** nothing enforced that the auto-approved `hf_fs` only reads. Its live schema allows
  read verbs only, but a token could change that. The hook now enforces the read verbs.
- **Should fix:**
  - Hub tools sat next to the user's rows in the main analyst's context. They are now
    scout-only, and the Settings text is honest.
  - `refs/pr/*` revisions looked trusted in the dialog.
  - Different Hub files could share one local file.
- **Nits fixed:** prototype-key lookup in the approval table, unsafe path characters, the token
  port check, body cleanup, deleting a download that fails to register, the explicit MCP tool
  timeout, and three missing tests.

**Not changed:**

- `file.write` ignores `bytesWritten`. Short writes don't happen on local NTFS.
- Folders created by a failed download stay behind (empty). Harmless; it belongs with a future
  cleanup UI.

## Needs your manual check (Anthropic key + HF read token; a few cents)

1. Settings → Hugging Face → paste a **read** token (huggingface.co/settings/tokens).
2. Ask: "Find a public dataset about Iris flowers on Hugging Face and tell me the average sepal
   length per species."
   - The timeline should show `dataset-scout` with `hf · hub_repo_search` / `hf_fs`. The analyst
     should then request `load_hf_dataset`, and the dialog should show `scikit-learn/iris`,
     `Iris.csv`, `hf_iris` and the 500 MB limit.
   - Approve it. Expect a `run_sql` on `hf_iris` and an answer (about 5.0 / 5.9 / 6.6).
3. Learning-log Phase 6, experiment 1: check the `claude.exe` command line shows the placeholder,
   not your token.

Still unverified without a real token:

- the signed-in tool list and how `hf_fs` behaves with a token;
- whether `alwaysLoad` makes the first message noticeably slower.

If the guard ever stops a session with "unexpected tools: mcp__hf__…", tell me the name.

## Known gaps / carried forward

- `${VAR}` header expansion via `--mcp-config` is observed CLI behaviour, not documented. If it
  breaks, HF shows as `failed`; the token still never reaches a command line.
- The CDN host list (`*.hf.co`, `*.huggingface.co`) is observed, not documented.
- No cleanup UI for downloads (`userData/datasets/hf`) or artifacts; no ETag cache, so loading a
  file again downloads it again.
- Carried over: renderer bundle size, sibling SVG overwrite (Phase 3); installer size and signing
  (Phase 8).

## How to try it

```bash
npm ci && npm run duckdb:extensions
npm run dev     # Settings → Anthropic key + Hugging Face read token → ask for public Iris data
npm run package:dir && npm run smoke:packaged -- --agent --hf
```
