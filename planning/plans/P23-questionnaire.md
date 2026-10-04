# P23 Questionnaire: Decisions Needed Before Hardening & Release

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Settle hardening, onboarding, release and presentation                                                                       |
| Already decided | D-023; P10 Q31, Q32, Q45; P13 Q7, Q8; P22 Q7                                                                                 |
| How to answer   | Any contributor writes under a question in its `Answer` block and signs it (`— @handle`). "Agree" accepts the recommendation |

---

**Q1. Which Electron fuses are set?**
_Blocks: P23-01._

> **Recommendation (Claude):** Disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and
> `EnableNodeCliInspectArguments`.

> **Answer Q1:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** Disable `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments`. Enable `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar` and `EnableCookieEncryption`. **Keep `RunAsNode` enabled**, because `datadesk-mcp` and `datadesk-ds` run on the Electron binary as Node (D-003), and record the residual risk (any local process can already run code as the user) in a D-NNN. The packaged smoke verifies each fuse and that both MCP servers still start.
>
> **Why:** Disabling `RunAsNode` as recommended would break both MCP servers, the whole agent, in the packaged app. The other fuses close the injection paths found in P13 Q7 at no functional cost. The remaining risk is local code execution as the same user, which is outside DataDesk's threat model.
>
> **Rejected:** disabling RunAsNode (breaks D-003); leaving the defaults (the `NODE_OPTIONS` injection path).
>
> **Recommendation was:** overturned (RunAsNode must stay; asar integrity added).
>
> **Consequences:** P23-01; D-NNN on the fuse set.
>
> **Revisit if:** the MCP servers move off RunAsNode (e.g. a separate Node runtime), so the fuse can be disabled.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Every fuse decided; Playwright runs on the unfused copy of the same asar, and a non-Playwright check verifies the fused exe. Integrity is corruption-only in v1.0 (Q-AK3).
>
> **Audit resolution, round 2 (2026-10-03):** `GrantFileProtocolExtraPrivileges` stays on for the D-016 PDF window (Q-AN7); the packaged app quits on `--remote-debugging-port` (Q-AN8); fuses are flipped after the unfused smoke in one build sequence.
>
> **Audit resolution, round 3 (2026-10-03):** The remote-debugging quit is dropped (Playwright needs the switch; same-user access is out of scope, Q-AP1); `GrantFileProtocolExtraPrivileges` goes off if a single-fuse test copy still exports a PDF (Q-AP5).

**Q2. What does onboarding include?**
_Blocks: P23-04._

> **Recommendation (Claude):** A welcome screen and the sales sample from `test-data/public`.

