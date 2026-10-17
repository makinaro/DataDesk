# P10 Requirements & Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Step 0 and P10 of the execution spec: decisions recorded, `docs/ds/01`–`05`
written, repo hygiene and collaboration tooling in place, and the automated review suite live.

**Architecture:** P10 produces documents, decisions and development tooling only, never product
code under `src/` (P10 plan, "Rule for the phase"). Tooling is pure functions tested by Vitest
under `tests/tooling/`, wired into `.claude/` and `.github/`. The review suite splits judgement
(LLM criteria in `.claude/agents/reviewers/`) from verdict computation (code in `scripts/review/`),
and CI re-verifies with the base branch's scripts.

**Tech Stack:** Node ESM scripts (`.mjs`), zod, Vitest, GitHub Actions, `gh` CLI, Claude Code
settings and hooks.

**Spec:** `planning/execution/2026-10-18-p10-p13-p12-execution.md` (Steps 0–1), which defers all
content detail to `planning/plans/P10-requirements-and-scope.md` and the answers in
`planning/plans/P10-questionnaire.md`. Executors read all three.

**Scope of this plan:** Step 0 and P10 only. P11, P13 and P12 each get their own plan when they
start (CLAUDE.md: one phase at a time; P12's tasks depend on P11's schemas).

## Global Constraints

- Branch `phase-10-ds-requirements` from `main` after Step 0 merges.
- Per task: tests → `npm run check` passes → one conventional commit `type(scope): summary`,
  header ≤ 72, one scope from `scripts/gitConventionsData.mjs` → tick the task's ROADMAP box in
  the same commit.
- No product code under `src/` in P10.
- `DECISIONS.md` is append-only; format `## D-NNN: Title (YYYY-MM-DD)` with Context, Decision,
  Alternatives, Consequences.
- Claude Code permission-rule syntax is verified by `docs-researcher` before Task 7 (P10-07).
- No automated test makes a network call; GitHub API calls go through an injected client.
- Never push to `main`; every push asks the human (DS-10).
- Maintainer 2's GitHub handle and signing public key are required before Task 8.

## Review Focus

1. **A path to answer keys written differently** (`bench\answer-keys`, `./bench//answer-keys`,
   upper case) must still be blocked by the private-paths hook. Test in Task 7.
2. **A criterion that returns malformed JSON, times out, or is missing** must count as a fired
   blocker when it applies, never as a pass. Test in Task 11.
3. **A PR that edits a criterion file or `scripts/review/**`** must be judged by the base
   branch's copies, not its own. Test in Task 12.
4. **A commit pushed after the verdict** (anything outside `docs/reviews/**`) must fail CI's
   verdict check. Test in Task 12.
5. **A narrowed `allow` list** must still let everyday commands run without a prompt
   (`npm run check`, `git status`, `git commit`). Test in Task 7.

---

## Step 0: Clean start

### Task 1: Merge the pending branches

**Files:** none changed.

- [ ] **Step 1:** Push `docs/no-attribution-trailer` and open its PR:
      `gh pr create --base main --head docs/no-attribution-trailer --title "docs(claude): stop requiring an AI attribution trailer"`.
      Expected: PR URL printed.
- [ ] **Step 2:** Push `plan/p10-p13-p12-execution` and open its PR with title
      `docs(planning): add execution spec and P10 plan`.
- [ ] **Step 3:** STOP. The owner reviews and merges both. Then `git switch main && git pull`.
      Expected: `git log -1` shows both merges.

---

## P10

### Task 2: Branch and record decisions (P10-01)

**Files:**

- Modify: `DECISIONS.md` (append), `planning/roadmap.md` (§1, §3, §5, §9, revision row → v0.3),
  `planning/plans/P10-requirements-and-scope.md` (D-NNN column), `ROADMAP.md` (add Phase 10 section)

- [ ] **Step 1:** `git switch -c phase-10-ds-requirements`.
- [ ] **Step 2:** Add a `## Phase 10: Analyst requirements & scope` section to `ROADMAP.md` with one
      box per P10-01..P10-09, mirroring the earlier phase sections.
- [ ] **Step 3:** Append D-030..D-045 verbatim from `planning/decisions-draft.md`, dated 2026-10-04,
      after D-046.
- [ ] **Step 4:** Append **D-047 "Run P13 before P12"** and **D-048 "Two maintainers; maintainer 2
      holds the holdout generator"**, text taken from the execution spec §2.1 and §2.2.
- [ ] **Step 5:** Update roadmap §9's phase table so P12's dependency reads `P11, P13` and P13 is listed
      before P12; add revision row v0.3.
