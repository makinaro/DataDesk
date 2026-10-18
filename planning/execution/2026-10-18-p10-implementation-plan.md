# P10 Requirements & Scope Implementation Plan

> **For agentic workers:** route each task through the repo's `using-agent-skills` skill (CLAUDE.md,
> session start step 5). Contributors who have the superpowers plugin may also track the tasks with
> its `executing-plans` skill; it is optional and not part of this repo. Steps use checkbox
> (`- [ ]`) syntax for tracking.

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
- Never push to `main`. **Every push is a STOP:** ask maintainer 1, push only on an explicit yes.
  Approving this plan doesn't approve its pushes (DS-10).
- Until Task 14, P10 commits go straight onto `phase-10-ds-requirements`. Branch protection on
  `phase-*` is switched on only after the phase PR merges, so from P11 on every work item uses a
  `phase-N/<item-id>-<slug>` branch and a PR into the phase branch (roadmap §18, Q42).
- Maintainer 2 is `@Jisooyanim`. Their signing public key isn't needed in P10 (P12 needs it).

## Review Focus

1. **A path to answer keys written differently** (`bench\answer-keys`, `./bench//answer-keys`,
   `bench/./answer-keys`, upper case, a glob like `bench/answer*/**`, or split across Grep's
   `path` and `glob`) must still be blocked by the private-paths hook. Test in Task 7. Only these
   listed forms are claimed. Recursive reads that never name the folder (`Grep {path: 'bench'}`
   with no glob, `grep -r x bench`, `cat bench/*/t01.json`) are known gaps: the hook stays
   best-effort (D-008), and holdout custody is the real control.
2. **A criterion that returns malformed JSON, times out, or is missing** must count as a fired
   blocker when it applies, and as a 0 score when it is a non-blocker, never as a pass or as
   dropped. Tests in Tasks 9 and 11.
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

- [x] **Step 1:** PR #14 (`docs/no-attribution-trailer`) and PR #15 (`plan/p10-p13-p12-execution`)
      are open on GitHub. `gh` must run as a collaborator account (`makinaro`).
- [ ] **Step 2:** STOP. Maintainer 1 reviews and merges both. Then `git switch main && git pull`.
      Expected: `git log --merges -2 --oneline` shows both merges, and `DECISIONS.md` ends at
      D-047.

---

## P10

### Task 2: Branch and record decisions (P10-01)

**Files:**

- Modify: `DECISIONS.md` (append), `planning/roadmap.md` (§1, §3, §5, §9, Version 0.3 → 0.4 with a revision row),
  `planning/plans/P10-requirements-and-scope.md` (D-NNN column), `ROADMAP.md` (add Phase 10 section),
  `planning/plans/P12-benchmark-and-scorer.md` (P12-16, EC12-8)

- [ ] **Step 1:** `git switch -c phase-10-ds-requirements`.
- [ ] **Step 2:** Add a `## Phase 10: Analyst requirements & scope` section to `ROADMAP.md` with one
      box per P10-01..P10-09, mirroring the earlier phase sections.
- [ ] **Step 3:** Append D-030..D-045 verbatim from `planning/decisions-draft.md`, headings and their
      draft dates (2026-10-03) included, after D-047.
- [ ] **Step 4:** Append **D-048 "Run P13 before P12"** and **D-049 "Two maintainers; maintainer 2
      holds and runs the holdout"**, text taken from the execution spec §2.1 and §2.2. D-049
      references the P12 Q-K2 maintainer answer it amends.
- [ ] **Step 4b:** Amend `planning/plans/P12-benchmark-and-scorer.md`: P12-16 and EC12-8 say the
      holdout oracle pass is run by maintainer 2 with the solver maintainer 1 wrote from the dev
      tasks, commits the aggregate only, and cite D-049; the session plan's row 7 matches.
- [ ] **Step 5:** Update roadmap §9's phase table so P12's dependency reads `P11, P13` and P13 is listed
      before P12; bump Version to 0.4 and add its revision row.
- [ ] **Step 6:** Verify: `grep -c '^## D-0' DECISIONS.md` is 49 (D-001..D-049); every DS-01..DS-23 row
      in the P10 plan names a D-NNN that exists.
