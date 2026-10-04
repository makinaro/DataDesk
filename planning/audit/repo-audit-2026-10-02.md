# DataDesk Repository Audit (2026-10-02)

| Field    | Value                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline | `main` at `2e0040b` (Phase 9 merged), audited from branch `plan/planning`                                                                                                              |
| Scope    | Source (`src/`), tests, `.claude/` tooling, CI, docs (`ROADMAP.md`, `DECISIONS.md` D-001..D-029, `docs/`), packaging                                                                   |
| Method   | Read the docs and decision log in full, read the security-relevant code paths, ran `npm run check`, compared against CLAUDE.md, and assessed readiness for the advanced-analysis track |
| Purpose  | (1) the health of what exists; (2) what blocks or shapes the advanced-analysis roadmap (`planning/roadmap.md`)                                                                         |

---

## 1. Verdict

**Healthy, well-documented and secure by design, but its analysis stops at SQL.** Phases 0–9 are
complete and merged. The codebase is small (~25.5k lines including tests), strictly typed, and
heavily tested. Security rules are enforced in code and backed by tests, not just written down.
There are **no Critical findings**. The Major findings are all about _capability_ (no Python,
no derived data, no answer-quality benchmark, no memory) plus one process conflict (auto-push).

| Area          | Rating  | One-line reason                                                                                                          |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| Security      | Strong  | Six CLAUDE.md rules enforced in code: isolation, zod IPC both ways, safeStorage, init guard, scope hook, read-only SQL   |
| Tests         | Strong  | `npm run check` green on 2026-10-02 (typecheck, lint, format, Vitest); 840 unit and 39 e2e tests per the Phase 9 summary |
| Documentation | Strong  | 29 decisions with context, alternatives and sources; per-phase summaries; learning log                                   |
| Architecture  | Good    | Clean process split; one scope table feeds both providers; MCP server reused by UI and agents                            |
| DS capability | Missing | SQL-only compute; see §4                                                                                                 |
| Process       | Good    | One phase per branch, conventional commits, reviewer agent; one conflict with contributors' personal push rules          |

---

## 2. Strengths (keep these)

| #   | Strength                                                                                                                                           | Evidence                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| S1  | Read-only SQL in three layers: statement type, `allowed_paths` + `enable_external_access=false` + `lock_configuration`, escape tests               | D-009; `src/mcp-server/fileAccess.ts`; `tests/mcp-server/fileAccess.test.ts` |
| S2  | Agent isolation: `settingSources: []`, isolated `CLAUDE_CONFIG_DIR`, plugin-only skills, and a `system:init` guard that aborts on unexpected tools | D-004, D-013; `src/main/agent/claude/initGuard.ts`                           |
| S3  | One scope table drives the sub-agent tools, the PreToolUse hook and the OpenAI agents-as-tools, so the layers cannot drift                         | D-017, D-021; `src/main/agent/claude/subagents.ts`                           |
| S4  | Keys never cross IPC; child environments are built explicitly; second-hop secrets blanked                                                          | D-014; `src/main/secrets/keyStore.ts`; `src/main/agent/claude/agentEnv.ts`   |
| S5  | Human approval for anything that brings data in (`register_dataset`, `load_hf_dataset`), failing closed on timeout                                 | D-010, D-020; `src/main/agent/approvals.ts`                                  |
| S6  | Data minimisation already in place: chart data never returns to the model; row caps; aggregates preferred                                          | `src/shared/artifacts.ts`; `eda-checklist` skill                             |
| S7  | Untrusted-data stance written into every sub-agent prompt                                                                                          | `UNTRUSTED` in `subagents.ts`                                                |
| S8  | Provider abstraction (`Orchestrator`) with real compare mode, which makes cross-provider DS evaluation cheap to add                                | D-021, D-022; `src/main/agent/compareRuntime.ts`                             |
| S9  | Packaged-app smoke and installer smoke, both on Windows                                                                                            | `scripts/smoke-packaged.mjs`; D-023                                          |
| S10 | A real network guard in unit tests                                                                                                                 | `tests/setup/no-network.ts`                                                  |

---

## 3. Findings

Severity: **Critical** (unsafe or broken), **Major** (blocks the roadmap or conflicts with a rule),
**Minor** (fixable without a decision), **Nit**.

