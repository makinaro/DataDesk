# P13 Plan: Compute Sandbox Spike (gate)

| Field     | Value                                                                                                                                                                                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase     | P13 of P10–P23 (roadmap §10)                                                                                                                                                                                                                                                                                                            |
| Milestone | M1 Foundation                                                                                                                                                                                                                                                                                                                           |
| Objective | Prove a sandbox that is safe, fast enough and has the packages, or decide to fall back to CPython                                                                                                                                                                                                                                       |
| Entry     | P11 closed (signed off and merged): ADR-01, ADR-02 and ADR-11 accepted; `docs/ds/03` and `docs/ds/08` exist                                                                                                                                                                                                                             |
| Size      | L (6–7 sessions)                                                                                                                                                                                                                                                                                                                        |
| Spend     | $0 (no model calls)                                                                                                                                                                                                                                                                                                                     |
| Branch    | `phase-13-sandbox`                                                                                                                                                                                                                                                                                                                      |
| Inputs    | ADR-01/02/11, `docs/ds/03-sandbox-and-data-policy.md`, `docs/ds/08-threat-model.md` · P10 Q8–Q10, Q45 · P11 Q1–Q2                                                                                                                                                                                                                       |
| Outputs   | D13-1 compute host and lease manager in main (`src/main/compute/`) · D13-2 escape suite (`tests/e2e/sandbox-escape.spec.ts`) and its result file · D13-3 perf report (`docs/ds/p13-spike.md`) · D13-4 `scripts/fetch-pyodide.mjs` + integrity manifest · D13-5 child-process network guard · D13-6 D-NNNs: go/no-go, compute CSP waiver |
| Status    | Audited (3 rounds, `P13-audit.md`); all findings fixed; maintainer defaults pending (Q-H, Q-I, Q-M); awaiting sign-off                                                                                                                                                                                                                  |

**Rule for the phase:** a spike with production-quality isolation. The host may be rough, but

**CLAUDE.md rule 2 (Q-M1):** a D-NNN can't waive a CLAUDE.md rule. The PR that ships the compute CSP also amends rule 2's wording (for example "the UI CSP, or the compute CSP variant, both from `csp.ts`"), which the maintainer approves; the D-NNN records why.
its security settings, its channel to main and its tests are final. No agent tools yet;
`run_python` is P14.

**Trust boundary (P13 audit Q-H1, round 2):** Python owns the whole worker realm through the
`js` FFI, so **nothing in the window or worker is trusted.** The window holds a minimal sandboxed
preload exposing exactly two functions (receive an execution request, send a result chunk), which
rejects any chunk over 256 KB before sending; main destroys the window on any oversize or
malformed message. Every message is zod-validated in main, checked against the sender frame and
bound to the lease's `webContents.id` (rule 3). The execution nonce is a **staleness and
correlation id**, not an authenticator (it is delivered into the realm Python owns). Status,
timing, memory and denials come **only from main's own observations**, never from the window.

The channel has **two typed classes** (Q-I2):

- **Model-bound output:** a typed envelope (stdout lines, a structured result, a traceback). Main
  stops at 1 MB of raw output per execution (status `output_cap`). A pure
  `applyCaps(envelope, budgetSnapshot) → { modelView, spent, rowsCounted }` owns **every
  per-envelope cap**: 8 KB (D-039), 2 KB and 20 lines of stdout, 1 KB tracebacks, 200-character
  cells, and the **structural row count** with the 20-rows-per-call cap (D-033). The cross-call
  and per-analysis totals (200 rows, 48 KB) belong to P14-00's controller (Q-I1, Q-M round 3).
  The compute channels are registered in `src/shared/ipc/contract.ts` by importing their schemas
  from `src/shared/ds/` (rule 3).
- **Artifacts:** Parquet, pickles and predictions, streamed to main with their own byte caps (the
  2 GB per-analysis cap, extended from D-043 to every artifact by a D-NNN; 64 MB per predictions
  file), staged in a temp file under the analysis folder, hashed, and **committed by atomic rename,
  only by main**; a kill or ENOSPC mid-stream deletes the stage (status `artifact_failed`). Never
  routed to the model.

---

## 1. Inherited Decisions and Inputs