- [ ] **Step 7:** `npm run check`, then commit `docs(docs): record P10 decisions D-030 to D-049`.

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
      holdout 8, maintainer 2 holds holdout seeds and definitions (D-049).
- [ ] **Step 4:** Check EC10-4: every row has a licence or a generator, and an expected detection.
- [ ] **Step 5:** Commit `docs(docs): add benchmark trap catalogue and dataset list`.

### Task 7: Repo hygiene and permission rules (P10-07)

**Files:**

- Modify: `.claude/hooks/policies.mjs` (`PRIVATE_PATTERNS`), `CLAUDE.md` (rule 6, doc map, session
  start, push wording), `.claude/settings.json`, `scripts/gitConventionsData.mjs` (scopes),
  `package.json` (`packageManager`, `engines.npm`), `.github/workflows/ci.yml` (npm version),
  `README.md` (status line), `.claude/skills/finish-phase/` (push step),
  `docs/conventions/git-conventions.md` and `docs/conventions/README.md` (scope rows, version)
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
  ['Read', { file_path: 'bench/./answer-keys/t01.json' }],
  ['Bash', { command: 'cat ./bench//answer-keys/t01.json' }],
  ['Bash', { command: 'cd bench && cat answer-keys/t01.json' }],
  ['Glob', { pattern: 'BENCH/Answer-Keys/**' }],
  ['Glob', { pattern: 'bench/answer*/**' }],
  ['Grep', { path: 'bench', glob: 'answer-keys/**' }],
])('blocks answer keys via %s', (tool, input) => {
  expect(privatePathsP(tool, input)).toMatch(/Blocked/);
});
it('allows other bench paths', () => {
  expect(privatePathsP('Read', { file_path: 'bench/tasks/t01.json' })).toBeNull();
});
```

- [ ] **Step 3:** Run `npx vitest run tests/tooling/policies.test.ts`. Expected: the eight new cases FAIL.
- [ ] **Step 4:** Implement `normalizePathText(value: string): string` in `policies.mjs`: backslashes to
      `/`, collapse `//` and `/./`, lower-case. Check each path field normalized, and also all of a
      tool's path fields joined with `/` (catches Grep `path` + `glob`). Add two patterns:
      `/answer-keys/` anywhere (catches `cd bench && cat answer-keys/…`) and
      `/answer[^/\s]*[*?[]/` (a glob reaching the folder). Update the deny message to name
      `bench/answer-keys/`. Re-run: PASS.
- [ ] **Step 5:** Write `settingsRules.test.ts`, reading `.claude/settings.json`, asserting:
      `deny` contains `Bash(gh pr merge*)` (covers `--auto`), `Bash(gh api *merge*)`,
      `Bash(gh pr edit * --enable-auto-merge*)`, `Bash(npm run bench:paid*)`,
      `Bash(node bench/runner/paid*)`, `Read(./bench/answer-keys/**)` and their PowerShell forms;
      `ask` contains `Bash(git push*)`, `Bash(npm install *)`, and `Edit(<glob>)` plus
      `Write(<glob>)` for every glob in the protected-path list (at least `CLAUDE.md`,
      `.claude/**`, `.github/**`, `scripts/review/**`, `package.json`); `allow` contains `Bash(npm run check)`,
      `Bash(git status*)`, `Bash(git commit*)` and **does not** contain `Bash(npm run *)` or
      `Bash(git *)`. Run: FAIL.