### Major

| ID   | Finding                                                                                                                                                                                                                                                                          | Evidence                                                                                                 | Roadmap fix       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------- |
| A-01 | **No general compute.** The analyst can run only one read-only `SELECT`, capped at 500 rows by default and 10,000 at most, with a 15 s timeout. There's no pandas, statistics library or ML. Every inferential or predictive answer would be the model guessing over aggregates. | `src/mcp-server/config.ts` (`DATADESK_MAX_ROWS`, `DATADESK_QUERY_TIMEOUT_MS`)                            | P13, P14          |
| A-02 | **No derived data.** By design (D-009) nothing can be written, so cleaned, joined or feature tables cannot exist. Wrangling, statistics and modelling depend on them.                                                                                                            | D-009; `run_sql` statement-type check                                                                    | P15               |
| A-03 | **No answer-quality measurement.** Tests prove the plumbing and the safety rules, but nothing measures whether answers are _correct_. Without a benchmark, no phase in this track can have a numeric exit criterion.                                                             | `tests/` (fake SDKs only); no eval harness                                                               | P12               |
| A-04 | **No number provenance.** The report writer is told "never invent numbers" (prompt only); nothing checks that a number in an answer or report came from a tool result.                                                                                                           | `SUBAGENT_PROMPTS['report-writer']` in `subagents.ts`                                                    | P14               |
| A-05 | **No memory or persistence of analyses.** Conversations live in memory; reset or restart loses them; nothing is learned across conversations.                                                                                                                                    | `src/main/agent/agentRuntime.ts`; phase summaries                                                        | P14 (resume), P20 |
| A-06 | **`/finish-phase` pushes automatically**, which conflicts with contributors whose personal rules forbid pushing without explicit approval. The skill should respect each contributor's own push rule (DS-10).                                                                    | `.claude/skills/finish-phase/SKILL.md` §5 (`git push -u origin <branch>`); CLAUDE.md "pushes the branch" | P10-07            |

### Minor

| ID   | Finding                                                                                                                                                                                                                                                        | Evidence                                   | Roadmap fix                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------- |
| A-07 | **Lockfile drift:** the working tree's `package-lock.json` has 90 lines of `libc` fields removed. This is an npm-version difference between the machine that wrote the lockfile and this one (npm 11.19.1 here). If committed, it churns CI caches.            | `git diff --stat package-lock.json`        | P10-07                     |
| A-08 | **The child-process network guard was carried from Phase 0 and never done.** The test guard patches `fetch`/`net` in the test process only; spawned children (datadesk-mcp in e2e/stdio tests) are not covered. A Python compute child makes this matter more. | Phase 0/1 summaries "Known gaps"           | P13-07                     |
| A-09 | **No storage cleanup:** artifacts, Hugging Face downloads (except via dataset removal), and soon derived datasets, models and journals accumulate in `userData`.                                                                                               | Phase 3–6 summaries "Known gaps"           | P23-03                     |
| A-10 | **Stale row counts:** taken at registration; wrong if the file changes.                                                                                                                                                                                        | Phase 1 summary                            | P15 (hash-based staleness) |
| A-11 | **The commit-scope list is out of date:** history uses `smoke`, `e2e`, `lint` and no scope; CLAUDE.md lists none of these. Several summaries record the same nit.                                                                                              | CLAUDE.md "Commits"; phase-0/2/3 summaries | P10-07                     |
| A-12 | **README says "early development"** and v0.0.1 after nine phases; for a portfolio product the README should state what works.                                                                                                                                  | `README.md`                                | P10-07, P23-05             |
| A-13 | **The embedding and critic model ids are constants**, not settings, so they cannot follow model deprecations without a release.                                                                                                                                | Phase 5 summary                            | P19-04                     |
| A-14 | **HF header expansion relies on observed, undocumented CLI behaviour** (`${VAR}` in `--mcp-config`).                                                                                                                                                           | Phase 6 summary; D-019                     | Watch (R-12)               |
| A-15 | **Vitest runs jsdom 16 times** (73% of tracked time). Vitest suggests `pool: 'vmThreads'` or a shared environment. Not urgent, but the suite will grow a lot.                                                                                                  | `npm run check` output, 2026-10-02         | P14 (when touching tests)  |

### Nits

