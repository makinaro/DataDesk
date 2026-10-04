# P23 Plan: Hardening, Packaging & Portfolio Polish

| Field     | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P23 of P10–P23 (roadmap §10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Milestone | v1.0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Objective | A hardened, installable, presentable v1.0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Entry     | P22 closed (signed freeze tag evaluated); P23-00 landed on `phase-22-evaluation` **before P22's code rc tag**, approved as a pre-freeze slice by a D-NNN (Q-AP2); Q-AK, Q-AN and Q-AP defaults signed off by the maintainer; **the spend approval for this phase** as a maintainer-signed tag naming the tester (P12 Q-K1; D-034's amount rules)                                                                                                                                                                                             |
| Spend     | Planned **≈ $10** (Q-AK5): two fresh-machine runs of one guided goal (≈ $2), the demo and screenshots (≈ $3), the release-day alias resolution (≈ $0.10), headroom for one repeated fresh-machine loop (≈ $5). This spend goes through the app, not the paid runner, so code can't enforce it; it is **recorded in the same signed-tag approval source** and paid from the **tester's own key** (D-034: each contributor pays for their own runs) (Q-AN9, Q-AP6). A re-opened freeze is **not** covered: it needs its own P22-style approval |
| Size      | L (8 sessions)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Branch    | `phase-23-release` (P23-00 on `phase-22-evaluation`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Inputs    | D-003 (RunAsNode children), D-007 (`app://`), D-016 (PDF window), D-023 (installer), D-029 (catalog writer), D-031, D-037, D-041, D-042, D-043, D-045 · P10 Q31, Q32, Q45 · P11 Q2 (snapshot layout) · P12-07 (bench hooks stripped) · P13 Q3 (escape suite), Q7 (fuses), Q8 / P13-09 (integrity) · P16 (`studyDesign` IPC) · P20 (lesson store, tombstones) · P22 freeze record, tree hash and report formatter                                                                                                                             |
| Outputs   | D23-0 pre-freeze changes · D23-1 hardened release build · D23-2 storage orchestration and view · D23-3 onboarding · D23-4 README and portfolio material · D23-5 release pipeline · D23-6 fresh-machine record · D23-7 diagnostics · D23-8 upgrade and migration smoke                                                                                                                                                                                                                                                                        |
| Status    | Audited (3 rounds, `P23-audit.md`); maintainer defaults pending (Q-AK, Q-AN, Q-AP)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**Rule for the phase:** hardening, packaging and presentation. P22's freeze record holds a **tree
hash** over its exact list of evaluation-relevant paths (amended by the P23-00 D-NNN to include
`src/mcp-server/`, `src/node-shared/`, `src/main/mcp/` and `electron.vite.config.ts`, Q-AP2). **Every
P23 change to a listed path is made in P23-00, before P22's code rc tag**; a CI step on
`phase-23-release` fails if the tree hash moves after the code rc. After the freeze, P23 touches
only non-evaluation paths (`src/main/storage/`, `src/shared/storage/`, `src/main/diagnostics/`,
onboarding UI, packaging, README, release). The release job **checks out the named freeze tag
itself** (the latest freeze tag if a holdout-d re-froze), verifies its signature against the
maintainer keys in a maintainer-owned file, **recomputes** the tree hash from that commit and from
the release commit, and compares them; it never reads a stored hash from the release commit
(Q-AP7). Any other change re-opens the P22 freeze. The one declared deviation is the default model:
v1.0 ships **aliases** (D-045), recorded by a D-NNN, with the evaluated pinned ids printed beside
them (Q-AK2).

**Build sequence (round 2, D1):** `electron-vite build` once → `electron-builder --dir` (an assertion
fails the job if `electron-builder.yml` sets `electronFuses`) → Playwright smoke and the packaged
escape suite on the **unfused** `release/win-unpacked` → an **unfused, unpublished NSIS build** for
the installer and upgrade smokes → `@electron/fuses` `flipFuses` on `DataDesk.exe` →
`electron-builder --prepackaged release/win-unpacked --win nsis`. The release job asserts that the
`app.asar` SHA-256 is unchanged and that the exe differs from the tested one **only in the fuse
wire bytes**. electron-builder embeds the Windows asar-integrity resource at pack time (verified in
`app-builder-lib/out/electron/electronWin.js`), so flipping fuses after `--dir` keeps it;
docs-researcher confirms that `OnlyLoadAppFromAsar` doesn't affect the RunAsNode children.

**Two flavours, one commit (Q-AN2, round 3 M-5):** the release asar has no fake-provider hook
(P12-07), so the **full DS task with the fake provider runs on the bench-flavour asar built from the
same commit**. The **bundle diff** builds both flavours with `minify: false` and source maps, maps
every differing hunk to its source file through the source map, and requires every such file to
be in a committed list of guarded modules (`scripts/guarded-modules.json`); the tool and list are
committed. The release asar runs the hook-free smoke, the escape suite and the fused-exe
verification.

---

## 1. Inherited Decisions and Inputs

| Source          | What it forces in P23                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-023           | Assisted per-user NSIS installer, unsigned, trimmed runtime; `publish: null` stays (CI uploads with `gh release`); `claude.exe` keeps Anthropic's signature if signing arrives |
| D-003           | `datadesk-mcp` runs through `ELECTRON_RUN_AS_NODE`, so the RunAsNode fuse stays on                                                                                             |
| D-016           | The PDF window is hidden, script-disabled and loads a `file://` page (`src/main/artifacts/printPdf.ts`)                                                                        |
| D-029, D-043    | Each store has one writer; deletes only inside DataDesk-owned roots; amended so `StorageService` orchestrates and each owner deletes (Q-AP3)                                   |
| P10 Q31         | Unsigned v1.0 with `SHA256SUMS.txt`; a low-cost cloud signing service is priced (P23-02)                                                                                       |
| P10 Q32         | Complete deletion: journal, snapshots, derived data, models, artifacts, notes and dataset-scoped lessons together; "everything derived from dataset X"                         |
| P10 Q45, NFR-18 | Schema migrations tested; files newer than the app open read-only                                                                                                              |
| P12-07          | Bench hooks stripped from the default build                                                                                                                                    |
| P13 Q3, DoD-4   | Escape suite in the packaged smoke; M-11 = 0 for the build that ships                                                                                                          |
| P13 Q7, Q8      | Fuses; runtime integrity built in P13-09 (Pyodide), re-verified here with asar integrity                                                                                       |
| P20             | The lesson store has a single writer in main; a deleted analysis leaves data-free tombstones (EC20-3)                                                                          |
| P22             | Freeze record and tree hash, evaluation-relevant paths, report formatter, holdout custody                                                                                      |

## 2. Session Plan

| Session                                          | Work items     | Output                                                   |
| ------------------------------------------------ | -------------- | -------------------------------------------------------- |
| 0 (on `phase-22-evaluation`, before the code rc) | P23-00         | Evaluated-path changes                                   |
| 1                                                | P23-01, P23-08 | Build sequence, fuses, integrity, fused-exe verification |
| 2                                                | P23-03         | Storage orchestration and view                           |
| 3                                                | P23-04, P23-09 | Onboarding samples; diagnostics                          |
| 4                                                | P23-07, P23-10 | Release pipeline; upgrade and migration smoke            |
| 5                                                | P23-05, P23-02 | README, media; signing pricing                           |
| 6–7                                              | P23-06, audit  | Fresh-machine test with a planned fix loop; release      |

## 3. Work Item Breakdown

### P23-00 Pre-freeze changes (Q-AN1, Q-AP2)

- [ ] Built on `phase-22-evaluation` and merged **before P22's code rc tag** (P22-01's first step), each by path:
  - **Owner-side delete APIs** (Q-AP3): `purgeByDataset` / `deleteById` in `src/mcp-server-ds/` (derived data, snapshots), a UI-only catalog tool in `src/mcp-server/` (D-029's `DATADESK_UI_TOOLS`), journal deletion in `src/main/analysis/`, and a **compaction** in `src/main/knowledge/` that physically removes dataset-scoped lessons and notes (leaving P20's tombstones); each step resumable and idempotent
  - The MCP servers' "release handles for id X" call (`src/mcp-server-ds/`, `src/mcp-server/`); `serverProcess.ts` (`src/main/mcp/`) exposes every live child, including per-session `datadesk-mcp` instances
  - The `pending-delete` checks in every id→path resolver, lease acquisition and `predict`
  - The compute host's startup-health record; the Pyodide hash manifest moved into `app.asar` and the `resources/agent-plugin/` startup hash check
  - The escape-result schema's `release` build kind (P13-03); `bench/scorer`'s **provenance-only mode** over a journal (for EC23-2); the error-class plumbing the diagnostics canary needs; the `@electron/fuses` dev dependency