- [ ] **Step 6:** Verify: `grep -c '^## D-0' DECISIONS.md` is 48 (D-001..D-048); every DS-01..DS-23 row
      in the P10 plan names a D-NNN that exists.
- [ ] **Step 7:** `npm run check`, then commit `docs(docs): record P10 decisions D-030 to D-048`.

### Task 3: Requirements (P10-02)

**Files:** Create `docs/ds/01-requirements.md`.

- [ ] **Step 1:** Write the vocabulary section first (analysis, execution, claim, provenance, lesson,
      trap, split, test lock, kernel lease), using the glossary in roadmap §4.
- [ ] **Step 2:** One acceptance criterion per FR-01..FR-19 and NFR-01..NFR-17 from roadmap §6, plus the
      upgrade-safety and supply-chain NFRs from questionnaire Q45. Each names its evidence (test path,
      score-file field or journal field).
- [ ] **Step 3:** Check EC10-1: every requirement ID in roadmap §6 appears exactly once, and no
      criterion's evidence is "the agent says".
- [ ] **Step 4:** Commit `docs(docs): add analyst requirements with acceptance criteria`.

### Task 4: Metrics (P10-03)

**Files:** Create `docs/ds/02-metrics.md`.

- [ ] **Step 1:** For M-01..M-19 and PA-01..PA-11: numerator, denominator, data source, target, with the
      values from roadmap §7 and answers Q19–Q22. M-07 is higher-is-better.
- [ ] **Step 2:** Add tolerance rules, the "detected" rule (structured field naming the trap category and
      subject), M-08 on the key's held-back horizon, and M-03 from key-labelled flags only.
- [ ] **Step 3:** Check EC10-2: no data-source cell names agent text or self-report.
- [ ] **Step 4:** Commit `docs(docs): add metric definitions and targets`.

### Task 5: Sandbox, data and method policies (P10-04, P10-05)

**Files:** Create `docs/ds/03-sandbox-and-data-policy.md`, `docs/ds/04-method-policy.md`.

- [ ] **Step 1:** `03`: every grant as an allowlist entry, every limit with its number: ≤ 20 rows per
      call, ≤ 200 per analysis, 48 KB output per analysis, 8 KB per output, 2 KB stdout, 120 s per
      execution, 500 MB warning, **2 GB kill** (Q-D3), ≤ 50M cells, ≤ 200 columns, the egress
      allowlist (Q10), and P13's ordered go/no-go rule (the six steps quoted in the P13 plan
      §3, P13-05).
- [ ] **Step 2:** Check EC10-3: grep the file for limits without a number; none remain.
- [ ] **Step 3:** Commit `docs(docs): add sandbox and data policy`.
- [ ] **Step 4:** `04`: inference defaults, ML protocol (test invariant, nested CV for small n, group-
      and time-aware folds), forecasting protocol, causal-language rule, and block vs warn, from
      answers Q13–Q18. Each rule is phrased as a check or a critic instruction.
- [ ] **Step 5:** Commit `docs(docs): add statistical and ML method policy`.

### Task 6: Benchmark selection (P10-06)

**Files:** Create `docs/ds/05-benchmark.md`.

- [ ] **Step 1:** The trap catalogue: the twelve categories (P12 Q2), each with a generator idea, an
      expected detection, and the trap compatibility table P12-01 needs.
- [ ] **Step 2:** Public datasets: source (OpenML, HF or scikit-learn), licence, task, reference metric,
      dev/holdout assignment; the perturbation rule per task type (P12-02); the disclosures a dataset
      card must carry.
- [ ] **Step 3:** Dev/holdout rule: dev 12 (7 synthetic: 4 trap tasks × 3 traps + 3 clean; 5 public),
      holdout 8, maintainer 2 holds holdout seeds and definitions (D-048).
- [ ] **Step 4:** Check EC10-4: every row has a licence or a generator, and an expected detection.
- [ ] **Step 5:** Commit `docs(docs): add benchmark trap catalogue and dataset list`.

### Task 7: Repo hygiene and permission rules (P10-07)

**Files:**

- Modify: `.claude/hooks/policies.mjs` (`PRIVATE_PATTERNS`), `CLAUDE.md` (rule 6, doc map, session
  start, push wording), `.claude/settings.json`, `scripts/gitConventionsData.mjs` (scopes),
  `package.json` (`packageManager`, `engines.npm`), `.github/workflows/ci.yml` (npm version),
  `README.md` (status line), `.claude/skills/finish-phase/` (push step)
- Test: `tests/tooling/policies.test.ts`, create `tests/tooling/settingsRules.test.ts`,
  `tests/tooling/gitConventions.test.ts`

