---
name: finish-phase
description: Close out the current ROADMAP phase. Runs all checks and the code-reviewer agent, fixes blockers, ticks the roadmap, writes the learning-log entry and phase summary, pushes the branch, gives the PR link, then STOPS for the owner's review.
disable-model-invocation: true
argument-hint: '[phase number]'
---

# Finish phase $ARGUMENTS

Run these steps in order. If any step fails, fix it and restart from step 1. **Never start the
next phase.**

## 1. Verify

- `git status`: the working tree must be clean except for this skill's own edits. You must be
  on branch `phase-N-<slug>`.
- `npm run check` must pass.
- `npm run test:e2e` must pass.
- Every task box for this phase in `ROADMAP.md` is ticked, or you can explain why not.

## 2. Review

- Run the `code-reviewer` agent: "Review main...HEAD for phase N against CLAUDE.md."
- Fix every **Blocker** and every reasonable **Should fix** in separate conventional commits.
  Re-run step 1 after the fixes.
- List any finding you deliberately didn't fix, with the reason, for the summary.

## 3. Learning log (`docs/learning-log.md`)

Append an entry in exactly this format (see CLAUDE.md):

```
## Phase N: <title> (<YYYY-MM-DD>)
### Concept
### Where it lives
### How it works
### Gotchas
### Experiments
```

- **Where it lives** uses real, clickable `path/to/file.ts:line` references (check the lines).
- **How it works** traces one concrete request end to end as a numbered list.
- **Gotchas** includes the real surprises from this phase (check DECISIONS.md and the git log).
- **Experiments**: 2–3 hands-on things to try, each with what you should observe.

## 4. Phase summary (`docs/phases/phase-N.md`)

- What was built (bullets, linked files) · decisions made (DECISIONS IDs) · test counts
  (unit/e2e) · known gaps and deferred items · review findings not fixed, with reasons ·
  how to try it manually.

## 5. Commit and push

- Tick the "Done when" line if satisfied. Commit `docs: phase N learning log and summary`.
- `git push -u origin <branch>`.
- Open the PR: if the `gh` CLI is installed and authenticated, run
  `gh pr create --base main --title "Phase N: <title>" --body-file docs/phases/phase-N.md`.
  Otherwise print the compare URL:
  `https://github.com/<owner>/<repo>/compare/main...<branch>?expand=1`.

## 6. STOP

Reply with the phase summary (short), the PR link, and what the owner should check in review.
Don't start Phase N+1, even if it looks trivial.