- [ ] **Step 6:** Edit `.claude/settings.json` to the P10-07 rule set (P10 plan §3, P10-07, "Hard
      permission rules"), using the syntax from Step 1. Run: PASS.
- [ ] **Step 7:** Add `bench` (`bench/**`), `ds` (`docs/ds/**`) and `tooling` (`scripts/review/**`
      and `tests/tooling/**`) to the scope list in `gitConventionsData.mjs` with a scope-table row
      each in `docs/conventions/git-conventions.md`; extend
      `gitConventions.test.ts` to accept `docs(bench): x`. Adding scopes is a MINOR change under
      the page's versioning rule: bump `Version` 2.0.0 → 2.1.0, add a changelog row, update
      `docs/conventions/README.md` and `DOC_VERSION`. Run: PASS.
- [ ] **Step 8:** CLAUDE.md: rule 6 reads "Never read `.env*`, `test-data/private/` or
      `bench/answer-keys/`"; add `planning/` to the doc map and session-start step 1; `/finish-phase`
      prepares the push and the human approves it (DS-10). Revert lockfile drift; set
      `packageManager` and `engines.npm` to the npm version CI uses; README status line names the
      current phase.
- [ ] **Step 9:** `npm run check` passes; commit
      `chore(claude): add answer-key guard and hard permission rules`.

### Task 8: Collaboration setup (P10-08)

**Maintainer 2:** `@Jisooyanim`.

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
  `checkRepoSettings(client: RepoClient, branches: string[]): Promise<string[]>` (empty array =
  compliant) in
  `scripts/check-repo-settings.mjs`. `IssueClient` and `RepoClient` are injected; the CLI entry
  builds them from `gh api`.

- [ ] **Step 1:** Write `codeowners.test.ts` asserting every glob in the P10-08 protected set (P10 plan
      §3, P10-08) has an owners line listing **both** `@makinaro` and `@Jisooyanim` (P10-08: every
      contributor owns the protected set; with one code owner, that code owner's own PRs could never get a
      code-owner approval), and `/bench/spend/**` is owned by exactly `@makinaro @Jisooyanim`.
      Run: FAIL. Update `.github/CODEOWNERS`. Run: PASS.
- [ ] **Step 2:** Write `syncIssues.test.ts`: `parseRoadmapTasks` on a fixture with `- [ ] P10-02 …` and
      `- [x] P10-01 …` returns both ids with the right `done`; `syncIssues` with a fake client
      creates a missing issue, updates a changed title, closes a done task, and never calls the
      client for an unchanged one. Run: FAIL. Implement. Run: PASS.
- [ ] **Step 3:** Write `checkRepoSettings.test.ts`: a fake client returning a compliant ruleset gives
      `[]`; each of these missing returns one named problem: PR required, required CI check,
      1 approval, dismiss stale approvals, last-push approval, code-owner review, no admin bypass,
      auto-merge off; and a CODEOWNERS file (read through the client) whose `/bench/spend/**` line
      lists anyone besides the maintainers, or is missing, returns
      `bench/spend/** must be owned by the maintainers only`; and a listed code owner without
      write access (GitHub silently ignores such owners) returns `<login> has no write access`.
      Rules are checked for each name in `branches`. Run: FAIL. Implement. Run: PASS.
- [ ] **Step 4:** Write `CONTRIBUTING.md` (roles: `@makinaro` and `@Jisooyanim` maintainers; setup `npm ci`,
      `npm run duckdb:extensions`; claiming a work item; branches `phase-N/<item-id>-<slug>`; review
      rule; signed questionnaire answers; benchmark on your own keys), the three issue templates,
      and the PR template additions (work-item id, security checklist rules 1–6).
- [ ] **Step 5:** CLAUDE.md: "owner" wording becomes maintainer/contributor roles; add `CONTRIBUTING.md`
      to the doc map. `/finish-phase` lists the phase PRs' contributors.
- [ ] **Step 6:** `npm run check`; commit `docs(docs): add contributing guide and collaboration tooling`.
- [ ] **Step 7:** STOP for maintainer 1: apply branch protection on **`main` only** in GitHub, then run
      `node scripts/check-repo-settings.mjs --branches main`. Expected output: `compliant`.
      `phase-*` protection waits until Task 14 Step 6, because Tasks 9–14 still commit to the phase
      branch directly.

### Task 9: Review-suite verdict schema and aggregation (P10-09, part 1)

**Files:**

- Create: `scripts/review/schema.mjs`, `scripts/review/aggregate.mjs`
- Test: `tests/tooling/review/aggregate.test.ts`

**Interfaces:**

- Produces: zod `CriterionResult = { criterion: string, status: 'pass'|'fail'|'n/a', subScore: 0..5
int, findings: string[] }`; `Verdict = { pr: number, sha: string, diffHash: string,
workItem: string, criterionHashes: Record<string,string>, score: number | null,
blockersFired: string[], missing: string[], decision: 'APPROVE'|'REQUEST_CHANGES',
bootstrap: boolean, results: CriterionResult[] }`. `workItem` is an id like `P10-07` or `none`;
  `score` is `null` only on a bootstrap verdict;
  `aggregate(criteria: CriterionMeta[], results: unknown[], applicable: Set<string>): Verdict-without-ids`
  where `CriterionMeta = { id, weight, blocker, tier }`.

- [ ] **Step 1:** Write tests: all pass at subScore 5 → score 100, APPROVE; one blocker `fail` →
      REQUEST_CHANGES naming it, whatever the score; `n/a` excluded from the denominator; an applicable
      blocker returning `n/a` → rejected as fired; a result failing the zod schema, or a missing
      result, for an applicable blocker → fired (fail closed); a non-applicable **blocker** missing
      → ignored. **Every non-blocker is always expected:** with 07, 09 and 10 missing or malformed
      and every blocker at 5/5, the score is **80** (their 20 weight counts as 0), `missing` is
      `['07','09','10']`, and the verdict is never 100.
- [ ] **Step 2:** Run: FAIL. Implement `aggregate` as `Σ weight × subScore/5` over every expected
      criterion (a missing or malformed one scores 0 and is listed in `missing`), excluding only
      valid `n/a` results from the denominator, rescaled to 100. Run: PASS.
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
- Produces: `writeVerdict({ pr, baseRef, headSha, branch, results }, git: GitClient): Promise<string>`
  writing
  `docs/reviews/<pr>/verdict.json` and `verdict.md`; criteria and `tiers.json` loaded with
  `git show <baseRef>:<path>`. `computeDiffHash(git, baseRef, headSha): Promise<string>`, shared
  with Task 12. `changedPathsFromDiff(diff: string): string[]` for fixture runs (Task 13).
  `workItemFromBranch(branch: string): string` returns `P10-07` for `phase-10/P10-07-hygiene`
  and `none` for any other name. `baseRef` is always `origin/<base>` after `git fetch`, never a
  local branch that may be stale.

- [ ] **Step 1:** Tests with a fake `GitClient`: criteria come from the base ref even when the working
      tree differs; `computeDiffHash` is SHA-256 of the output of exactly
      `git diff-tree -r -z --no-renames --no-commit-id <merge-base> <head>` (raw blob ids, modes and
      paths, NUL-separated so `core.quotePath` can't change how paths are written, and no user
      diff setting such as `diff.algorithm` or `diff.renames` changes it; the test asserts the
      argv); `workItem` comes from `workItemFromBranch(branch)`; `criterionHashes` cover all ten files; a criterion that times out
      (fake runner never resolves within the limit) → fired blocker. **Bootstrap:** when
      `git show <baseRef>:.claude/agents/reviewers/` doesn't exist, `writeVerdict` writes
      `bootstrap: true`, `criterionHashes: {}`, `score: null`, `results: []`, takes its findings
      from the `code-reviewer` report passed in, sets `decision` to `REQUEST_CHANGES` if that
      report lists any blocker and `APPROVE` otherwise, and throws if no report is given. `changedPathsFromDiff` returns the `b/` paths of a two-file diff.
- [ ] **Step 2:** Run: FAIL. Implement. Run: PASS.
- [ ] **Step 3:** SKILL.md order: **STOP and ask to push** → open a draft PR (now there is a number) →
      one subagent per applicable criterion at its tier's model → collect JSON →
      `node scripts/review/run.mjs` → commit `docs/reviews/<pr>/` → **STOP and ask to push** → mark
      ready. A `--fixture <diff>` mode runs the criteria on a diff file's text, takes applicability
      from `changedPathsFromDiff`, and calls `aggregate` directly: no PR, refs or `writeVerdict`.
      `/finish-phase` follows the same order: it pushes (after asking) and opens the draft PR
      **before** it runs the suite.
- [ ] **Step 4:** Commit `feat(claude): add the review-suite skill and verdict writer`.

### Task 12: CI verdict check (P10-09, part 4)

**Files:**

- Create: `scripts/review/verify.mjs`, `.github/workflows/review-verdict.yml`
- Test: `tests/tooling/review/verify.test.ts`

**Interfaces:**

- Consumes: `aggregate`, `Verdict`.
- Consumes: `computeDiffHash` (Task 11); `lintMessage` from `scripts/gitConventions.mjs`.
- Produces: `verifyVerdict({ verdictJson, baseRef, headSha }, git: GitClient): string[]` (empty =
  valid).

- [ ] **Step 1:** Tests: a valid verdict → `[]`; a hand-edited `score` → error; a criterion-file hash
      differing from the base branch → error; a file outside `docs/reviews/**` changed after the
      reviewed SHA → error; a recomputed diff hash mismatch → error. Mechanical checks, each with a
      passing and a failing case: weights sum to 100; `DECISIONS.md` append-only; `--save-exact`
      pins; **every commit in the range passes `lintMessage`**; **traceability**: the verdict's
      `workItem` is `none` or an id like `P10-07` that is ticked in `ROADMAP.md` at the head;
      **spend ledger**: any changed `bench/spend/*.jsonl` line must parse as JSON with `phase`,
      `contributor` and `amountUsd`, and an unparseable line is an error. **Bootstrap:**
      `verify.mjs` only ever runs on a base that has the suite, so a verdict with
      `bootstrap: true` is always an error there (the bootstrap PR is handled by the workflow,
      Step 3). **Isolation:** a test parses every import in `scripts/review/*.mjs` and asserts
      each resolves to a file in the Step 3 checkout list or to a package in `package.json`.
- [ ] **Step 2:** Run: FAIL. Implement. Run: PASS.
- [ ] **Step 3:** The workflow checks out the **base** branch's `scripts/review/`,
      `scripts/gitConventions*.mjs`, `commitlint.config.js`, `package.json` and
      `package-lock.json` together into a separate folder, runs `npm ci --ignore-scripts` there,
      and runs `verify.mjs` from there against the PR head, so imports never resolve into the head
      checkout. On a `pull_request` event GitHub runs the PR's own copy of `review-verdict.yml`;
      "judged by the base branch's copies" therefore rests on `.github/**` needing code-owner
      review (Task 8), which the workflow file states in a comment. If the base has no
      `scripts/review/verify.mjs` (only the PR that adds the suite), the job passes with the notice
      `bootstrap: no review suite on base; code-owner review is the control`. It never runs the
      head's own scripts.
- [ ] **Step 4:** Commit `ci(ci): verify committed review verdicts against the base branch`.

### Task 13: Review-suite fixtures (P10-09, EC10-8)

**Files:** Create `tests/fixtures/review/violations/rule-{1..6}.diff`,
`tests/fixtures/review/clean/{1..5}.diff`, `docs/reviews/fixtures/report.md`.

- [ ] **Step 1:** One planted violation per CLAUDE.md rule 1–6 (e.g. rule 1: an IPC handler returning
      a key; rule 5: `{ ...process.env }` in a spawn) and five clean diffs from merged history.
- [ ] **Step 2:** Run `/review-suite --fixture <diff>` on each fixture 3 times. Expected: each violation → REQUEST_CHANGES
      naming the right blocker, 3 of 3; each clean diff → APPROVE, 3 of 3. Record in `report.md`.
- [ ] **Step 3:** If any run misses, tighten that criterion's checks and repeat Step 2 for it.
- [ ] **Step 4:** Commit `test(tooling): add review-suite fixtures and detection report`.

### Task 14: Exit and finish

- [ ] **Step 1:** Dispatch `plan-auditor` on `docs/ds/01`–`05`; fix findings until READY (EC10-5).
- [ ] **Step 2:** STOP for maintainer 2: the CONTRIBUTING walkthrough from a clean clone to a merged
      PR, filing an issue per snag (EC10-6). Fix the snags.
- [ ] **Step 3:** STOP for maintainer 1: confirm the evaluation layers, rubric criteria and judge rules
      (EC10-7) with a Maintainer decision line in `P10-questionnaire.md`.
- [ ] **Step 4:** Run `/finish-phase`. It asks to push, then opens a draft PR titled
      `docs(docs): define analyst requirements and scope (phase 10)`. This is the suite's own PR,
      so its base (`main`) has no criteria: it runs `code-reviewer` and `/review-suite` writes a
      `bootstrap: true` verdict (Task 11), which CI accepts (Task 12).
- [ ] **Step 5:** Commit the verdict, ask to push, mark the PR ready, give the link. **STOP** until
      maintainer 1 merges.
- [ ] **Step 6:** After the merge: STOP for maintainer 1 to add `phase-*` branch protection and the
      `review-verdict` required check, then run
      `node scripts/check-repo-settings.mjs --branches main,phase-*`. Expected output: `compliant`.