**Interfaces:**

- Produces: `privatePaths(toolName, toolInput): string | null` now also blocks `bench/answer-keys`;
  the protected-path list in `.claude/settings.json` `ask` that Task 8's CODEOWNERS mirrors.

- [ ] **Step 1:** Dispatch `docs-researcher` to verify the current Claude Code permission-rule syntax
      (mid-pattern wildcards, `Edit(<glob>)`, PowerShell forms). Record the version and URL for
      Step 9's commit body.
- [ ] **Step 2:** Add failing tests to `policies.test.ts`:

```ts
it.each([
  ['Read', { file_path: 'bench/answer-keys/t01.json' }],
  ['Read', { file_path: 'C:\\repo\\bench\\answer-keys\\t01.json' }],
  ['Bash', { command: 'cat ./bench//answer-keys/t01.json' }],
  ['Glob', { pattern: 'BENCH/Answer-Keys/**' }],
])('blocks answer keys via %s', (tool, input) => {
  expect(privatePathsP(tool, input)).toMatch(/Blocked/);
});
it('allows other bench paths', () => {
  expect(privatePathsP('Read', { file_path: 'bench/tasks/t01.json' })).toBeNull();
});
```

- [ ] **Step 3:** Run `npx vitest run tests/tooling/policies.test.ts`. Expected: the four new cases FAIL.
- [ ] **Step 4:** Add `/bench[\\/]+answer-keys/i` to `PRIVATE_PATTERNS` (repeated separators handled by
      `+`) and update the deny message to name `bench/answer-keys/`. Re-run: PASS.
- [ ] **Step 5:** Write `settingsRules.test.ts`, reading `.claude/settings.json`, asserting:
      `deny` contains `Bash(gh pr merge*)`, `Bash(npm run bench:paid*)`,
      `Bash(node bench/runner/paid*)`, `Read(./bench/answer-keys/**)` and their PowerShell forms;
      `ask` contains `Bash(git push*)` and `Bash(npm install *)`; `allow` contains `Bash(npm run check)`,
      `Bash(git status*)`, `Bash(git commit*)` and **does not** contain `Bash(npm run *)` or
      `Bash(git *)`. Run: FAIL.
