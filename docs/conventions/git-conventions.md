# Git conventions

Version: 1.0.0
Status: active

How we name commits, branches and pull requests. The rules are enforced by tooling (see
[Enforcement](#enforcement)); this page is the reason behind them. The tooling reads its type and
scope lists from [scripts/gitConventionsData.mjs](../../scripts/gitConventionsData.mjs), and a
test checks that this page agrees with it.

## Commit message

```
type(scope): summary

Body: why, not what. Wrapped at 72 columns, optional for trivial changes.

Co-Authored-By: ...
```

- **Type and scope are required.** Exactly one scope: the primary area of the change. Don't list
  several, so `feat(ui,ipc)` is rejected. A task that touches several areas (an IPC channel spans
  `ipc`, `main`, `preload` and `ui`) is still one commit, under the scope it is mostly about.
- **Header** (type, scope and summary) is 72 characters or fewer.
- **Blank lines** separate the header from the body, and the body from the footers.
- **Summary** is in the imperative, has no trailing period and starts with a lower-case letter.
  Acronyms and proper nouns are fine after the first word (`fix(mcp): load DuckDB from a short path`).
  A summary that would start with an acronym is reworded (`add CSV import`, not
  `CSV import support`).
- **Body** explains why, not what. Lines are 72 columns or fewer (lines with a URL are exempt).
- **Footers** are the harness `Co-Authored-By` trailer and, for a breaking change, a
  `BREAKING CHANGE:` footer. There is no phase footer on commits: the phase lives on the PR.
  Footer lines are 72 columns or fewer too. commitlint treats the first `Token: value` line and
  everything after it as footer, so start body lines with something else.
- **Breaking changes** use the `BREAKING CHANGE:` footer. A `!` before the colon
  (`feat(ipc)!: drop the old channel`) also works. Both were checked against commitlint 21.2.3.
- **Exempt from linting**, by the first line only: GitHub's `Merge pull request #N from ...`,
  git's `Merge branch '...'` and `Merge remote-tracking branch '...'`, and `Revert "..."` and
  `Reapply "..."` (a reverted revert) from `git revert` or GitHub. The first line alone decides,
  so CI also fails a commit with one parent whose first line is a merge header. Everything else
  is linted, including `fixup!`, `squash!` and `amend!` commits (squash them before you push), a
  lower-case `revert ...`, `Merge tag '...'` and octopus merges (`Merge branches 'a' and 'b'`).
- **Lines starting with `#`** are comments to the hook, as in git's editor, but
  `git commit -m "#42 ..."` keeps them and CI lints them. Don't start a line with `#`. The hook
  rejects a message that is empty once those lines are removed.
- **Not enforced by tools, so review for it:** the imperative mood (`added` passes), vague
  summaries such as "wip" or "misc", and the right type and scope for the change.

**Why:** the history is the project's changelog and its learning record. A required scope makes
`git log --grep "(ipc)"` useful, and the imperative summary reads as "this commit will ...".

## Types

| Type       | Use for                                              |
| ---------- | ---------------------------------------------------- |
| `feat`     | a new capability                                     |
| `fix`      | a bug fix                                            |
| `test`     | adding or changing tests only                        |
| `docs`     | documentation only                                   |
| `refactor` | a change that neither fixes a bug nor adds a feature |
| `chore`    | maintenance that fits nowhere else                   |
| `build`    | build system or packaging changes                    |
| `ci`       | CI, hooks and the commit tooling                     |
| `perf`     | a performance improvement                            |

`style` and `revert` from the commitlint preset are not allowed. Some names are both a type and a
scope (`build`, `ci`, `docs`, `test`). Repeating one is fine when it is accurate:
`docs(docs): ...` for a docs-only commit, `build(build): ...` for a packaging-only change.

## Scopes

| Scope      | Covers                                                                               |
| ---------- | ------------------------------------------------------------------------------------ |
| `main`     | `src/main/**` except the sub-areas below                                             |
| `preload`  | `src/preload/**`                                                                     |
| `ipc`      | `src/shared/ipc/**` and `src/main/ipc/**`                                            |
| `ui`       | `src/renderer/**`                                                                    |
| `secrets`  | `src/main/secrets/**`                                                                |
| `mcp`      | `src/mcp-server/**` and `src/main/mcp/**`                                            |
| `agent`    | `src/main/agent/**`                                                                  |
| `skills`   | the in-app analyst's skills                                                          |
| `claude`   | `.claude/**` and CLAUDE.md (dev tooling)                                             |
| `deps`     | dependency installs and upgrades                                                     |
| `planning` | `planning/**`                                                                        |
| `ci`       | `.github/**`, `.husky/**`, `commitlint.config.js`, `scripts/gitConventions*.mjs`     |
| `e2e`      | Playwright specs under `tests/e2e/**`                                                |
| `smoke`    | packaged-app smoke tests                                                             |
| `test`     | the rest of `tests/**`, `test-data/public/**` and the Vitest setup                   |
| `scripts`  | the other `scripts/**` helpers (DuckDB extensions, icon, smoke runner)               |
| `lint`     | ESLint and Prettier configuration                                                    |
| `build`    | electron-builder, `resources/**`, the installer and packaging                        |
| `docs`     | README, `docs/**`, ROADMAP.md, DECISIONS.md. A docs-only commit is `docs(docs): ...` |

Code under `src/node-shared/**` or `src/shared/**` (outside `ipc`) takes the scope of the area
the change is for. `package.json` script changes take the scope of what the script runs; version
bumps are `deps`.

## Examples from this repo's history

Good, taken from real commits:

- ✅ `fix(ui): stop the whole window from scrolling`
- ✅ `feat(ipc): add datasets:remove channel`
- ✅ `refactor(ipc): derive clipboard and export types from the contract`

Rejected, with the rule commitlint reports and a rewrite that passes:

- ❌ `Plan (docs): add P10–P23 advanced-analysis plans and planning tooling` is not a type
  (`type-empty`). Write `docs(planning): add P10-P23 advanced-analysis plans and tooling`.
- ❌ `fix: render planning docs with react-markdown, fix PR review` has no scope
  (`scope-empty`). Write `fix(planning): render planning docs with react-markdown`.
- ❌ `feat(ui): Results-first and Chat-first layouts with inline steps` starts with a capital
  letter (`subject-case`). Write `feat(ui): add results-first and chat-first layouts with inline steps`.
- ❌ `docs: phase 9 learning log and summary` has no scope (`scope-empty`). Write
  `docs(docs): add the phase 9 learning log and summary`.
- ❌ `feat(ui,ipc): add a theme picker` has two scopes (`single-scope`). Write
  `feat(ui): add a theme picker`, the primary area.

## Pull requests

### Title

`type(scope): summary (phase N)`. Non-phase PRs leave out the suffix.

- Without the suffix, the title follows the commit header rules above (72 characters or fewer,
  same casing rule). The suffix does not count toward the 72.
- The suffix is exactly one ` (phase N)`: one leading space, lower-case `phase`, digits only
  with no leading zero (`phase 0` is fine, `phase 09` is not).
- Shape of the check: `^type(scope)!?: summary( \(phase (0|[1-9][0-9]*)\))?$`, with the real type
  and scope lists. A `Revert "..."` or `Reapply "..."` title is exempt, like the commit.
- ✅ `feat(ui): polish the UI and themes (phase 9)`
- ✅ `fix(ci): lint the full PR range`
- ❌ `Phase 9: UI polish` (`type-empty`)
- ❌ `feat(ui): polish the UI (Phase 9)` (`phase-suffix`)
- ❌ `feat(ui): polish the UI (phase 9.5)` (`phase-suffix`)
- ❌ `feat: polish the UI (phase 9)` (`scope-empty`)

**Phase PRs** (opened by `/finish-phase`): the type is the highest-impact type among the phase's
commits, in the order feat, fix, refactor, perf, build, ci, test, docs, chore. The scope is the
most frequent scope among them. The summary is the phase title as an imperative phrase starting
with a lower-case verb (`polish the UI and themes`); acronyms keep their case.

**Why the title is checked strictly:** we keep merge commits, and GitHub's merge commit puts the
PR title in its body: `Merge pull request #N from owner/branch`, a blank line, then the title
(`git log -1 --format=%B 0033574` shows one). The title is part of `git log`, but commitlint
never lints it there because the merge header is exempt, so the title job is its only check.
GitHub's
[merge message setting](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-merging-for-pull-requests)
decides this; the default includes the title.

**Why a suffix on the title:** the phase is on the PR only, not on commits, so the suffix carries
it into the merge commit. It is also recorded in `docs/phases/phase-N.md`.

### Description

Use [the PR template](../../.github/pull_request_template.md):

1. **Summary**: what changed, in 2-4 bullets. Phase PRs start it with a `Phase: N` line and a
   link to `docs/phases/phase-N.md`.
2. **Why**: the reason, and any `D-NNN` decision it relates to.
3. **Learning notes**: the concept, where it lives (file links) and the learning-log entry.
4. **Test plan**: the `npm run check` result, new tests, and anything verified by hand.

Phase PRs link to `docs/phases/phase-N.md` instead of pasting it.

### Branch names

`phase-N-<slug>` for phases, and `type/<slug>` for everything else (`fix/ci-short-temp-paths`,
`docs/commit-standard`). Planning-only work uses `plan/<slug>`. Branch names are not checked by
tooling.

Work-item branches inside a phase (`phase-N/<item-id>-<slug>`) are defined by Q42 in
[the P10 questionnaire](../../planning/plans/P10-questionnaire.md).

## Enforcement

Three layers, from fastest to the real gate:

1. **Local hook.** `.husky/commit-msg` rejects a message that is empty without its `#` lines,
   then runs commitlint on every commit. `npm install` / `npm ci` installs it through the
   `prepare` script (`husky`, which sets `core.hooksPath` to `.husky/_`). `git commit --no-verify`
   skips it, and commits made on github.com never run it, which is why CI exists.
2. **CI commit job** (`.github/workflows/ci.yml`, job `commit-lint`). Strict: every rule is an
   error, none is a warning. Lints the PR's own commits, from the merge base of `base` and `head`,
   not the history of `main`, so older commits on `main` that predate this page don't fail it.
   It fails if that range is empty, and if a commit with one parent has a merge header. A branch
   cut before this page landed has to reword its commits (`git rebase -i`, then `reword`) before
   it can pass. It is a real gate only once it is a required status check in the branch
   protection for `main`.
3. **CI title job** (`.github/workflows/pr-title.yml`). Strict: it fails on a bad title and on a
   crash of the check. Editing the title re-runs it. It lives in its own workflow so that editing
   a title does not re-run the whole suite, and it is not a required check.

Both CI jobs lint with the PR's own copy of the rules, so a PR could weaken them and pass.
`.github/CODEOWNERS` asks a maintainer to review any change to them, which is enforced once branch
protection requires code-owner review.

The hook is skipped without a word in these cases, and CI still lints the commits:

- `HUSKY=0` is set, for one command or for the shell.
- `npm ci --ignore-scripts` (or `npm install --ignore-scripts`) ran, so `prepare` never did.
- A fresh `git worktree`, until `npm ci` runs there: `.husky/_` is generated and gitignored, so
  the worktree doesn't have it yet.
- A GUI git client that can't find `node` on its PATH. Put your version manager's setup in
  `~/.config/husky/init.sh`.

## Versioning of this document

Semantic versioning, where the "public API" is the set of rules that decide whether a message is
valid.

- **MAJOR**: previously valid messages become invalid (a new required footer, a removed type or
  scope, a changed title format). Also add a `DECISIONS.md` entry that references the old one.
- **MINOR**: a backwards-compatible addition (a new scope or type, a new optional rule).
- **PATCH**: wording and examples with no rule change.

Any PR that changes this page bumps `Version`, adds a changelog row at the top of the table and
updates the row in the [index](README.md), all in the same commit. Keep `DOC_VERSION` in
`scripts/gitConventionsData.mjs` in step. The decision behind this page is D-046 in
`DECISIONS.md`. The test fails if they disagree, but it cannot judge
whether you chose the right bump level, so check that in review.

## Changelog

| Version | Date       | Change                    | Reason                                             |
| ------- | ---------- | ------------------------- | -------------------------------------------------- |
| 1.0.0   | 2026-10-07 | First version of the page | Commit and PR names had drifted (see the examples) |
