# Phase 8: Packaging

**Branch:** `phase-8-packaging` · **Date:** 2026-10-01 · **Status:** ready for review. Needs one
manual install with your Anthropic key.

## What was built

- **Windows x64 installer** ([electron-builder.yml](../../electron-builder.yml)):
  `release/DataDesk-Setup-<version>-x64.exe`, about 215 MB.
  - It is an assisted, per-user NSIS installer: no admin prompt, `%LOCALAPPDATA%\Programs\DataDesk`
    by default, the folder can be changed, and it adds Start-menu and desktop shortcuts.
  - It uses normal compression, `publish: null`, and an icon generated from code
    ([make-icon.mjs](../../scripts/make-icon.mjs), `npm run icon`).
  - The layout from the Phase 2 spike is now final. `asarUnpack` holds DuckDB and the Claude
    binary, and `extraResources` holds the skills plugin and the DuckDB extensions. The MCP bundle
    stays inside `app.asar`, because Electron-as-Node reads it there.
- **No leftovers:** electron-builder's installer copies itself (about 215 MB) to
  `%LOCALAPPDATA%\datadesk-updater`, and its uninstaller never removes the copy.
  [build/installer.nsh](../../build/installer.nsh) deletes it after installing and removes the
  folder on uninstall.
- **Smaller runtime:** six packages that only the renderer bundle or the type checker need moved
  to devDependencies, so `app.asar` went from 73 MB to 55 MB. Installed size is about 713 MB, of
  which the Claude binary is 234 MB.
- **Packaged path resolution** moved into a pure, tested module
  ([resourcePaths.ts](../../src/main/resourcePaths.ts)). Before each session, main checks that
  `claude.exe` and the plugin manifest exist. A quarantined or missing file now says "reinstall
  DataDesk" instead of failing to spawn.
- **Installer smoke:** `npm run smoke:packaged -- --installer [--agent …]`
  ([smoke-packaged.mjs](../../scripts/smoke-packaged.mjs)):
  - installs silently into a temp folder with a space in its path, then checks the file layout,
    the shortcut, the uninstall entry and that no installer copy is left;
  - runs the usual app, dataset and agent checks against the installed exe;
  - always uninstalls and checks nothing is left;
  - refuses to run where DataDesk is really installed.
- **README:** what to do about SmartScreen ("More info → Run anyway", and when that is
  reasonable), how to check the hash, where the app installs and keeps its data, what uninstall
  keeps, antivirus quarantine, updates, and building from source.

## Decisions

- **D-023:** assisted per-user NSIS, the layout (and why the MCP bundle isn't unpacked), trimmed
  dependencies, the installer-copy cleanup, the icon, and staying unsigned (and protecting
  Anthropic's signature on `claude.exe` if a certificate is ever added). Options were verified
  against electron-builder 26.15.3's own schema and NSIS templates.

## How it was verified

- **Unit/integration: 710 passed** (701 before): packaged and dev path resolution, missing
  runtime files for both providers, and the existing suites.
- **E2E: 28 passed**, with the normal TEMP and the 8.3 short TEMP.
- **Installed app (the real installer, silent per-user install, then uninstall):**

  | Run                            | Checks                                                                         |
  | ------------------------------ | ------------------------------------------------------------------------------ |
  | `--installer`                  | 18/18                                                                          |
  | `--installer --agent --openai` | 25/25 (Claude CLI from an install path with a space; one 401 with a dummy key) |
  | `--installer --openai-agent`   | 22/22 (OpenAI provider; one 401 with a dummy key)                              |

- **Unpacked build:** 7/7, `--agent --openai` 14/14, `--openai-agent` 11/11.
- `Get-AuthenticodeSignature`: `DataDesk.exe` is unsigned (expected), and `claude.exe` still has a
  valid Anthropic signature.

## Code review

The `code-reviewer` agent approved with no blockers. The three should-fix items are fixed in
`a604acc`:

- the installer smoke could leave the app installed after a failed check;
- uninstall left a 215 MB installer copy behind, so the README overclaimed;
- the smoke went through `cmd.exe`.

**Nits fixed:** a runtime test for the OpenAI provider's missing-plugin refusal, the ROADMAP line
wording, the README's list of what stays in `%APPDATA%\DataDesk`, and no empty temp folder when the
installer is missing.

**Not changed:** the `test(smoke)` commit scope. It isn't in CLAUDE.md's list, but the
packaged-smoke commits since Phase 3 already use it, so changing it now would make the history
inconsistent.

## Needs your manual check (Anthropic key; a few cents)

This is the "Done when" line:

1. `npm run package`, then run `release\DataDesk-Setup-0.0.1-x64.exe` by double-clicking it.
   - SmartScreen should warn: choose More info → Run anyway.
   - Keep the default folder, and finish with "Run DataDesk" ticked.
2. In the app: Settings → Anthropic key. Drop `test-data\public\sales.parquet` on Datasets, open
   its preview, and ask "Which region sold the most units?" Expect `datadesk · run_sql` in the
   timeline and an answer.
3. Optional: close DataDesk and reopen it from the Start menu. The key and dataset should still be
   there.
4. Uninstall from Settings → Apps. The app folder, the shortcuts and `%LOCALAPPDATA%\datadesk-updater`
   should be gone. `%APPDATA%\DataDesk` stays (delete it by hand if you want a clean slate).

Earlier phases' manual checks (2–7) are still outstanding.

## Known gaps / carried forward

- **Unsigned:** SmartScreen warns until there's a code-signing certificate (and some reputation).
- **No auto-update:** updating means installing again.
- **Size** is dominated by the Claude binary. Downloading it on first use would cut the installer
  roughly in half, but needs its own trust and verification story.
- **No installer in CI:** CI builds and tests, but doesn't run `npm run package` or the installer
  smoke. These take minutes and change the runner's user profile.
- Carried over: renderer bundle size and sibling SVG overwrite (Phase 3); download and artifact
  cleanup UI (Phase 6); no HF on the OpenAI provider and an interrupted OpenAI turn not kept in its
  context (Phase 7).

## How to try it

```bash
npm ci && npm run duckdb:extensions
npm run package                                  # release/DataDesk-Setup-0.0.1-x64.exe
npm run smoke:packaged -- --installer --agent    # install → check → uninstall, automatically
```