- [ ] A CI step fails if the tree hash moves after the code rc

**Done when:** these land with tests and P22's code rc is cut after them.

### P23-01 Packaged hardening

- [ ] P13's packaged Pyodide runtime is verified present and hash-checked in the release build (P23 adds nothing to it); installed size **≤ 950 MB** and download **≤ 350 MB** (Q5), both **failing steps in `release.yml`**, measured on the pinned **`windows-2025`** image (baseline: D-023's ≈ 713 MB installed); offline first run; uninstall leaves only `userData` (checked on the unfused installer)
- [ ] **Fused-exe verification** (`scripts/verify-fused.mjs`, no Playwright): read the fuse wire with `@electron/fuses`; launch with `NODE_OPTIONS=--require <canary>` and assert no canary file appears; launch with `--inspect=9229` and assert the port stays closed; launch `DataDesk.exe` with `ELECTRON_RUN_AS_NODE=1` on each MCP server entry and complete an MCP `initialize` and `tools/list` over stdio; an outbound-block firewall rule on the exe path, added with elevation and removed in `finally`; the startup-health record shows the compute host up
- [ ] `--remote-debugging-port` is **not** blocked: Playwright needs it, and same-user local access is outside v1.0's threat model, stated in the fuse D-NNN (Q-AP1)
- [ ] The release `app.asar` is searched for P22-00's and P12-07's **sentinel strings**, and none may be present
- [ ] The escape suite runs on the release-identical asar (unfused copy, driven through Playwright's `app.evaluate` on main), writing `bench/results/escape/<asar-sha256>.json` with build kind `release`

**Done when:** EC23-1 passes in CI on a release candidate.

### P23-08 Fuses and integrity

- [ ] Every fuse decided explicitly (Q1): `RunAsNode` on (D-003); `EnableNodeOptionsEnvironmentVariable` off; `EnableNodeCliInspectArguments` off; `EnableEmbeddedAsarIntegrityValidation` on; `OnlyLoadAppFromAsar` on; `EnableCookieEncryption` on; **`GrantFileProtocolExtraPrivileges` off**, because the D-016 PDF window (JavaScript off, every request cancelled except its own file and `data:image/`) needs none of its extras; this is proven by a **test copy of the unfused exe with only that fuse flipped off**, on which the Playwright smoke exports a PDF; if that fails, the fuse stays on by a D-NNN (Q-AP5)
- [ ] **Integrity detects corruption, not tampering, in v1.0** (Q-AK3, a D-NNN): an unsigned exe in a user-writable folder can be re-patched; the README's security model makes no tamper claim and says integrity covers neither `app.asar.unpacked` nor `duckdb-extensions`
- [ ] Negative tests: a tampered copy of `app.asar` is refused at launch **and** by a RunAsNode child reading it; a tampered Pyodide file makes the host report `unavailable` (P13-09)

### P23-02 Signing

- [ ] Per P10 Q31: unsigned with checksums, unless a certificate is in hand; price a low-cost cloud signing service and record it for v1.x

### P23-03 Storage hygiene (Q-AP3)

- [ ] **`StorageService` in main orchestrates; each store's owner deletes** (D-NNN amending D-029 and D-043): the catalog through `datadesk-mcp`'s UI-only tool, derived data and snapshots through `datadesk-ds`, journals through the analysis module, lessons and notes through the knowledge store's compaction (P23-00); main never writes another owner's store
- [ ] **Order, fixed and resumable:** take a per-id lock → write a `pending-delete` marker (zod-validated, atomic, under a main-only root no grant or download path covers) with state `requested` → refuse, **clearing the marker**, if a controller or lease holds the target → set `confirmed` → ask **every live child** (enumerated from `serverProcess.ts`, per-session `datadesk-mcp` instances included) to release handles → mark registry entries removed → owners delete files → clear the marker. Startup **rolls forward** only `confirmed` markers, at most 3 retries, then records a visible failure; `requested` markers are cleared. A test interleaves a lease request between the check and the delete
- [ ] **Roots from one table** in `src/shared/storage/storageRoots.ts` (outside P22's frozen `src/shared/ds/`): analyses (journal, `<analysis>/snapshots/<epoch>/`, test-lock rows), derived, models, artifacts, hf, knowledge (notes, lessons) and samples. Paths are **recomputed from ids**; `realpath` containment against those roots; reparse points refused; **registered external files are only unregistered, never deleted**; tests for junctions, `..`, 8.3 short names and case differences
- [ ] Cascades: an analysis (journal, snapshots, artifacts, models); a derived dataset and what depends on it; "everything derived from dataset X" (P10 Q32), including its notes and dataset-scoped lessons; **saved analyses that read X are kept and marked "parent removed"** (D-043). A snapshot is **orphaned** only when no saved analysis references it; snapshots of saved analyses can't be deleted on their own (Q-AK4)
- [ ] **Confirmation in main:** delete-all and every cascade show a native `dialog.showMessageBox` from main; the renderer's confirmation is advisory only
- [ ] "Delete all DataDesk data" (also clears keys) writes its marker atomically, tells the user the app will restart, **relaunches immediately**, and runs before any child starts; the README notes that uninstall leaves `userData`
- [ ] An **"Export analysis journal"** action in the storage view (for the fresh-machine test and support)
- [ ] The storage view (`src/renderer/src/views/storage/`) opens on a full disk

**Done when:** the containment, race, resume and crash-sweep tests pass.

### P23-04 Onboarding

- [ ] A committed **sample manifest** (`resources/samples/manifest.json`) names each sample, its source, licence and split status; samples are copied on request into `userData/datasets/samples/<sha256>`, verified against the manifest's hashes inside `app.asar`, ≤ 5 MB each, from a licence allowlist permitting redistribution (attribution shipped), and **never from any holdout split** (Q2, Q-AK8)
- [ ] The A/B goal uses a **purpose-built synthetic randomised sample** from `scripts/make-ab-sample.mjs`, in a seed namespace separate from DS-Bench, whose `studyDesign` record (`randomised: true`) is set through **P16's existing IPC path**; other goals use the public samples in the manifest
- [ ] "Try this" goals (`src/renderer/src/views/onboarding/`) and key setup guidance

### P23-05 Portfolio README

- [ ] Screenshots, a short demo labelled **illustrative, not evidence**, architecture, security model (corruption-only integrity; same-user local access out of scope; checksums prove download integrity, not authenticity), P22 results (Q9)
- [ ] The results block is rendered by `scripts/readme-results.mjs`, which **imports P22's formatter** (`bench/report/evaluation.ts`), between markers from P22's committed aggregates; CI fails if the block differs; it states "evaluated on the bench flavour with pinned ids X/Y" and lists waivers and v1.0 limitations
- [ ] The release checklist records what each alias resolves to on release day (from the journalled snapshot id, P14-10); if it differs from the evaluated id, the README says so

### P23-06 Fresh-machine test

- [ ] **The tester** is a contributor who didn't write the README or the onboarding, named in the spend tag and using their own key (Q-AP6)
- [ ] Pass = all of (Q4, Q-AK6): on a standard (non-admin) Windows user, once on Windows 10 and once on Windows 11 (AC-05), with no Node, Python, Git or VS Build Tools installed; the installer is the **CI workflow artifact whose SHA-256 matches the draft release** (Q-AN4); the checksum matches (attestation verification is optional in the README); no step needed outside the README; one guided goal finishes with a report; the tester uses "Export analysis journal", and **M-04 = 0 is computed by the scorer's provenance-only mode** (P23-00) and committed to `docs/ds/fresh-machine.md`; elapsed time ≤ 30 minutes, **from the installer file's download timestamp to the journal's final event, minus the analysis run time from the journal's code-recorded duration** (amends roadmap P23-06 by a D-NNN)
- [ ] A failure goes through a planned fix loop (README or onboarding fix → rebuild → retest)
- [ ] **After publishing**, a maintainer downloads from the release page (with Mark-of-the-Web) and verifies `SHA256SUMS.txt`

### P23-07 Release pipeline

- [ ] A **tag ruleset** limits creation, update and deletion of release tags to maintainers; the release workflow triggers only on `v[0-9]+.[0-9]+.[0-9]+` (not on rc or code tags) and asserts the tagged commit is an ancestor of `origin/main`; the `release` environment has a matching deployment-tag policy
- [ ] Three jobs: **build** with `contents: read`, no caches; **attest**, which only downloads the artifacts and attests them by digest, holding `id-token: write` and `attestations: write`; **publish** in the `release` environment with required maintainer reviewers, holding the only `contents: write` token, creating a **draft** release that a maintainer publishes (Q7)
- [ ] Actions in **both** `ci.yml` and `release.yml` pinned by SHA; immutable releases turned on (verified by docs-researcher); `gh attestation verify` documented
- [ ] **Code ownership (Q-AN3, Q-AP4):** CODEOWNERS makes maintainer-owned: `.github/**` (including `CODEOWNERS` and both workflows), `package.json`, `package-lock.json`, `electron.vite.config.ts`, `electron-builder.yml`, `build/**`, `scripts/**`, `bench/freeze/**`, the maintainer keys file, `resources/samples/**`, `src/main/storage/**`, `src/shared/storage/**` and `src/main/diagnostics/**`; the existing `scripts/check-repo-settings.mjs` (D-041) is **extended** to assert code-owner review with no bypass, the tag ruleset and the `release` environment; the release checklist **diffs `.github/**` and packaging paths since the last release**
- [ ] Versioning and the release checklist (Q8); `docs/RELEASING.md`

### P23-09 Diagnostics (Q6, Q-AK7)

- [ ] A zod `Diagnostics` schema of **allowlisted fields only**: versions, key-present booleans, error-class enums and codes, timings, and root tokens from an enum instead of any path; never message text; the last 20 errors; the log capped at 1 MB and rotated, and it never fails on a full disk
- [ ] **Main writes the clipboard** (Electron `clipboard`); the payload never crosses IPC to the renderer
- [ ] A canary test plants a fake key, a cell value, a column name, a username and a dataset file name in **each error source**: main, both MCP server families (stderr), the compute host, `claude.exe` stderr, OpenAI SDK errors, renderer crashes and DuckDB errors (which quote values); none may appear

### P23-10 Upgrade and migration smoke

- [ ] Baseline: the **Phase 9 merge commit (`2e0040b`)** built in CI as the "previous release" (no tag or published installer exists) (Q-AN5); it has no analyses, so its fixtures are the **catalog, settings, keys, artifacts and appearance**; install the **unfused, unpublished v1.0 installer** over it and reopen through Playwright; then v1.0 opens fixtures of every v1.0 store stamped `schemaVersion + 1` and must treat them as read-only (NFR-18)

## 4. Deliverable Map

| Deliverable | File path                                                                                                                                                                                                          | Produced by | Satisfies              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------- |
| D23-0       | Pre-freeze changes by path (P23-00); the P23-00 D-NNN amending P22's path list; tree-hash CI step                                                                                                                  | P23-00      | EC23-1, EC23-2, EC23-4 |
| D23-1       | `electron-builder.yml`, `scripts/smoke-packaged.mjs`, `scripts/verify-fused.mjs`, `scripts/bundle-diff.mjs` with `scripts/guarded-modules.json`; fuse and integrity D-NNNs; `docs/ARCHITECTURE.md` security layers | P23-01, 08  | EC23-1, DoD-3          |
| D23-2       | `src/main/storage/` (`StorageService`); `src/shared/storage/storageRoots.ts`; `src/renderer/src/views/storage/`; D-NNN amending D-029 and D-043                                                                    | P23-03      | EC23-4                 |
| D23-3       | `src/renderer/src/views/onboarding/`; `resources/samples/` with `manifest.json`; `scripts/make-ab-sample.mjs`                                                                                                      | P23-04      | EC23-2                 |
| D23-4       | `README.md`, `docs/media/`, `scripts/readme-results.mjs`                                                                                                                                                           | P23-05      | EC23-3                 |
| D23-5       | `.github/workflows/release.yml`, SHA pins in `ci.yml`, `docs/RELEASING.md`, tag ruleset, `CODEOWNERS`, the extended `scripts/check-repo-settings.mjs`                                                              | P23-07      | EC23-5                 |
| D23-6       | `docs/ds/fresh-machine.md`; roadmap P23-06 D-NNN                                                                                                                                                                   | P23-06      | EC23-2                 |
| D23-7       | `src/main/diagnostics/`                                                                                                                                                                                            | P23-09      | EC23-4                 |
| D23-8       | upgrade steps in `scripts/smoke-packaged.mjs`                                                                                                                                                                      | P23-10      | EC23-4                 |

## 5. Exit Checklist

| EC / DoD | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Evidence                    | State |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----- |
| EC23-1   | The full DS task with the fake provider passes on the **bench-flavour asar of the same commit**, and the source-mapped bundle diff touches only listed guarded modules; on the **release asar**: the hook-free smoke, the escape suite (M-11 = 0), no sentinel strings, the fused-exe verification, the tampered-asar (main and RunAsNode child) and tampered-Pyodide tests, the asar-hash and fuse-bytes-only checks, size limits, and a **recomputed tree hash equal to the signed freeze tag's** | CI, `bench/results/escape/` | Open  |
| EC23-2   | The fresh-machine test passes by P23-06's rule on Windows 10 and 11                                                                                                                                                                                                                                                                                                                                                                                                                                 | `docs/ds/fresh-machine.md`  | Open  |
| EC23-3   | The README results block equals the generator's output from P22's aggregates (with waivers and pinned ids)                                                                                                                                                                                                                                                                                                                                                                                          | CI                          | Open  |
| EC23-4   | Storage containment, race, resume and crash-sweep tests; the diagnostics canary; upgrade and newer-file read-only tests pass                                                                                                                                                                                                                                                                                                                                                                        | tests, packaged smoke       | Open  |
| EC23-5   | `check-repo-settings.mjs` confirms code-owner review, the tag ruleset and the protected environment; a dry-run release from a non-`main` commit or an rc tag is refused; a release from `main` produces a draft with attestations                                                                                                                                                                                                                                                                   | CI                          | Open  |
| DoD 1–8  | As roadmap §17; all apply (DoD-4's M-11 on the release build; DoD-6's risk review covers R-20..R-23)                                                                                                                                                                                                                                                                                                                                                                                                | —                           | Open  |

## 6. Phase Risks

| Risk                                                   | Mitigation                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| A fuse change breaks `datadesk-mcp` (RunAsNode)        | Fused-exe MCP `initialize` over stdio                                                                                    |
| Hardening changes behaviour after the freeze           | P23-00 before the code rc; tree hash recomputed from the signed freeze tag                                               |
| A tampered installer is published (R-22)               | Tag ruleset, protected `release` environment, maintainer-owned workflow, packaging and freeze paths, separate attest job |
| Deletion removes user files or misses user data (R-23) | Owner-side deletes, one roots table, id-derived paths, containment, resumable markers, main-side confirmation            |
| Antivirus flags the new runtime                        | README guidance; checksums; signing in v1.x                                                                              |

## 7. Hand-off

- v1.0 release; v1.x backlog (signing, SQL databases, text columns, scheduled runs, simplification proposals from P22)
