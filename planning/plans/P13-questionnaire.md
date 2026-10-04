# P13 Questionnaire: Decisions Needed Before the Compute Sandbox Spike

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle how the sandbox is built and what counts as passing the gate                                                          |
| Already decided | DS-02 and D-030..D-045 (draft, `planning/decisions-draft.md`); P10 Q8–Q10, Q45; P11 Q1–Q2 (audited)                          |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation |

---

## A. Host Design

**Q1. How are the Pyodide assets served to the hidden window?**
_Blocks: P13-02, P13-06._

> **Recommendation (Claude):** From `resources/pyodide/` (shipped via `extraResources`) through
> the existing `app://` protocol handler, with a path allowlist.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** A **dedicated `compute://` scheme registered only on the compute window's own session partition** (`session.protocol.handle`), serving `resources/pyodide/` (via `extraResources`) from an allowlist of manifest paths. Its responses carry the compute window's own CSP, which allows `'wasm-unsafe-eval'` if Pyodide needs it (verify in P13-01), and COOP/COEP headers for Q2. The UI's `app://` origin and CSP stay unchanged.
>
> **Why:** Serving Pyodide through `app://` would give the compute window the **same origin** as the main UI, sharing origin-scoped storage and forcing one CSP for both. Pyodide likely needs WebAssembly compilation that the UI's strict CSP rightly forbids (D-016's no-eval rule). A separate scheme on a separate partition keeps the UI's CSP strict and means the UI session can't even load compute assets.
>
> **Rejected:** `app://` with a path allowlist (shared origin and CSP); `file://` (rejected by D-007 for the same reasons).
>
> **Recommendation was:** overturned (separate scheme and partition, with its own CSP).
>
> **Consequences:** P13-02; `src/main/security/` gains a compute CSP builder next to `csp.ts`; e2e asserts the UI CSP is unchanged.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** `registerSchemesAsPrivileged` is app-wide; only the handler is per session. Each lease gets a **fresh in-memory partition** with the handler, `webRequest` filter and deny-all permission request, check and device handlers installed before the first load (Q-H2). File paths come from manifest entries, never from the URL (`%5c`, 8.3 names and `::$DATA` can't reach a file). The compute CSP lives in `src/main/security/csp.ts` and needs a D-NNN waiver of rule 2 for `'wasm-unsafe-eval'` (and `'unsafe-eval'` only if P13-01 proves Pyodide needs it) (Q-H3).
>
> **Audit resolution, round 2 (2026-10-03):** Partitions come from a **bounded pool of 8**, cleared and re-armed before reuse, because a `session.fromPartition` session may never be released (verify; soak test of 200 leases). The `compute` scheme joins the single existing `registerSchemesAsPrivileged` call. The CSP waiver D-NNN is recorded in session 2, when the CSP ships, with a test that asserts the CSP string (Q-I7).
>
> **Audit resolution, round 3 (2026-10-03):** Rule 2 is amended in CLAUDE.md itself, in the PR that ships the compute CSP; a D-NNN can't waive a CLAUDE.md rule (Q-M1). Q-H2's "fresh partition per window" is superseded by the pool; compute contents override the app-wide open, navigate and download handlers.

**Q2. Does Python run on the window's main thread or in a Web Worker?**
_Blocks: P13-02, P13-04._

> **Recommendation (Claude):** In a Web Worker, with Pyodide's interrupt buffer so a long
> execution can be stopped without killing the window; the window kill is the fallback.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** A Web Worker inside the hidden window, with Pyodide's interrupt buffer on a `SharedArrayBuffer`. That requires cross-origin isolation, which the `compute://` handler provides through COOP/COEP headers (Q1). The order of escalation is: interrupt at 120 s → 5 s grace → terminate the worker → if unresponsive, destroy the window. Every step is journalled.
>
> **Why:** An interrupt keeps the kernel's state (Q6) after a runaway loop, whereas killing the window loses it. SharedArrayBuffer is the only interrupt path, and owning the protocol handler lets us set the headers. The staged escalation means a hung host is always reclaimed.
>
> **Rejected:** the main thread (no interrupt without freezing the window, and kill is the only option); worker without SAB (no interrupt).
>
> **Recommendation was:** refined (isolation headers and a staged escalation).
>
> **Consequences:** P13-04 tests each escalation step.
>
> **Revisit if:** COOP/COEP break Pyodide's package loading (then window kill only, with state loss documented).
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** "If unresponsive" means no heartbeat within 2 s after the worker is terminated. The interrupt buffer doesn't stop native loops or code that swallows `KeyboardInterrupt`; the terminate step handles both, and both are escape cases. The host reports each step to main as an event; main's controller journals it (P14).
>
> **Audit resolution, round 2 (2026-10-03):** Superseded: after the 5 s grace, main **always destroys the window**; no heartbeat from the window decides survival, since the window is untrusted. A kernel restart is always a new window and a fresh partition from the pool.
>
> **Audit resolution, round 3 (2026-10-03):** Superseding earlier lines: a timeout **always destroys the window**, so the interrupt buffer, `SharedArrayBuffer` and COOP/COEP are dropped; the worker stays only to keep the window's relay responsive (Q-M2).

**Q6. Does Python keep its state between executions?** (a) stateful per analysis, like a
notebook kernel; (b) fresh per execution, reloading inputs each time.
_Blocks: P13-02, P14-01, P21-01, M-05._

> **Recommendation (Claude):** (a) stateful per analysis, with a restart tool. The notebook export
> replays the successful executions in order.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** (a) stateful per analysis, with a `restart_kernel` tool. The journal records every execution, **including failed ones and kernel restarts** (by the agent, by a memory kill or by a timeout). The notebook export replays the **exact journal sequence**: failed cells are wrapped in `try/except` that reprints the original error, and restarts become a "kernel restart" cell boundary. Replaying only the successful cells is rejected.
>
> **Why:** A failed cell can change state partway (a dataframe half-modified) before raising. A replay that skips it diverges from what the agent actually computed, and M-05 would fail or, worse, pass with different numbers. Replaying the exact sequence, failures included, is the only faithful reconstruction. Stateful execution avoids re-loading 400 MB per call.
>
> **Rejected:** (b) fresh per execution (reloads big inputs every call, so it is slow and costly in wall clock); replaying successful cells only (unfaithful).
>
> **Recommendation was:** refined (exact-sequence replay instead of successful cells only).
>
> **Consequences:** P14-01 journal fields (`kernelEpoch`); P21-01 export; M-05 tests include a failing-cell scenario.
>
> **Revisit if:** exported notebooks become cluttered with failed cells (then offer a "clean" export that re-runs from scratch and verifies the numbers match).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The **export** part of this answer moves to P21: cells that failed or were blocked are exported **commented out** under a warning banner, never inside `try/except`, and every export gets a static danger scan (subprocess, sockets, file writes) (Q-H5). Statefulness stays. Kernel monkeypatching is a residual risk: a static `ast` check flags assignments or `setattr` on imported library modules and classes, and outputs of flagged executions aren't counted as provenanced. Interrupted and killed cells are exported as a restart boundary, since their partial state can't be reproduced.
>
> **Audit resolution, round 2 (2026-10-03):** Superseding the round-1 line: **failed** cells are exported executable (they ran in the sandbox, and skipping them breaks replay); only **blocked** cells, which never ran, are commented out; a danger scan runs on every cell (P21 §1 updated, Q-I3). The monkeypatch check moves to P14-03 as a documented heuristic.
>
> **Audit resolution, round 3 (2026-10-03):** Superseding the round-2 failed/blocked split: an **AST-based import allowlist** decides export safety (refined in P21 round 2 to a global call-name and builtin allowlist, P21 Q-AJ5); a cell failing it, or one in which main saw a denial attempt, is exported commented out whatever its status (P21 §1, Q-M5). The literal and monkeypatch heuristics run in a **parse-kernel** variant with its own slot (Q-M3).

## B. Gate

**Q3. Where does the escape suite run, and what counts as passing?**
_Blocks: P13-03, EC13-1._

> **Recommendation (Claude):** In the Playwright e2e suite against the dev build and in the
> packaged smoke. Passing means 0 escapes.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, plus: the suite runs in CI's e2e job on every PR (it already runs on windows-latest), **and** in the packaged smoke. Each case asserts the specific denial (not just "no crash"). The case list is derived from `docs/ds/08` and grows whenever the threat model gains a row.
>
> **Why:** Packaged builds differ (asar, protocol registration, partitions), so a dev-only pass isn't enough. Asserting the denial catches the case where an escape "fails" for an incidental reason that a later change could remove.
>
> **Rejected:** a manual red-team only (not repeatable); dev build only (misses packaging differences).
>
> **Recommendation was:** refined (denial assertions; a list tied to the threat model).
>
> **Consequences:** P13-03; every later phase adding a sandbox-facing feature adds cases.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Each case asserts the denial **and** a positive control: local TCP, UDP and DNS canaries must record 0 hits. The suite writes `test-results/sandbox-escape.json` for the scorer (M-11). "eval" is dropped as a case (the `js` FFI already equals arbitrary JS); the boundary is the allowlisted capability set.
>
> **Audit resolution, round 2 (2026-10-03):** Canaries get a **positive control**: an unsandboxed client must hit each one in the same run. The result goes to `bench/results/<phase>/sandbox-escape-<build>-<sha>.json` with the expected case count, and M-11 is defined per phase build. Main-side denials are logged as attempts, never as M-11's numerator (Q-I6).
>
> **Audit resolution, round 3 (2026-10-03):** Canaries record per-origin tokens; the positive control is a **control window in the same app process** on a partition without deny filters, so it uses Chromium's network path. Results are committed per build at `bench/results/escape/<build-kind>-<sha>.json`, and the P12 runner refuses a run without one for its exact SHA (Q-M7). `window.open` and navigation cases run from the window realm.

**Q4. What are the performance thresholds on 1M × 50?**
_Blocks: P13-05, EC13-2._

> **Recommendation (Claude):** Snapshot load ≤ 20 s, groupby ≤ 5 s, OLS ≤ 10 s, logistic regression
> ≤ 30 s, HistGradientBoosting ≤ 90 s, ETS ≤ 10 s, on a mid-range laptop.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Thresholds as recommended, but measured on the **CI `windows-latest` runner** as the reference machine (median of 3), with contributor laptops reported for information only. Add **random forest ≤ 60 s** (P10 Q16) and **tuning on the 200k sample within the 8-minute box** (P10 Q17). All are within the 120 s per-execution limit with margin.
>
> **Why:** "A mid-range laptop" isn't reproducible across contributors, so the gate would pass or fail depending on whose machine ran it. CI is the same hardware for everyone and is already where performance regressions would surface.
>
> **Rejected:** contributor laptops (irreproducible); no thresholds (the gate would mean nothing).
>
> **Recommendation was:** refined (reference machine; random forest and tuning added).
>
> **Consequences:** P13-05 runs as a CI job (manual trigger, to keep PR time down); NFR-10 is re-baselined from it.
>
> **Revisit if:** CI hardware changes noticeably (re-measure and re-baseline by D-NNN).
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Workloads are pinned with parameters and a seed (P13-05), including a 250k × 200 wide table; the runner is the pinned `windows-2025` image. Tuning follows D-035: each search ≤ 100 s, ≤ 4 searches in the 8-minute box.
>
> **Audit resolution, round 2 (2026-10-03):** Every workload parameter is in a spec committed and reviewed **before** measuring; both tables have thresholds; four searches are measured back to back; results come from a CI-emitted JSON file. CPython runs the same spec on the same runner, and the fallback applies only if CPython passes (Q-I4).
>
> **Audit resolution, round 3 (2026-10-03):** The spec declares its run count; the D-NNN cites every perf-job run for the gating SHA with the runner image version, so no near miss is re-run silently (D-036). 25M-cell variants are in the spec.

**Q5. What triggers the CPython fallback?**
_Blocks: P13-08._

> **Recommendation (Claude):** Any escape that can't be fixed, a missing essential package, or
> perf misses that a smaller data size can't fix.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The rules, in order: (1) **any escape not fixable within the phase → fallback** (non-negotiable); (2) a **missing essential package** (NumPy, pandas, SciPy, statsmodels, scikit-learn) → fallback, while missing pyarrow is **not** a trigger (fastparquet or Arrow IPC instead); (3) perf misses → first lower the Python size limit to 500k rows; if HistGradientBoosting at 500k still exceeds 120 s → fallback. Installer size over 200 MB → trim packages, not a fallback trigger (CPython would be bigger).
>
> **Why:** The recommendation didn't separate essential from optional packages or say what to try before falling back. An explicit order makes the go/no-go mechanical and stops a costly CPython switch for a fixable miss.
>
> **Rejected:** fallback on any miss (wasteful); "decide at the time" (unauditable).
>
> **Recommendation was:** refined (ordered, with essential packages listed).
>
> **Consequences:** P13-08 D-NNN cites the rule; P10 Q8's limit may change to 500k by D-NNN.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Rule (3) applies to every gated estimator, not only HistGradientBoosting, and the limit is expressed in cells (D-031): first lower to 25M cells; if any estimator still misses, the fallback applies. Lowering the limit amends D-031 through a D-NNN, and the sampling-disclosure check and affected keys follow. "CPython would be bigger" is a claim to verify, not a reason. On a no-go, P13 stops and the CPython host becomes phase P13b (Q-H6).
>
> **Audit resolution, round 2 (2026-10-03):** Installer growth over 200 MB → trim packages, not a fallback: this amends P10 Q9's revisit rule and is recorded in the go/no-go D-NNN.
>
> **Audit resolution, round 3 (2026-10-03):** Superseded by one ordered rule in `docs/ds/03` (P13-05): escape → no-go; missing essential package → no-go; pass at 50M → go; pass at 25M → go with D-031 amended; CPython passes at 50M on the same runner → no-go (P13b); otherwise a re-baselining D-NNN (Q-M4). Rule (2)'s "fastparquet or Arrow IPC" goes to docs-researcher.

## C. Supporting Work

**Q7. How do test child processes get the network guard?**
_Blocks: P13-07._

> **Recommendation (Claude):** Pass `NODE_OPTIONS=--import <guard>` in the explicitly built
> environment of children spawned by tests.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended for tests: test-spawned children get `NODE_OPTIONS=--import <guard>` in their explicitly built environment. This works because the build sets no Electron fuses (verified: nothing in `electron-builder.yml`). **Consequence for production:** with the `EnableNodeOptionsEnvironmentVariable` fuse at its default, the **packaged** app also honours `NODE_OPTIONS`, an injection path into a shipped app. P23 must flip that fuse (and `EnableNodeCliInspectArguments`) while keeping `RunAsNode`, which `datadesk-mcp` needs (D-003).
>
> **Why:** The test guard needs `NODE_OPTIONS`, while production should not accept it. Fuses are set per build, so both are possible, but only if production hardening is planned.
>
> **Rejected:** patching each child's entry point for tests (invasive); leaving fuses at their defaults in production (a hardening gap).
>
> **Recommendation was:** refined (fuse finding routed to P23).
>
> **Consequences:** P13-07; a new P23 hardening item with a packaged-smoke check that `NODE_OPTIONS` is ignored.
>
> **Revisit if:** Electron changes fuse defaults.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The claim that the packaged app honours `NODE_OPTIONS` is **unverified** and goes to docs-researcher (P13-01). The test seam is an injected parameter of the env builder, never an env passthrough (rule 5). The guard also blocks `dgram`. The compute host is a window, not a child, so P13-07 doesn't cover it; P13-03 does.

**Q8. How is the runtime's integrity verified?**
_Blocks: P13-09._

> **Recommendation (Claude):** The fetch script pins a version and the SHA-256 of every file; the
> build writes a manifest; main verifies the files once per launch before serving them.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended. The manifest lists every file with its SHA-256; the build fails if any file doesn't match. Main verifies each file **lazily on first request per launch** (cached result) instead of hashing everything at startup. A mismatch refuses that file and marks the compute host unavailable with a clear message.
>
> **Why:** Hashing about 200 MB at every launch adds startup time for files that may never load. Verifying on first request gives the same guarantee for everything actually served (NFR-09, P10 Q45).
>
> **Rejected:** startup hashing of all files (slow); build-time checking only (doesn't catch tampering after installation).
>
> **Recommendation was:** refined (lazy verification, failure behaviour).
>
> **Consequences:** P13-09; a test that a tampered file is refused.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Hashes are verified on the bytes served: main reads each file once into memory, hashes it and serves that buffer, so there's no read-after-check gap and nothing is served unhashed. Until asar integrity (P23-08), this detects corruption, not deliberate tampering; the claim is narrowed.

**Q9. How is memory measured?**
_Blocks: P13-04._

> **Recommendation (Claude):** Poll `app.getAppMetrics()` every 500 ms for the compute window's
> process.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Poll `app.getAppMetrics()` every 250 ms for the compute window's renderer process, which includes its worker, using `workingSetSize`. Soft limit 2 GB → the next output carries a memory warning; hard limit 3 GB → the Q2 escalation, starting with terminating the worker. The wasm32 address limit (4 GB) is the last line.
>
> **Why:** Pandas copies can grow memory by hundreds of MB within one operation, so 500 ms polling is too coarse to act before the window becomes unresponsive. 250 ms is still negligible overhead.
>
> **Rejected:** limits set inside Python (bypassable); 500 ms polling (too slow for wasm growth spikes).
>
> **Recommendation was:** refined (faster polling, soft-limit behaviour).
>
> **Consequences:** P13-04; a memory-bomb case in the escape suite proves the kill.
>
> **Revisit if:** polling shows measurable CPU cost.
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Superseded to follow D-031: poll **`privateBytes`** (working set can be trimmed under pressure); warn when growth since the execution's start high-water mark exceeds **500 MB** (wasm memory never shrinks); hard kill at 3 GB (Q-H4).

**Q10. How are Pyodide's version and packages pinned and fetched?**
_Blocks: P13-01._

> **Recommendation (Claude):** An exact version verified by docs-researcher; `npm run
pyodide:fetch` downloads it with SHA checks, like `duckdb:extensions`; not committed.

> **Answer Q10:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** As recommended, with the version pinned in `scripts/fetch-pyodide.mjs` and recorded in a D-NNN with its source URL. CI caches the fetched runtime keyed by that version (as it does for the DuckDB extensions). Only the packages named in P10 Q9 are fetched, never the full distribution.
>
> **Why:** This mirrors the proven `duckdb:extensions` pattern, so contributors learn one mechanism. Fetching only the named packages keeps both the download and the installer within budget.
>
> **Rejected:** committing the runtime (repo bloat); fetching from a CDN at runtime (NFR-09 offline rule).
>
> **Recommendation was:** kept (cache key and package subset spelled out).
>
> **Consequences:** P13-01; CI workflow cache step; `CONTRIBUTING.md` setup step.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** `fetch-duckdb-extensions.mjs` has no SHA pins, so the comparison was wrong. Pyodide's hashes are **committed in the fetch script and reviewed**, never derived from the downloaded `pyodide-lock.json`; the fetched set is the **dependency closure** of the named packages. The chosen versions are handed to `bench/env` (Q-H8).
>
> **Audit resolution, round 3 (2026-10-03):** The key recompute under the pinned `bench/env` is a P13-08 hand-off item done by a maintainer before P14's gate run (Q-M6).

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                            | Recommendation | Confidence | Needs maintainer |
| --- | ------------------------------------------------------------------------------ | -------------- | ---------- | ---------------- |
| Q1  | Separate `compute://` scheme on its own partition with its own CSP             | **overturned** | High       | no               |
| Q2  | Worker + interrupt buffer under COOP/COEP; staged escalation                   | refined        | Medium     | no               |
| Q6  | Stateful kernel; export replays the exact sequence incl. failures and restarts | refined        | High       | no               |
| Q3  | Escape suite in CI e2e and packaged smoke, asserting each denial               | refined        | High       | no               |
| Q4  | Thresholds measured on the CI runner; random forest and tuning added           | refined        | Medium     | no               |
| Q5  | Ordered fallback rules; pyarrow not essential                                  | refined        | High       | no               |
| Q7  | `NODE_OPTIONS` guard in tests; flip the NodeOptions fuse in P23                | refined        | Medium     | no               |
| Q8  | Manifest hashes; lazy verification on first request                            | refined        | High       | no               |
| Q9  | 250 ms polling; soft and hard limits                                           | refined        | Medium     | no               |
| Q10 | Pinned fetch script like DuckDB extensions; named packages only                | kept           | High       | no               |

**Totals:** 10 answered · 1 kept · 8 refined · 1 overturned · 0 need the maintainer.

**Overturned recommendations:**

- Q1: serving Pyodide through `app://` would put the compute window on the UI's origin and force one CSP onto both.

**For the maintainer:** none in this phase.

**Cross-question changes made in the consistency pass:**

- Q2's COOP/COEP headers depend on Q1's dedicated scheme.
- Q6's restarts include Q9's memory kills.
- Q7's fuse finding becomes a P23 hardening item.

**Facts verified:**

- In code: no Electron fuses are configured (`electron-builder.yml`).
- In code: `app://` is registered on the default session (`src/main/security/appProtocol.ts`).
- **To verify:** whether Pyodide needs `'wasm-unsafe-eval'` or `'unsafe-eval'` (P13-01).
- **To verify:** Pyodide behaviour under COOP/COEP (P13-02).

**After the P13 audit (2026-10-03):** every answer has an **Audit resolution** line; Q6's export rule moved to P21, and Q9 now follows D-031. Defaults pending the maintainer are Q-H1..Q-H9 in `P13-audit.md`.
