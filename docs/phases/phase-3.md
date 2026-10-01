# Phase 3: Runtime Agent Skills, charts and reports

**Branch:** `phase-3-skills-charts` · **Date:** 2026-10-01 · **Status:** ready for review. Needs
one manual run with your Anthropic key.

## What was built

- **Runtime Agent Skills.** Three skills ship in a bundled local plugin,
  `resources/agent-plugin` (plugin `datadesk`):
  - `eda-checklist`: an ordered EDA procedure using our tools.
  - `chart-style`: Vega-Lite conventions for `create_chart`.
  - `report-format`: report structure and `[[chart:id]]` embedding.

  They're loaded with the SDK `plugins` option, allowlisted by `skills`, with skill shell
  execution and bundled skills disabled. The packaged app copies the plugin via `extraResources`.

- **Guard and slash commands.**
  - The guard now checks the plugin (only ours, at our path, no `plugin_errors`) and that our
    skills are listed.
  - `--disable-slash-commands` was dropped, because it also disables skills. Typed `/commands`
    are neutralized instead (D-015).
- **MCP tools** `create_chart` and `save_report` (8 tools now).
  - `create_chart` sanitizes the Vega-Lite spec and runs the SQL under a chart row and byte
    budget.
  - Both tools store artifacts in `userData/artifacts` and return only ids to the model.
- **Artifact events and IPC.**
  - Successful chart and report tool results become `artifact` events.
  - New channels: `artifacts:getChart`, `artifacts:getReport` and `artifacts:exportReport`,
    all uuid-only.
- **Charts & report panel.**
  - Tabs for each artifact sit next to the data preview, and a new artifact takes over.
  - Vega-Lite renders under the unchanged strict CSP: AST interpreter, no actions, no injected
    styles, deny-all loader.
  - Reports render as safe Markdown (no raw HTML, images or links) with embedded charts.
- **Export.**
  - Markdown: built in main from the stored text plus SVGs main renders with headless Vega.
  - PDF: printed from a hidden, JS-off, sandboxed window with its own CSP and a request filter
    (D-016).
- The timeline shows `skill · <name>` for Skill calls.
- The `add-mcp-tool` dev skill now points at the real file layout.

## Decisions

D-015 (skills as a bundled plugin; slash commands stay on and are neutralized) · D-016 (artifacts
by id, CSP-safe Vega, PDF from a locked-down hidden window).

## How it was verified

- **Unit/integration: 429 passed.** New coverage includes:
  - the spec sanitizer (including 5 000-row charts and derived fields), the chart and report
    tools, the plugin options and guard, and slash-command neutralizing at `InputQueue.push`;
  - artifact events (including multi-line titles) and the reducer, the artifact IPC handlers and
    contract;
  - headless SVG rendering in main, export builders, and the print window (mocked Electron);
  - renderer re-sanitizing, and the panel: tab switching, resets, dataset picks, report
    rendering, export payloads, and no images, links or raw HTML from markdown.
- **E2E: 24 passed.** The new `artifacts.spec.ts`:
  - renders a chart (with an expression) in the real app, with **zero CSP violations** and **no
    `<style>` elements**;
  - exports Markdown (`.md` + `.svg`) and **a real PDF from the never-shown print window**,
    with the temp file cleaned up.
- **Packaged smoke: 13/13** (`npm run package:dir && npm run smoke:packaged -- --agent`). New
  checks: the agent has the `Skill` tool, and the init guard passed with the plugin loaded from
  `resources/agent-plugin`.
- **Dummy-key probes** (manual, during development):
  - the plugin loads with `settingSources: []`;
  - skills are listed as `datadesk:*`;
  - `--disable-slash-commands` removes skills and the Skill tool;
  - a leading space stops slash dispatch (`/cost` neutralized);
  - `!echo …` and `# …` reach the model as text (not dispatched).

## Code review

The `code-reviewer` agent found **no agent-isolation regression**. Charts, report markdown and
titles can't run script in the app or the PDF. It flagged **one blocker** and seven should-fix
items, all fixed in `39cc404`, `1b2cc98` and `8bff8f0`.