| Source                  | What it forces in P13                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P11 Q1                  | Main's controller leases one hidden sandboxed window per analysis; at most 5 windows: 3 analysis leases, 1 evaluation slot and 1 parse slot (P13 audit); 4 GB free-memory floor; 60 s queue; idle release at 10 min |
| P11 Q2, ADR-11          | Data arrives as Parquet bytes written read-only into Pyodide's memory filesystem; test data never reaches an analysis kernel                                                                                        |
| P10 Q8, D-031           | Python on ≤ 50M cells and ≤ 200 columns; above either, a DuckDB stratified sample                                                                                                                                   |
| P10 Q9                  | NumPy, pandas, SciPy, statsmodels, scikit-learn (+ dependency closure), pyarrow or a fallback; ≤ 200 MB growth on disk                                                                                              |
| P10 Q10, D-031          | 120 s per execution; a warning on > 500 MB memory growth, hard kill at 2 GB (P11 Q-D3 maintainer answer, amends D-031), measured by the host; 8 KB to the model                                                     |
| D-035                   | Tuning: ≤ 100 s per search, ≤ 4 searches in the 8-minute box                                                                                                                                                        |
| P10 Q45                 | Hashes of the bundled runtime pinned at build and verified at load (P13-09)                                                                                                                                         |
| CLAUDE.md rules 2, 3, 5 | Every window hardened (the compute CSP needs a D-NNN waiver); typed, validated messages; child environments built explicitly                                                                                        |
| Audit A-08              | The child-process network guard, carried since Phase 0                                                                                                                                                              |

## 2. Session Plan

| Session | Work items     | Output                                                                                                                                       |
| ------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | P13-01, P13-09 | Verified Pyodide and Electron facts; fetch script with committed hashes; integrity manifest                                                  |
| 2       | P13-02, P13-10 | Hidden host, channel ADR and preload, partition pool, permission handlers, window registry; **compute CSP waiver D-NNN recorded now** (Q-I7) |
| 3       | P13-04, P13-11 | Limits and escalation; lease manager; evaluation-kernel variant                                                                              |
| 4       | P13-03, P13-07 | Escape suite with canaries and result file; network guard for children                                                                       |
| 5       | P13-05, P13-06 | Perf on the committed workload spec, Pyodide and CPython on the same runner; packaged size, cold start and offline start                     |
| 6       | P13-08, audit  | Go/no-go D-NNN, version hand-off to `bench/env`; P13 summary                                                                                 |

## 3. Work Item Breakdown

### P13-01 Verify Pyodide and Electron facts

- [ ] docs-researcher: current Pyodide release, the package list and versions (scikit-learn, statsmodels, SciPy, pandas, pyarrow) and their dependency closure, `HalvingRandomSearchCV` availability, Chromium compatibility for Electron 44 (Q10)
- [ ] docs-researcher (Electron 44.5.1): `session.protocol.handle` and `protocol.unhandle` per partition; whether a `session.fromPartition` session can ever be released; whether `clearStorageData` clears OPFS on in-memory partitions; whether `registerSchemesAsPrivileged` privileges are needed for workers from a custom scheme (the `compute` scheme joins the **single existing call** in `appProtocol.ts`, before `ready`); `getAppMetrics()` fields on Windows (`privateBytes`, `cpu`); host-resolver rules for a DNS canary; `NODE_OPTIONS` and fuse behaviour in packaged apps; whether pandas can read Parquet without pyarrow (fastparquet) in the chosen Pyodide release (Q5 rule 2)
- [ ] The **Python minor version and the library versions** found are recorded in ADR-01; they are handed over **once, at P13-08** (Q-H8, Q-M6)

**Done when:** every fact the host relies on is cited with version and URL in ADR-01's addendum.

### P13-02 Hidden compute host

- [ ] `BrowserWindow`: `show: false`, `sandbox: true`, `contextIsolation: true`, no Node, the minimal preload (trust boundary above), the compute CSP variant in `src/main/security/csp.ts` (`default-src 'none'` plus what loading needs, `connect-src` and `worker-src` limited to `compute:`), all `webRequest` denied except the `compute://` scheme, navigation and new windows denied
- [ ] **A bounded pool of 8 in-memory partition names** (never `persist:`): a lease takes a partition that has been cleared (`clearStorageData`, `clearCache`), had its protocol handler removed with `protocol.unhandle` and reinstalled, and had its `webRequest` filter and **deny-all permission request, check and device handlers** re-armed before the first load. A soak test of 200 leases checks main's `privateBytes` grows by **< 50 MB** (Q-H2 superseded by Q-I5)
- [ ] The `compute://` handler builds each file path from the manifest entry, never from the URL
- [ ] Pyodide in a Web Worker inside that window, which keeps the window's relay responsive; **no interrupt buffer, no `SharedArrayBuffer` and no COOP/COEP** (a timeout always destroys the window, so the interrupt served nothing; Q-M2)
- [ ] **A window registry** separates UI windows from compute windows; a lint rule bans `BrowserWindow.getAllWindows()` outside the registry, so every broadcast (agent and compare events, theme repaint) and `window-all-closed`/`second-instance` use UI windows only; quitting the app destroys every compute window
- [ ] Compute contents **override** the app-wide handlers from `hardenApp.ts`: `setWindowOpenHandler` denies without `shell.openExternal`, `will-navigate` denies everything, and `will-download` is denied on every compute partition
- [ ] **A kernel restart** (`restart_kernel`, the split restart, a timeout) **always destroys the window** and takes a fresh partition from the pool, so no storage (IndexedDB, Cache, OPFS) survives a restart (Q-I5)