> **Answer Q2:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** A first-run screen with three steps (choose a provider and add a key, add data, ask). **Three bundled sample datasets with verified open licences** (chosen from P12 Q3's public set, small files only), each with two "try this" goals that show the new capabilities (an A/B test, a model, a forecast). The samples are registered on request, never automatically.
>
> **Why:** `test-data/public` sales files are test fixtures, not a showcase of statistics, ML or forecasting. A portfolio product's first minute must demonstrate what makes it different. Registering on request keeps D-010's spirit (nothing enters the catalog without the user).
>
> **Rejected:** fixtures as samples (don't show the product); auto-registration (clutters the catalog).
>
> **Recommendation was:** overturned (purpose-chosen samples with goals).
>
> **Consequences:** P23-04; licence records shipped alongside the samples.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Samples are copied into `userData` with a hash manifest, ≤ 5 MB, licence-allowlisted, never holdout-b datasets; the A/B goal uses a synthetic randomised sample (Q-AK8).
>
> **Audit resolution, round 2 (2026-10-03):** A committed sample manifest with licence and split status; no holdout split of any kind.

**Q3. What can the storage view clean up?**
_Blocks: P23-03._

> **Recommendation (Claude):** Delete everything older than 90 days with one button.

> **Answer Q3:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The storage view (P10 Q32) lists sizes per analysis and per kind (journal, derived datasets, models, artifacts, Hugging Face downloads, snapshots). Cleanup is **explicit and selective**: delete an analysis (cascade); delete orphaned snapshots (safe, regenerable) with one button; delete derived data or models with a warning naming what depends on them. **No time-based mass deletion.**
>
> **Why:** "Delete everything older than 90 days" contradicts P10 Q32 (never auto-delete someone's work) and would break saved analyses and models silently. Snapshots are the only truly disposable cache, so they get the one-button cleanup.
>
> **Rejected:** age-based mass deletion (destroys work); no cleanup (audit A-09).
>
> **Recommendation was:** overturned (selective, dependency-aware cleanup).
>
> **Consequences:** P23-03; tests for cascade and dependency warnings.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** A single `StorageService` with tombstones, lease refusal and containment; "orphaned" means unreferenced by a saved analysis; the "derived from X" cascade is restored (Q-AK4).
>
> **Audit resolution, round 2 (2026-10-03):** One roots table; a `pending-delete` marker under a per-id lock; notes and dataset-scoped lessons in the cascade.
>
> **Audit resolution, round 3 (2026-10-03):** `StorageService` orchestrates and each store owner deletes (amends D-029 and D-043, Q-AP3); resumable markers; main-side native confirmation; saved analyses that read a deleted dataset are kept and marked "parent removed".

**Q4. What is the fresh-machine test?**
_Blocks: P23-06._

> **Recommendation (Claude):** Install on a new Windows user profile and run one analysis within
> 30 minutes.

> **Answer Q4:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **A new Windows user profile on a machine without development tools**. Download the installer, verify the checksum, install, accept SmartScreen as the README describes, add **one** key, open a sample, and complete one guided goal. The 30-minute clock starts at the download and excludes the analysis run time. The test is done by a contributor who didn't build the release, following only the README, and is recorded with timings and every snag in `docs/ds/fresh-machine.md`.
>
> **Why:** The recommendation leaves out the parts that fail for strangers: the checksum, SmartScreen, and following the docs without help. Having someone other than the builder run it is what tests the README rather than the builder's memory.
>
> **Rejected:** the builder runs it (tests memory, not docs); a dev machine (hides missing prerequisites).
>
> **Recommendation was:** refined (clean machine, docs-only, independent tester, recorded snags).
>
> **Consequences:** P23-06; README fixes from every snag.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Pass rule defined: standard user, Windows 10 and 11, checksum match, README only, M-04 = 0, ≤ 30 minutes excluding the run (Q-AK6).
>
> **Audit resolution, round 2 (2026-10-03):** The tester uses the hash-matched CI artifact (Q-AN4); M-04 is computed by the scorer's provenance mode.
>
> **Audit resolution, round 3 (2026-10-03):** The tester is a contributor who didn't write the README, on their own key (Q-AP6); timing from the download timestamp to the journal's final event; an in-app journal export feeds the scorer's provenance mode.

**Q5. What is the installer size budget?**
_Blocks: P23-01._

> **Recommendation (Claude):** Today's ~750 MB on disk plus at most 200 MB for the Python runtime.

> **Answer Q5:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** ≤ 950 MB installed (today ~750 MB + ≤ 200 MB, P10 Q9), **plus a download-size target of ≤ 350 MB** for the installer itself, measured in CI on every release build. A breach fails the release job.
>
> **Why:** Users feel the download, not the installed size, and a portfolio visitor decides in the first minute. Measuring in CI stops size creep from landing unnoticed.
>
> **Rejected:** an installed-size budget only (the download goes unmeasured).
>
> **Recommendation was:** refined (download target, CI enforcement).
>
> **Consequences:** P23-01; the CI release job.
>
> **Revisit if:** the Python runtime alone exceeds its budget (trim packages before raising it).
>
> **Confidence:** Medium · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Measured on the pinned `windows-2025` image; baseline ≈ 713 MB installed (D-023); download and installed size reported separately.
>
> **Audit resolution, round 2 (2026-10-03):** Both limits (≤ 950 MB installed, ≤ 350 MB download) are failing steps in `release.yml`.

**Q6. Crash reporting or telemetry?**
_Blocks: P23-07._

> **Recommendation (Claude):** Add anonymous crash reporting to find bugs.

> **Answer Q6:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **No telemetry and no automatic crash reporting.** Instead: a local, rotated diagnostics log (no data values, no keys, no prompts) and a "Copy diagnostics" button that copies versions, settings (keys shown only as set or not set), the last errors and timings, for the user to paste into an issue themselves.
>
> **Why:** "Your files stay on your machine" is the product's central promise (README), and even anonymous crash reports leave the machine without a per-event decision. An opt-in, user-initiated diagnostics copy gets most of the debugging value without that.
>
> **Rejected:** anonymous crash reporting (breaks the local-first promise); no diagnostics at all (bug reports without context).
>
> **Recommendation was:** overturned (user-initiated diagnostics instead of telemetry).
>
> **Consequences:** P23-07; a test that diagnostics never include key material or data values.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Allowlisted fields only, never message text; main writes the clipboard; canary test (Q-AK7).
>
> **Audit resolution, round 3 (2026-10-03):** The canary names each error source. (Consequences: P23-09, not P23-07.)

**Q7. How are releases made?**
_Blocks: P23-07._

> **Recommendation (Claude):** The maintainer builds locally and uploads to GitHub Releases.

> **Answer Q7:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** **CI builds releases** from a tag on `main` (a GitHub Actions release job on windows-latest). The job runs check, e2e, packaged smoke and the size check, then publishes the installer and `SHA256SUMS.txt` as a **draft** GitHub Release. The maintainer reviews the draft and publishes it. Versions follow semver; release notes come from the phase summaries. `docs/RELEASING.md` holds the checklist.
>
> **Why:** A local build is irreproducible (whose machine, which npm, which extensions?), and contributors can't verify it. A CI build from a tag means anyone can see exactly what was built. The draft step keeps publishing a deliberate maintainer action, consistent with the push rule (DS-10).
>
> **Rejected:** local builds (irreproducible, unverifiable); auto-publishing on tag (no human checkpoint).
>
> **Recommendation was:** overturned (CI build, maintainer publishes the draft).
>
> **Consequences:** P23-07; a new CI workflow; the release permissions are a maintainer setting.
>
> **Revisit if:** signing arrives (the certificate goes into CI secrets, a separate decision).
>
> **Confidence:** High · **Needs maintainer:** yes
>
> **Maintainer decision (2026-10-03):** Agree.
>
> **Audit resolution (2026-10-03):** The draft step is backed by a tag ruleset, a protected `release` environment and attestations (Q-AK1).
>
> **Audit resolution, round 2 (2026-10-03):** Pinned `windows-2025` image; attestations made in the build job; publish holds the only write token (Q-AN3).
>
> **Audit resolution, round 3 (2026-10-03):** Release trigger only on final version tags; a separate attest job; `.github/**`, `scripts/**`, `bench/freeze/**` and the build config are maintainer-owned (Q-AP4); the release job recomputes the tree hash from the signed freeze tag (Q-AP7).

**Q8. Which models does the released app use by default?**
_Blocks: P23-01._

> **Recommendation (Claude):** The pinned model ids used in the P22 evaluation.

> **Answer Q8:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The released app defaults to **aliases** (`sonnet` for Claude, and the OpenAI default in `OPENAI_MODELS`). The pinned ids from P22 are listed in the README's results section as "evaluated with", so readers know what the numbers apply to. A settings note says that model updates may change behaviour.
>
> **Why:** Pinned ids retire and would break installed copies for every user at once (P14 Q9); aliases keep working. Being explicit about "evaluated with" keeps the published numbers honest.
>
> **Rejected:** shipping pinned ids (breakage when they retire).
>
> **Recommendation was:** overturned (aliases by default, pinned ids documented).
>
> **Consequences:** P23-01, P23-05.
>
> **Revisit if:** an alias change materially degrades quality (then re-evaluate and update the README).
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** Already decided by D-045: aliases by default, recorded as a declared deviation from the P22 freeze (Q-AK2).

**Q9. What may the README claim?**
_Blocks: P23-05, EC23-3._

> **Recommendation (Claude):** Highlights of what it can do and the best benchmark numbers.

> **Answer Q9:** — @spec-designer (Claude), 2026-10-03
>
> **Decision:** The README states **only measured claims**: the P22 results table (medians with CIs, both providers), including waived targets and the evaluation's limitations, with links to `docs/ds/evaluation.md`. Capability statements are phrased as what it does, without superlatives, and the security model and privacy promise are stated precisely. No "best" numbers picked from favourable runs.
>
> **Why:** Picking the best runs is precisely what this product exists to catch in other people's analyses. A portfolio that reports its own uncertainty honestly is more credible, not less.
>
> **Rejected:** best-run highlights (cherry-picking).
>
> **Recommendation was:** overturned (measured, complete, linked claims).
>
> **Consequences:** P23-05.
>
> **Revisit if:** none expected.
>
> **Confidence:** High · **Needs maintainer:** no
>
> **Audit resolution (2026-10-03):** The README table is generated from P22's aggregates and checked by CI.

---

## Spec-Designer Summary (2026-10-03)

| Q   | Decision (one line)                                                 | Recommendation | Confidence | Needs maintainer |
| --- | ------------------------------------------------------------------- | -------------- | ---------- | ---------------- |
| Q1  | Disable NodeOptions and inspect, add asar integrity; keep RunAsNode | **overturned** | High       | no               |
| Q2  | Three licensed samples with "try this" goals; register on request   | **overturned** | High       | no               |
| Q3  | Selective, dependency-aware cleanup; no age-based deletion          | **overturned** | High       | no               |
| Q4  | Clean profile, docs only, independent tester, recorded snags        | refined        | High       | no               |
| Q5  | ≤ 950 MB installed and ≤ 350 MB download, enforced in CI            | refined        | Medium     | no               |
| Q6  | No telemetry; user-initiated diagnostics copy                       | **overturned** | High       | no               |
| Q7  | CI builds from a tag; the maintainer publishes the draft            | **overturned** | High       | **yes**          |
| Q8  | Aliases by default; pinned ids documented as "evaluated with"       | **overturned** | High       | no               |
| Q9  | Only measured claims, with CIs and waivers                          | **overturned** | High       | no               |

**Totals:** 9 answered · 0 kept · 2 refined · 7 overturned · 1 needs the maintainer. The audit raised Q-AK1..Q-AK8 (`P23-audit.md`).

**Overturned recommendations:**

- Q1: disabling RunAsNode breaks both MCP servers in the packaged app.
- Q2: test fixtures don't demonstrate the product's new capabilities.
- Q3: age-based deletion destroys saved work, which contradicts P10 Q32.
- Q6: crash reporting breaks the local-first promise.
- Q7: local builds are irreproducible and unverifiable.
- Q8: pinned ids break installed copies when they retire.
- Q9: best-run highlights are cherry-picking.

**For the maintainer:**

- Q7: releases built by CI from a tag, published by the maintainer from a draft?

**Cross-question changes made in the consistency pass:**

- Q1 implements P13 Q7.
- Q8 aligns with P14 Q9.
- Q9 aligns with P22 Q6 and Q7.

**Facts verified:**

- In code: D-003's RunAsNode dependency (`docs/ARCHITECTURE.md`, `datadesk-mcp` runs with `ELECTRON_RUN_AS_NODE`).
- **To verify:** the fuse names in the pinned Electron version (P23-01, docs-researcher).
