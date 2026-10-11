# DataDesk

A local AI data analyst for your desktop. Drop in CSV, Excel, Parquet or JSON files (or find public
datasets on Hugging Face), ask questions in plain English, and get SQL-backed answers, Vega-Lite
charts, and exportable Markdown/PDF reports.

Built with Electron, TypeScript, React and Vite. The analyst runs on the Claude Agent SDK or the
OpenAI Agents SDK (your choice, or both side by side in compare mode) and talks to your data
through its own MCP server backed by DuckDB. Your files stay on your machine; only what the
analyst sends to the model provider you chose leaves it.

> Status: early development. See [ROADMAP.md](ROADMAP.md) for progress.

## Install (Windows 10/11, x64)

1. Get `DataDesk-Setup-<version>-x64.exe`, or build it yourself (below).
2. **Check the file before running it.** The installer is not code-signed, so Windows can't tell
   you who made it. If you were given a checksum, compare it:
   ```powershell
   Get-FileHash .\DataDesk-Setup-0.0.1-x64.exe -Algorithm SHA256
   ```
3. Run it. **Windows SmartScreen will say "Windows protected your PC"**, because the publisher is
   unknown and the file is new. Choose **More info → Run anyway**. You should only do this for a
   file you built yourself or got from someone you trust.
4. The installer doesn't need admin rights. It installs for your user only, by default to
   `%LOCALAPPDATA%\Programs\DataDesk` (you can pick another folder), and adds Start-menu and
   desktop shortcuts. Allow about 750 MB of disk space.
5. Open DataDesk → **Settings**, and paste an Anthropic and/or OpenAI API key (and optionally a
   Hugging Face read token). Keys are encrypted with Windows' own data protection (DPAPI) and never
   leave the app except to their provider. Each key's note in Settings says exactly what is sent.
6. Drop a CSV, Excel, Parquet or JSON file on the Datasets panel and ask a question.

**Antivirus:** some products quarantine unsigned programs or the bundled agent runtime
(`claude.exe`, which is signed by Anthropic). If the analyst says its runtime is missing, restore
the file from quarantine or reinstall.

**Uninstall:** Windows Settings → Apps → DataDesk → Uninstall. This removes the program, its
shortcuts and its entry in Apps. Your data is kept in `%APPDATA%\DataDesk`: encrypted keys,
settings, the dataset list, charts, reports, any downloaded Hugging Face datasets, and the
analyst's private workspace and config. Your own data files are never copied there. Delete that
folder too to remove everything.

**Updates:** there is no auto-update yet. Install a newer version over the old one; your settings
and keys are kept.

## Build from source

Requires Node.js 22.19+ and Windows x64.

```powershell
npm ci
npm run duckdb:extensions   # fetches the DuckDB Excel extension into resources/
npm run dev                 # run in development (hot reload)
npm run package             # builds release/DataDesk-Setup-<version>-x64.exe
npm run smoke:packaged -- --installer   # installs it to a temp folder, checks it, uninstalls
```

`npm run check` runs typecheck, lint, format and unit tests; `npm run test:e2e` runs the
Playwright tests against the built app. `npm ci` also installs a commit-msg hook that checks
commit messages against [docs/conventions/git-conventions.md](docs/conventions/git-conventions.md).

## Documentation

- [ROADMAP.md](ROADMAP.md): phases and progress
- [CLAUDE.md](CLAUDE.md): how the repo is worked on (conventions, rules, routines)
- [DECISIONS.md](DECISIONS.md): architecture decision log
- [docs/conventions/](docs/conventions/README.md): commit, branch and PR conventions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): process layout and data flow
- [docs/learning-log.md](docs/learning-log.md): per-phase learning notes