| ID   | Finding                                                                                      | Evidence        |
| ---- | -------------------------------------------------------------------------------------------- | --------------- |
| A-16 | Renderer bundle ~3.4 MB, mostly Vega; could be lazy-loaded                                   | Phase 3 summary |
| A-17 | Exports overwrite silently: sibling SVGs (`<name>-chart-N.svg`) replace files without asking | Phase 3 summary |

---

## 4. Readiness for Advanced Analysis

What can be **reused as-is**, what needs **extending**, and what is **new**.

| Building block                                          | Verdict | Note                                                                                     |
| ------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| DuckDB catalog and views                                | Reuse   | Also the fast path for pre-aggregation before Python                                     |
| `run_sql` read-only guard                               | Reuse   | Unchanged; derived datasets are added as new read-only views (P15-05)                    |
| MCP server pattern (D-002/D-003)                        | Reuse   | A second server `datadesk-ds` follows the same stdio pattern (ADR-02)                    |
| Scope table, init guard, PreToolUse hook                | Extend  | Every new tool and sub-agent goes through them; parity test added                        |
| `Orchestrator` + OpenAI agents-as-tools                 | Extend  | New roles need OpenAI mappings from day one (DS-04)                                      |
| Approval broker                                         | Reuse   | Derived datasets are not user files, so no approval is needed; Hub downloads keep theirs |
| Vega-Lite charts                                        | Extend  | Diagnostic chart templates (residuals, ROC, forecast fan)                                |
| Reports + PDF                                           | Extend  | Methods, limitations, model cards, provenance appendix                                   |
| Timeline events                                         | Extend  | Execution cells (code + output) and method findings                                      |
| `second_opinion`                                        | Fold in | Becomes an optional cross-provider critic (P19-04)                                       |
| Python runtime, journal, provenance, lessons, benchmark | New     | See roadmap P12–P20                                                                      |

### Security implications of the advanced-analysis track (inputs to the P11 threat model)

1. **Agent-written code is a new execution surface.** Today the agent can only emit SQL that is
   parsed and type-checked. Python is Turing-complete, so the control has to move from
   "validate the input" to "contain the runtime" (NFR-01).
2. **Pyodide's `js` foreign-function interface** lets Python call JavaScript in its host. In
   Node that includes `require` and `process`: a full escape. The host must be a context where
   JS grants nothing, such as a sandboxed renderer with no network. This is the single most
   important design constraint (R-01).
3. **Model files are code.** Pickle and joblib execute on load. Models must be created and
   loaded only inside the sandbox, never imported from outside in v1.0 (R-10).
4. **Printed output is an exfiltration path to the provider.** Outputs need size caps and a
   row-sample cap (NFR-07, R-14).
5. **Lessons are persistent prompt content.** A lesson can be planted by injected data unless
   lessons are treated as untrusted and suppressive ones need approval (NFR-13).
6. **The answer keys and scores must be unreachable** from every agent working directory
   (P12-09), or the benchmark measures nothing.

---

## 5. Health Snapshot

| Check                            | Result (2026-10-02)                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run check`                  | Pass (exit 0): typecheck, lint, Prettier, Vitest                                           |
| Unit tests (Phase 9 summary)     | 840 passed                                                                                 |
| E2E tests (Phase 9 summary)      | 39 passed (not re-run in this audit)                                                       |
| Packaged smoke (Phase 9 summary) | 15/15                                                                                      |
| Working tree                     | `package-lock.json` modified (A-07); otherwise clean                                       |
| Pinned versions                  | Agent SDK 0.3.286, MCP SDK 1.31.0, OpenAI Agents 0.18.0, DuckDB 1.5.6-r.1, Electron 44.5.1 |
| Decisions                        | D-001..D-029, append-only, with sources                                                    |

---

## 6. Recommendations, in order

1. Close P10 (requirements) before any code, and include the hygiene fixes A-06, A-07, A-11 and A-12.
2. Build DS-Bench (P12) and prove the sandbox (P13) **before** any new analysis feature, so that every
   later phase has a numeric gate and nothing is built on an unproven runtime.
3. Make provenance (P14) the first feature, so that no unprovenanced number ever ships.
4. Keep the existing security architecture unchanged; extend it (scope table, init guard,
   zod contracts) instead of adding a parallel mechanism for the new tools.