- [ ] **Step 6:** Edit `.claude/settings.json` to the P10-07 rule set (P10 plan §3, P10-07, "Hard
      permission rules"), using the syntax from Step 1. Run: PASS.
- [ ] **Step 7:** Add `bench` (`bench/**`), `ds` (`docs/ds/**`) and `tooling` (`scripts/review/**`
      and `tests/tooling/**`) to the scope list in `gitConventionsData.mjs` with a scope-table row
      each in `docs/conventions/git-conventions.md`; extend
      `gitConventions.test.ts` to accept `docs(bench): x`. Run: PASS.
- [ ] **Step 8:** CLAUDE.md: rule 6 reads "Never read `.env*`, `test-data/private/` or
      `bench/answer-keys/`"; add `planning/` to the doc map and session-start step 1; `/finish-phase`
      prepares the push and the human approves it (DS-10). Revert lockfile drift; set
      `packageManager` and `engines.npm` to the npm version CI uses; README status line names the
      current phase.
- [ ] **Step 9:** `npm run check` passes; commit
      `chore(claude): add answer-key guard and hard permission rules`.

### Task 8: Collaboration setup (P10-08)

**Requires:** maintainer 2's handle (call it `@M2` below; substitute the real one).

**Files:**

- Create: `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/{work-item,bug,decision}.yml`,
  `scripts/sync-issues.mjs`, `scripts/check-repo-settings.mjs`
- Modify: `.github/CODEOWNERS`, `.github/pull_request_template.md`, `CLAUDE.md` (roles),
  `.claude/skills/finish-phase/` (contributors list)
- Test: `tests/tooling/codeowners.test.ts`, `tests/tooling/syncIssues.test.ts`,
  `tests/tooling/checkRepoSettings.test.ts`

**Interfaces:**

- Produces: `parseRoadmapTasks(markdown: string): Array<{ id: string; title: string; done: boolean }>`
  and `syncIssues(tasks, client: IssueClient): Promise<SyncResult>` in `scripts/sync-issues.mjs`;
  `checkRepoSettings(client: RepoClient): Promise<string[]>` (empty array = compliant) in
  `scripts/check-repo-settings.mjs`. `IssueClient` and `RepoClient` are injected; the CLI entry
  builds them from `gh api`.

- [ ] **Step 1:** Write `codeowners.test.ts` asserting every glob in the P10-08 protected set (P10 plan
      §3, P10-08) has an owners line containing `@makinaro`, and `/bench/spend/**` is owned by
      `@makinaro @M2` only. Run: FAIL. Update `.github/CODEOWNERS`. Run: PASS.
- [ ] **Step 2:** Write `syncIssues.test.ts`: `parseRoadmapTasks` on a fixture with `- [ ] P10-02 …` and
      `- [x] P10-01 …` returns both ids with the right `done`; `syncIssues` with a fake client
      creates a missing issue, updates a changed title, closes a done task, and never calls the
      client for an unchanged one. Run: FAIL. Implement. Run: PASS.
- [ ] **Step 3:** Write `checkRepoSettings.test.ts`: a fake client returning a compliant ruleset gives
      `[]`; each of these missing returns one named problem: PR required, required CI check,
      1 approval, dismiss stale approvals, last-push approval, code-owner review, no admin bypass,
      auto-merge off. Run: FAIL. Implement. Run: PASS.
- [ ] **Step 4:** Write `CONTRIBUTING.md` (roles: `@makinaro` and `@M2` maintainers; setup `npm ci`,
      `npm run duckdb:extensions`; claiming a work item; branches `phase-N/<item-id>-<slug>`; review
      rule; signed questionnaire answers; benchmark on your own keys), the three issue templates,
      and the PR template additions (work-item id, security checklist rules 1–6).
- [ ] **Step 5:** CLAUDE.md: "owner" wording becomes maintainer/contributor roles; add `CONTRIBUTING.md`
      to the doc map. `/finish-phase` lists the phase PRs' contributors.
- [ ] **Step 6:** `npm run check`; commit `docs(docs): add contributing guide and collaboration tooling`.
- [ ] **Step 7:** STOP for the owner: apply branch protection on `main` and `phase-*` in GitHub, then run
      `node scripts/check-repo-settings.mjs`. Expected output: `compliant`.

### Task 9: Review-suite verdict schema and aggregation (P10-09, part 1)

**Files:**

- Create: `scripts/review/schema.mjs`, `scripts/review/aggregate.mjs`
- Test: `tests/tooling/review/aggregate.test.ts`

**Interfaces:**

- Produces: zod `CriterionResult = { criterion: string, status: 'pass'|'fail'|'n/a', subScore: 0..5
int, findings: string[] }`; `Verdict = { pr: number, sha: string, diffHash: string,
criterionHashes: Record<string,string>, score: number, blockersFired: string[],
decision: 'APPROVE'|'REQUEST_CHANGES', results: CriterionResult[] }`;
  `aggregate(criteria: CriterionMeta[], results: unknown[], applicable: Set<string>): Verdict-without-ids`
  where `CriterionMeta = { id, weight, blocker, tier }`.

- [ ] **Step 1:** Write tests: all pass at subScore 5 → score 100, APPROVE; one blocker `fail` →
      REQUEST_CHANGES naming it, whatever the score; `n/a` excluded from the denominator; an applicable
      blocker returning `n/a` → rejected as fired; a result failing the zod schema, or a missing
      result, for an applicable blocker → fired (fail closed); non-applicable criterion missing →
      ignored.
- [ ] **Step 2:** Run: FAIL. Implement `aggregate` as `Σ weight × subScore/5` over non-`n/a` results,
      rescaled to 100. Run: PASS.
- [ ] **Step 3:** Commit `feat(tooling): add review-suite verdict schema and aggregation`.

### Task 10: Criteria, tiers and applicability (P10-09, part 2)

**Files:**

- Create: `.claude/agents/reviewers/01-security-rules.md` … `10-readability.md`,
  `.claude/agents/reviewers/tiers.json`, `scripts/review/applicability.json`,
  `scripts/review/applicability.mjs`
- Test: `tests/tooling/review/criteria.test.ts`, `tests/tooling/review/applicability.test.ts`

**Interfaces:**

- Consumes: `CriterionMeta` (Task 9).
- Produces: `loadCriteria(dir: string): CriterionMeta[]`; `applicableBlockers(changedPaths: string[],
map): Set<string>`.

- [ ] **Step 1:** Tests: the ten files parse; weights sum to 100; each has `weight`, `blocker`, `tier`;
      weights and blocker flags equal the P10 plan's table (20/15/12/10/8/7/8/8/6/6). Applicability:
      `src/main/x.ts` → includes `01`; `src/shared/ds/a.ts` → includes `05`;
      `src/main/agent/claude/subagents.ts` → includes `04`; `docs/x.md` only → no code blockers.
- [ ] **Step 2:** Run: FAIL. Write the criteria (checks and evidence from the P10 plan table; split the
      `code-reviewer` checks into 01, 02, 09), `tiers.json`, and the path map. Run: PASS.
- [ ] **Step 3:** Commit `feat(claude): add review-suite criteria and applicability map`.

### Task 11: `/review-suite` skill (P10-09, part 3)

**Files:**

- Create: `.claude/skills/review-suite/SKILL.md`, `scripts/review/run.mjs`
- Modify: `.claude/skills/finish-phase/` (run `/review-suite` instead of `code-reviewer`)
- Test: `tests/tooling/review/run.test.ts`

**Interfaces:**

- Consumes: `aggregate`, `loadCriteria`, `applicableBlockers`.
- Produces: `writeVerdict({ pr, baseRef, headSha, results }, git: GitClient): Promise<string>` writing
  `docs/reviews/<pr>/verdict.json` and `verdict.md`; criteria and `tiers.json` loaded with
  `git show <baseRef>:<path>`.

- [ ] **Step 1:** Tests with a fake `GitClient`: criteria come from the base ref even when the working
      tree differs; `diffHash` is SHA-256 of `git diff <base>...<head>`; `criterionHashes` cover all
      ten files; a criterion that times out (fake runner never resolves within the limit) → fired
      blocker.
- [ ] **Step 2:** Run: FAIL. Implement. Run: PASS.
- [ ] **Step 3:** SKILL.md: draft PR → one subagent per applicable criterion at its tier's model →
      collect JSON → `node scripts/review/run.mjs` → commit `docs/reviews/<pr>/` → mark ready.
      Bootstrap note: this suite's own PR is reviewed by `code-reviewer`, recorded in its verdict.
- [ ] **Step 4:** Commit `feat(claude): add the review-suite skill and verdict writer`.

### Task 12: CI verdict check (P10-09, part 4)

**Files:**

- Create: `scripts/review/verify.mjs`, `.github/workflows/review-verdict.yml`
- Test: `tests/tooling/review/verify.test.ts`

**Interfaces:**

- Consumes: `aggregate`, `Verdict`.
- Produces: `verifyVerdict({ verdictJson, baseRef, headSha }, git: GitClient): string[]` (empty =
  valid).

- [ ] **Step 1:** Tests: a valid verdict → `[]`; a hand-edited `score` → error; a criterion-file hash
      differing from the base branch → error; a file outside `docs/reviews/**` changed after the
      reviewed SHA → error; a recomputed diff hash mismatch → error; mechanical checks run
      (weights sum to 100, `DECISIONS.md` append-only, `--save-exact` pins).
- [ ] **Step 2:** Run: FAIL. Implement. Run: PASS.
- [ ] **Step 3:** The workflow checks out the **base** branch's `scripts/review/` into a separate
      folder and runs `verify.mjs` from there against the PR head.
- [ ] **Step 4:** Commit `ci(ci): verify committed review verdicts against the base branch`.

### Task 13: Review-suite fixtures (P10-09, EC10-8)

**Files:** Create `tests/fixtures/review/violations/rule-{1..6}.diff`,
`tests/fixtures/review/clean/{1..5}.diff`, `docs/reviews/fixtures/report.md`.

- [ ] **Step 1:** One planted violation per CLAUDE.md rule 1–6 (e.g. rule 1: an IPC handler returning
      a key; rule 5: `{ ...process.env }` in a spawn) and five clean diffs from merged history.
- [ ] **Step 2:** Run `/review-suite` on each fixture 3 times. Expected: each violation → REQUEST_CHANGES
      naming the right blocker, 3 of 3; each clean diff → APPROVE, 3 of 3. Record in `report.md`.
- [ ] **Step 3:** If any run misses, tighten that criterion's checks and repeat Step 2 for it.
- [ ] **Step 4:** Commit `test(tooling): add review-suite fixtures and detection report`.
- [ ] **Step 5:** STOP for the owner: add the `review-verdict` check to `main`'s required checks.

### Task 14: Exit and finish

- [ ] **Step 1:** Dispatch `plan-auditor` on `docs/ds/01`–`05`; fix findings until READY (EC10-5).
- [ ] **Step 2:** STOP for maintainer 2: the CONTRIBUTING walkthrough from a clean clone to a merged
      PR, filing an issue per snag (EC10-6). Fix the snags.
- [ ] **Step 3:** STOP for the owner: confirm the evaluation layers, rubric criteria and judge rules
      (EC10-7) with a Maintainer decision line in `P10-questionnaire.md`.
- [ ] **Step 4:** Run `/finish-phase` (now using `/review-suite`). It prepares the push; the human
      approves it; it gives the PR link with title
      `docs(docs): define analyst requirements and scope (phase 10)`. **STOP.**
