# Test data

- `public/`: small, synthetic, committed fixtures used by automated tests (DuckDB runs against these).
- `private/`: real or sensitive data for manual testing only. Gitignored, and blocked from Claude Code
  by `.claude/settings.json` deny rules and the `private-paths` hook. Never referenced by automated tests.
