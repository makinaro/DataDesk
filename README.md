# DataDesk

A local AI data analyst for your desktop. Drop in CSV, Excel, Parquet or JSON files (or find public
datasets on Hugging Face), ask questions in plain English, and get SQL-backed answers, Vega-Lite
charts, and exportable Markdown/PDF reports.

Built with Electron, TypeScript, React and Vite. The analyst runs on the Claude Agent SDK and talks
to your data through its own MCP server backed by DuckDB.

> Status: early development. See [ROADMAP.md](ROADMAP.md) for progress.

## Documentation

- [ROADMAP.md](ROADMAP.md): phases and progress
- [CLAUDE.md](CLAUDE.md): how the repo is worked on (conventions, rules, routines)
- [DECISIONS.md](DECISIONS.md): architecture decision log
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): process layout and data flow
- [docs/learning-log.md](docs/learning-log.md): per-phase learning notes