**The blocker.** Any chart with more than about 50 KB of data saved fine but couldn't be shown or
exported. The renderer's re-check counted the inlined rows toward the spec size limit. Now the
size limit ignores data, and the data has its own row cap shared by server and renderer.

**Should-fix items:**

- **`isSafeSvg` was bypassable** (`<s:script>`, `javascript&#58;`) and rejected harmless titles.
  Main now renders export SVGs itself from the stored charts, the regex is gone, and the renderer
  no longer sends SVGs.
- **A newline in a title** silently dropped the artifact event. Titles are now single-line at the
  tool boundary, and the parser reads after the last newline.
- **Tab selection** broke after a conversation reset and ignored dataset picks once an artifact
  existed. It now tracks the newest artifact id plus "previous props" for the dataset.
- **Overlapping PDF exports** shared one session request filter, and cleanup could leak on early
  failures. Prints are now queued, and everything is cleaned up in `finally`.
- **The print window had no guarding test.** There's now a unit test with mocked Electron
  covering the preferences, the request filter, cleanup and serialization, and `webSecurity` is
  set explicitly.
- **The slash-command neutralizer** was only tested as a pure function. There's now an
  `InputQueue` test, plus a probe confirming `!` and `#` aren't dispatched in SDK mode (D-015).
- **Malformed or too many `[[chart:…]]` refs** reached the model as just `[`. They now give
  readable errors.

**Nits fixed:**

- Transform-derived fields (`as`, `fold`) are accepted.
- `bind.element` is rejected.
- Report links are unwrapped. The skill already said links wouldn't render; in the app they
  were a click-to-leak path.
- Windows reserved file names are handled.
- Each chart render gets a fresh host element.
- Tool output and `exportReport` types are derived from zod.

**CI fix after the push:** the PDF e2e failed on the runner only. Its 8.3 temp path
(`RUNNER~1`) is URL-encoded differently by Node (`%7E`) and Chromium (`~`), so the print
filter blocked its own file. It now compares decoded paths. Reproduced and verified locally with
an 8.3 `TEMP`, and a unit test covers both encodings.

**Not fixed, deliberately:**

- **Sibling SVGs overwrite silently** (see gaps).
- **The init guard trusts any `builtin` plugin.** The probe showed none load with our settings,
  so there's nothing to allowlist yet.
- **`test(smoke)`/`test(e2e)` commit scopes** are outside the list; fixing them needs a history
  rewrite.
- **For Phase 4:** `create_chart` executes SQL, so report-writer must not get it.

## Needs your manual check (real key, a few cents)

"Done when" asks that "do EDA on X" invokes `eda-checklist` (visible in the timeline) and yields
a chart. Please follow **learning-log Phase 3, experiment 1**:

1. Settings → Anthropic key → Haiku, $0.25. Add `test-data/public/sales.csv` and ask "Do a quick
   EDA on sales". Expect `skill · eda-checklist` in the timeline and a chart tab on the right.
2. Ask "Write a short report with a chart of units by region" and try **Export PDF** and
   **Export Markdown**.

Still unverified without a real key: whether the model passes the skill name qualified
(`datadesk:eda-checklist`) or bare. The timeline handles both.

## Known gaps / carried forward

- **Renderer bundle is ~3.4 MB**, mostly Vega. It could be lazy-loaded; that's not urgent for a
  local app.
- **Artifacts accumulate** in userData. There's no cleanup or delete UI yet.
- **Exports overwrite** whatever the save dialog confirms. Sibling SVGs (`<name>-chart-N.svg`)
  overwrite silently.
- **Installer size and signing** (Phase 8), and the **network guard for child processes**
  (Phase 5), are carried over.

## How to try it

```bash
npm ci && npm run duckdb:extensions
npm run dev                                   # Settings → key → "Do a quick EDA on sales"
npm run package:dir && npm run smoke:packaged -- --agent
```
