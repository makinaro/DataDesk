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

- **Type and scope are required.** Exactly one scope. A change that spans scopes is split into
  separate commits, so `feat(ui,ipc)` is rejected.
- **Header** (type, scope and summary) is 72 characters or fewer.
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
  git's `Merge branch '...'` and `Merge remote-tracking branch '...'`, and `Revert "..."` from
  `git revert` or GitHub. Everything else is linted, including `fixup!`, `squash!` and `amend!`
  commits (squash them before you push) and a lower-case `revert ...`.
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

Rejected, with a rewrite that passes:

- ❌ `Plan (docs): add P10–P23 advanced-analysis plans and planning tooling` is not a type.
  Write `docs(planning): add P10-P23 advanced-analysis plans and tooling`.
- ❌ `fix: render planning docs with react-markdown, fix PR review` has no scope. Write
  `fix(planning): render planning docs with react-markdown`.
- ❌ `feat(ui): Results-first and Chat-first layouts with inline steps` starts with a capital
  letter. Write `feat(ui): add results-first and chat-first layouts with inline steps`.
- ❌ `docs: phase 9 learning log and summary` has no scope. Write
  `docs(docs): add the phase 9 learning log and summary`.
- ❌ `feat(ui,ipc): add a theme picker` has two scopes. Make two commits.

## Pull requests

### Title

`type(scope): summary (phase N)`. Non-phase PRs leave out the suffix.

- Without the suffix, the title follows the commit header rules above (72 characters or fewer,
  same casing rule). The suffix does not count toward the 72.
- The suffix is exactly one ` (phase N)`: one leading space, lower-case `phase`, digits only
  with no leading zero (`phase 0` is fine, `phase 09` is not).
- Shape of the check: `^type(scope)!?: summary( \(phase (0|[1-9][0-9]*)\))?$`, with the real type
  and scope lists. A `Revert "..."` title is exempt, like the commit it reverts.
- ✅ `feat(ui): polish the UI and themes (phase 9)`
- ✅ `fix(ci): lint the full PR range`
- ❌ `Phase 9: UI polish`
- ❌ `feat(ui): polish the UI (Phase 9)`
- ❌ `feat(ui): polish the UI (phase 9.5)`
- ❌ `feat: polish the UI (phase 9)`

**Phase PRs** (opened by `/finish-phase`): the type is the highest-impact type among the phase's
commits, in the order feat, fix, refactor, perf, build, ci, test, docs, chore. The scope is the
most frequent scope among them. The summary is the phase title as an imperative phrase starting
with a lower-case verb (`polish the UI and themes`); acronyms keep their case.

**Why a suffix on the title:** the phase is on the PR only, not on commits. We keep merge
commits, so GitHub's merge message is `Merge pull request #N from owner/branch` and the title does
not reach `git log`. The phase is recorded on GitHub and in `docs/phases/phase-N.md`.

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

The P10 plans propose work-item branches `phase-N/<item-id>-<slug>` squash-merged into the phase
branch (draft D-040 in `planning/decisions-draft.md`). That is not in force until it lands in
`DECISIONS.md`; when it does, this section gets a MINOR bump. Git can't hold both a branch
`phase-N` and `phase-N/...`, and a squash merge appends ` (#N)` to the header, which counts
toward the 72.

## Enforcement

Three layers, from fastest to the real gate:

1. **Local hook.** `.husky/commit-msg` runs commitlint on every commit. `npm install` / `npm ci`
   installs it through the `prepare` script (`husky`, which sets `core.hooksPath` to
   `.husky/_`). `git commit --no-verify` skips it, and commits made on github.com never run it,
   which is why CI exists.
2. **CI commit job** (`.github/workflows/ci.yml`, job `commit-lint`). Strict. Lints the PR's own
   commits, `base..head`, not the history of `main`, so older commits on `main` that predate this
   page don't fail it. A branch cut before this page landed has to reword its commits
   (`git rebase -i`, then `reword`) before it can pass. It is a real gate only once it is a
   required status check in the branch protection for `main`.
3. **CI title job** (`.github/workflows/pr-title.yml`). Warns on a bad title (exit 1) and fails
   only if the check itself crashes (exit 2), so a broken check can't hide as a warning. It is not
   a required check. It lives in its own workflow so that editing a title does not re-run the
   whole suite.

If the hook does not run in a GUI git client, `node` is probably not on its PATH. Put your
version manager's setup in `~/.config/husky/init.sh`.

## Versioning of this document

Semantic versioning, where the "public API" is the set of rules that decide whether a message is
valid.

- **MAJOR**: previously valid messages become invalid (a new required footer, a removed type or
  scope, a changed title format). Also add a `DECISIONS.md` entry that references the old one.
- **MINOR**: a backwards-compatible addition (a new scope or type, a new optional rule).
- **PATCH**: wording and examples with no rule change.

Any PR that changes this page bumps `Version`, adds a changelog row and updates the row in the
[index](README.md), all in the same commit. Keep `DOC_VERSION` in
`scripts/gitConventionsData.mjs` in step. The decision behind this page is D-046 in
`DECISIONS.md`. The test fails if they disagree, but it cannot judge
whether you chose the right bump level, so check that in review.

## Changelog

| Version | Date       | Change                    | Reason                                             |
| ------- | ---------- | ------------------------- | -------------------------------------------------- |
| 1.0.0   | 2026-10-07 | First version of the page | Commit and PR names had drifted (see the examples) |