**Done when:** a host boots, runs `import numpy`, and the registry tests pass.

### P13-03 Escape suite

- [ ] **Allowlist assertion first:** enumerate own and prototype-chain property names of the worker's `globalThis` to depth 2, plus `navigator.*`, and compare them with ADR-01's expected set; any extra capability fails the suite
- [ ] Cases: `RTCPeerConnection`, `sendBeacon`, `EventSource`, `WebTransport`, `BroadcastChannel`, IndexedDB, Cache storage and **OPFS** (`navigator.storage.getDirectory()`) **across leases, restarts and pool recycles**, nested `blob:`/`data:` workers, `navigator.gpu`, `pyodide.http`, `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `micropip`, `os`/`subprocess`, `window.open`, navigation, stale or foreign nonces, oversized and malformed messages, `Atomics.wait` and busy loops, `KeyboardInterrupt` swallowing, memory bombs, oversized output (Q3); the UI's IPC router refuses compute senders
- [ ] `window.open` and navigation cases run from the **window realm** (a worker has none), through a test-only hook in the window script
- [ ] Evaluation-kernel cases: the error-class enum is enforced (free text never returned); the predictions shape and size are checked; a hostile pickle's `__reduce__` can't reach the network, storage or the analysis kernel's partition
- [ ] **Canaries with a positive control on the same network path:** local TCP, UDP and DNS canaries record per-origin tokens; they must see **0 hits from the sandbox** and **≥ 1 hit from a control window** in the same app process, on a control partition without the deny filters, issuing the same request kinds (Q-M round 3, F2)
- [ ] The suite writes **`bench/results/escape/<build-kind>-<sha>.json`** (build kind `dev` or `packaged`; case, outcome, canary tokens, expected case count) atomically, and the file is **committed** for every SHA that a gate or bench run uses; a missing case counts as a failure. **M-11 is per build:** the P12 runner refuses a run with no result for its exact SHA and build kind and copies the file into the run directory (roadmap §7.1 and DoD-4 amended, Q-M7)

**Done when:** EC13-1 passes in dev and packaged builds.

### P13-04 Limits

- [ ] Timeout (Q2, Q-M2): at 120 s main destroys the window (status `timeout`); the next execution gets a fresh partition from the pool
- [ ] Memory (Q9): poll `privateBytes` and `cpu` every 250 ms; a warning when growth since the execution's start exceeds 500 MB (D-031) goes into the envelope's main-added `warnings` and the journal; hard kill at 2 GB (P11 Q-D3 maintainer answer, amends D-031). The 4 GB free-memory floor is checked at lease time **and on every poll**; below 1 GB free during execution, main kills the largest kernel (status `memory`)
- [ ] Every outcome maps to a status main can journal: `ok`, `error`, `timeout`, `memory`, `output_cap`, `artifact_failed`, `host_crashed` (`render-process-gone`), `unavailable` (boot or integrity failure), `aborted` (an execution orphaned by a main crash, P11-03), `compute_busy`
- [ ] **Denial log:** only **main-side** handlers (`webRequest`, permission, navigation, new-window) report events, labelled as **attempts** (a signal, never M-11's numerator); CSP blocks inside the renderer aren't visible to main and aren't claimed

**Done when:** each status has a test that produces it.

### P13-05 Performance

- [ ] **A workload spec committed and reviewed by a non-author before session 5** (`docs/ds/p13-workloads.md`): seeded tables (1M × 50 and 250k × 200, plus **25M-cell variants** of both); groupby; OLS (statsmodels); logistic regression (`lbfgs`, `max_iter=200`); HistGradientBoosting; random forest (`n_estimators=100`, `max_depth=12`); ETS (weekly seasonality, 10-year daily series); halving search (HistGradientBoosting, a 12-point grid, 3 folds) on the 200k sample; thresholds for every table; the **run count (3) declared in advance**
- [ ] Gate: each search ≤ 100 s and **4 searches measured back to back within 8 minutes** (D-035); peak memory per operation. A CI job emits a JSON results file (run URL, SHA, **runner image version**); `docs/ds/p13-spike.md` is generated from it. The go/no-go D-NNN cites **every** perf-job run for the gating SHA, so a re-trigger after a near miss is visible (D-036's no-optional-stopping rule)
- [ ] **One ordered go/no-go rule**, written into `docs/ds/03` by P13-08 (Q-M4): (1) an escape not fixable in the phase → no-go; (2) a missing essential package → no-go; (3) the spec passes at 50M cells → go; (4) else it passes at 25M → go, with D-031's cell limit amended to 25M; (5) else, if CPython passes the 50M spec on the same runner → no-go (P13b); (6) else the thresholds go to the maintainer as a re-baselining D-NNN
- [ ] Reference machine: CI runner image **`windows-2025`** (pinned), median of 3
- [ ] Cold start per lease (Pyodide boot, package loads, wasm compile without a code cache, per-lease integrity re-hash) **≤ 20 s** on the reference runner, for analysis and evaluation kernels
- [ ] Per-lease hashing (about 200 MB) and artifact-chunk validation run off main's event loop (async hashing in a worker thread), so the UI stays responsive

**Done when:** the report lists every workload with its parameters, time and peak memory.

### P13-06 Packaging

- [ ] **Installer growth ≤ 200 MB** (D-031), installed size reported; offline first start in the packaged app with the network disabled; `asarUnpack` needs. Q5's "installer over 200 MB → trim packages, not a fallback" amends P10 Q9's revisit rule and is recorded in the go/no-go D-NNN

**Done when:** EC13-3's packaged smoke passes.

### P13-07 Network guard for children

- [ ] Test children inherit the network guard through an **injected parameter** of the env builder, never an env passthrough (rule 5); the guard also blocks `dgram`; whether the packaged app honours `NODE_OPTIONS` is verified by docs-researcher before any production claim (Q7)

**Done when:** a test child's socket, `fetch` and `dgram` attempts all throw.

### P13-08 Go/no-go

- [ ] Apply the ordered rule (P13-05) and record the go/no-go D-NNN, which finalises the gate EC13-2 binds to
- [ ] **Key recompute hand-off (Q-M6):** a maintainer recomputes the answer keys under `bench/env` pinned to the chosen host's versions and re-commits the dev key manifest and the salted holdout commitments **before P14's gate run**
- [ ] **On a no-go, P13 stops at the D-NNN:** the CPython host and its native AppContainer launcher become a separate phase (P13b, sized M (3–5 sessions)) before P14 (Q-H6)

### P13-12 CPython reference host for the perf comparison (added by the P13 audit)

- [ ] A pinned python-build-standalone CPython with the same library versions as the Pyodide release, `OMP_NUM_THREADS=1`, provisioned on the same CI runner image; runs only the perf spec (not a product host)

**Done when:** the perf job emits CPython results beside Pyodide's.

**Done when:** EC13-4 holds.

### P13-09 Runtime integrity (added by P10 Q45)

- [ ] SHA-256 per file is **committed in the fetch script and reviewed**, never derived from the downloaded `pyodide-lock.json`; the build writes the manifest; for each lease main reads each file once, hashes it and serves **that buffer** (no read-after-check gap; no 200 MB resident cache); the re-hash counts in cold start. Until asar integrity (P23-08), this detects corruption, not deliberate tampering (Q8)

**Done when:** a tampered file is refused and the host reports `unavailable`.

### P13-10 Channel ADR (added by the P13 audit)

- [ ] ADR-01 addendum: the preload's two functions and its chunk-size check, the envelope and artifact schemas in `src/shared/ds/` (P11-09), nonce and `webContents.id` binding, the 1 MB model-output stop, and the pure `applyCaps` handed to P14-00

**Done when:** EC13-5 passes.

### P13-11 Lease manager and evaluation kernel (added by the P13 audit)

- [ ] The lease manager: **3 analysis leases plus 1 reserved evaluation slot** (P11 Q1), 4 GB free-memory floor, 60 s queue, idle release, the partition pool; tests cover the 3 + 1 split; handed to P14-00 by name
- [ ] The **evaluation-kernel variant** (Q-H7): same host, no agent execution channel, a predict-only harness, returns predictions to main or an error class only; its own escape cases in P13-03
- [ ] A **parse-kernel variant** (Q-M3): no data inputs and no agent code, runs Python's `ast` and constant folding for P14-03's literal and monkeypatch heuristics; its own slot (≤ 5 windows in total: 3 analysis, 1 evaluation, 1 parse), so provenance jobs never queue `evaluate_on_test`
- [ ] A **forecast-harness variant** (amended by the P18 audit): fit-capable, code only, receives a train history, horizon timestamps and declared regressor values, never horizon actuals; used for `backtest`, forecast evaluation and the refit; shares the evaluation slot; its own escape cases
- [ ] A **CV-harness variant** (amended by the P17 audit): fit-capable, **builds the pipeline from a declarative spec and loads no pickle**, holds only one outer fold's rows, no agent execution channel, returns predictions or an error class; used for nested CV when n < 1,000; shares the evaluation slot; its own escape cases
- [ ] (Removed by the P13 audit: the notebook re-run entry point belongs to P21)

**Done when:** lease-manager tests cover the cap, the floor, the queue timeout and idle release.

## 4. Deliverable Map

| Deliverable | File path                                                                                                        | Produced by        | Satisfies      |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ | -------------- |
| D13-1       | `src/main/compute/`                                                                                              | P13-02, 04, 10, 11 | EC13-1, EC13-5 |
| D13-2       | `tests/e2e/sandbox-escape.spec.ts`, `bench/results/escape/<build-kind>-<sha>.json`                               | P13-03             | EC13-1         |
| D13-3       | `docs/ds/p13-workloads.md`, the CI perf JSON, `docs/ds/p13-spike.md` (generated)                                 | P13-05, 06, 12     | EC13-2, EC13-3 |
| D13-4       | `scripts/fetch-pyodide.mjs`, `resources/pyodide.manifest.json`                                                   | P13-01, 09         | EC13-3         |
| D13-5       | `tests/setup/` guard for children                                                                                | P13-07             | DoD-2          |
| D13-6       | `DECISIONS.md` D-NNNs: compute CSP with the CLAUDE.md rule 2 amendment (session 2, P13-02/10); go/no-go (P13-08) | P13-02, 10, 08     | EC13-4         |

## 5. Exit Checklist

| EC / DoD | Check                                                                                                                                                                                                                               | Evidence                           | State |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----- |
| EC13-1   | Escape suite: 0 escapes, 0 canary hits from the sandbox and ≥ 1 from the control client per canary (M-11), in dev and packaged builds; result file with the expected case count                                                     | CI artifact                        | Open  |
| EC13-2   | Performance within the gate **as finalised by the go/no-go D-NNN**, on the committed spec with its declared run count; CPython measured on the same runner; cold start ≤ 20 s                                                       | `docs/ds/p13-spike.md` (generated) | Open  |
| EC13-3   | Every required package imports **and runs a smoke computation** (BLAS, halving search, ETS) offline in the packaged app; integrity verified; installer growth ≤ 200 MB                                                              | packaged smoke                     | Open  |
| EC13-4   | Go/no-go and compute CSP D-NNNs recorded                                                                                                                                                                                            | `DECISIONS.md`                     | Open  |
| EC13-5   | Per-output caps hold in main: a hostile worker that skips every in-window limit still gets each per-output D-033 cap and the 1 MB stop applied by `applyCaps`; oversize chunks destroy the window (per-analysis budgets are EC14-6) | unit + e2e                         | Open  |
| DoD 1–8  | As roadmap §17                                                                                                                                                                                                                      | —                                  | Open  |

## 6. Phase Risks

| Risk                                                    | Mitigation                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| FFI reaches a capability the escape suite missed (R-01) | Allowlist assertion, canaries, and a code-reviewer pass on the host settings |
| Too slow (R-02)                                         | Fallback rule (Q5): reduce the data size first, then a no-go and P13b        |
| Package missing (R-03)                                  | P13-01 first, before building anything                                       |
| Pyodide needs `SharedArrayBuffer` after all             | Re-add COOP/COEP only with a D-NNN; the timeout path doesn't depend on it    |
| Hidden windows break app lifecycle                      | Window registry (P13-02) with tests                                          |

## 7. Hand-off to P14

- The compute host API (`execute(code, inputs, limits, nonce) → bounded result`), its statuses and the denial log
- The lease manager and the evaluation-kernel variant (P14-00)
- The escape suite and its result file, which run in every later phase's e2e
- Perf numbers for re-baselining NFR-10, M-10, DS-08 and P10 Q17's tuning box; the Pyodide package versions for `bench/env`
