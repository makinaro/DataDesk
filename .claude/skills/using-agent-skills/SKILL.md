---
name: using-agent-skills
description: How a coding agent works on DataDesk. It decides which DataDesk skill, agent or workflow applies to the task at hand and sets the operating rules every session follows. Use at the start of every session, whenever a new request arrives, and whenever you are unsure which skill applies. This is the meta-skill that governs how all other DataDesk development skills are discovered and used.
---

# Using agent skills on DataDesk

DataDesk is built mostly by coding agents (Claude Code) working for several contributors and one
maintainer. Skills and agents in `.claude/` encode how this project is done. This skill decides
which one applies, in what order, and how to behave while using them.

**Two kinds of skills: don't mix them up.**

- **Development skills and agents** (`.claude/skills/`, `.claude/agents/`): used by _you_, the
  coding agent, to build DataDesk. This skill governs them.
- **Runtime skills** (`resources/agent-plugin/skills/`): used by _the in-app analyst_ inside the
  product (`eda-checklist`, `chart-style`, …). You write and test them, but you never invoke
  them yourself. Changes to them follow the context-engineering rules (roadmap §8.5).

## 1. Route the task

Answer the questions in order and use the first match. Several skills often apply to one
request; run them in the order of the lifecycle (§2).

| If the request is…                                                                                                                                       | Use                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Anything, at session start                                                                                                                               | CLAUDE.md "Session start routine", then this skill                                                                                          |
| A new phase, feature or significant change with no signed-off plan                                                                                       | `spec-driven-development`                                                                                                                   |
| Answering a phase questionnaire                                                                                                                          | `/spec-designer`                                                                                                                            |
| Reviewing a plan, questionnaire or design deliverable                                                                                                    | the `plan-auditor` agent                                                                                                                    |
| Turning a signed-off phase into tasks, issues and an order                                                                                               | `planning-and-task-breakdown`                                                                                                               |
| Code that relies on a fast-moving SDK or runtime (Agent SDK, MCP SDK, OpenAI SDK/Agents SDK, DuckDB, Pyodide, Electron, electron-vite, electron-builder) | the `docs-researcher` agent **first**                                                                                                       |
| A new IPC channel between renderer and main                                                                                                              | `/add-ipc-channel`                                                                                                                          |
| A new tool for the in-app analyst on `datadesk-mcp`                                                                                                      | `/add-mcp-tool`                                                                                                                             |
| A prompt, sub-agent, runtime skill, tool description or tool output format                                                                               | the `context-engineering` skill (P11-13; until it exists, roadmap §8.5)                                                                     |
| Missing or thin tests for existing code                                                                                                                  | the `test-writer` agent                                                                                                                     |
| A finished branch before a PR, or any PR                                                                                                                 | `/review-suite` (P10-09: one reviewer agent per criterion, blockers binding, verdict committed); until it exists, the `code-reviewer` agent |
| Closing a phase                                                                                                                                          | `/finish-phase`                                                                                                                             |
| A one-line fix with obvious scope                                                                                                                        | No skill. Still follow §3 and the CLAUDE.md per-task loop                                                                                   |

**Default:** if a non-trivial task has no signed-off plan or spec, start with
`spec-driven-development`. Don't start coding to "see what happens".

## 2. The lifecycle

A phase moves through these skills in order. Skip a step only when the table above says it
doesn't apply, and say so.

```
spec-driven-development ─► /spec-designer ─► contributors review ─► plan-auditor ─► maintainer sign-off
   ─► planning-and-task-breakdown ─► per task: docs-researcher? ─► add-ipc-channel / add-mcp-tool?
   ─► context-engineering? ─► implement + tests (CLAUDE.md loop) ─► /review-suite (per PR)
   ─► plan-auditor on deliverables ─► /finish-phase ─► STOP for review
```

Smaller paths:

- **Bug fix:** reproduce with a failing test → fix → `npm run check` → `/review-suite` on the PR.
- **New analyst tool inside a planned task:** docs-researcher → `/add-mcp-tool` → context-engineering
  (its description and output size) → parity test for both providers.
- **Planning-only change:** edit under `planning/` → `npm run plan:html` → plan-auditor if a
  decision changed.

## 3. Operating rules (every session, every skill)

1. **Surface assumptions.** Before substantial work, list what you're assuming (the phase, the
   decisions that apply, the files involved). Ask about the ones that would change the work.
2. **Stop on confusion.** If the plan, a decision (`DECISIONS.md`, DS-nn), the code and the
   request disagree, stop and name the conflict with the options. Never resolve it by guessing.
   Authority order: CLAUDE.md > DECISIONS.md > DS-nn > roadmap > phase plan > the request's wording.
3. **Push back with evidence.** If an approach breaks a security rule, a decision or a metric's
   meaning, say so with the concrete downside and an alternative. Accept an informed override,
   and record it as a decision when it changes the design.
4. **Code, not the agent.** Anything scored, safety-relevant or reproducible is done by code:
   journals, splits, test locks, provenance, method checks, scores, lesson validation. If a
   design has an LLM computing or certifying one of these, it is wrong. Say so.
5. **Security rules are not negotiable.** CLAUDE.md rules 1–6 hold for every change: no key ever
   crosses IPC, hardened windows, zod both ways, the analyst's tool allowlist, explicit child
   environments, never read `.env*` or `test-data/private/`, and never read `bench/answer-keys/`.
6. **Both providers.** Any analyst-facing change works on Claude and OpenAI, declared once in
   the scope table and checked by the parity test (DS-04, NFR-14).
7. **Verify before use.** Fast-moving APIs are confirmed with `docs-researcher` or the installed
   `.d.ts`, pinned with `--save-exact`, and recorded in a D-NNN with version and URL.
8. **Scope discipline.** Do the task in front of you. No drive-by refactors, renames or features
   outside the current work item. Note them as follow-ups instead.
9. **Simple first.** Prefer the obvious solution with fewer moving parts. Add an abstraction
   only when a second real use exists.
10. **Done means verified.** A task is done when its acceptance criteria pass with evidence:
    `npm run check`, the relevant tests, `npm run test:e2e` when UI or windows change, and the
    bench when the phase's gates require it. "It should work" is not done.
11. **One phase at a time; never push uninvited.** Don't start the next phase without sign-off.
    Pushing follows the contributor's own rules (DS-10); if unsure, stop at the commit and ask.
    **Never merge a pull request** and never enable auto-merge: humans merge (DS-23). Your job ends
    at an open PR with a passing verdict, ready for a human peer's review. Permission rules hard-block
    merging and paid runs; don't look for ways around them. If one blocks you, stop and ask.
    **Never spend API money without explicit approval (DS-21).** Costs in the plans are estimates.
    Before coding or running anything that calls a paid API outside the fake-SDK tests (benchmark
    runs, gates, learning sequences, evaluations), confirm that the maintainer has approved that
    phase's spend in the plan. If not, stop and ask with the projected cost.
12. **Leave a trail.** Decisions go to `DECISIONS.md`, phase learnings to the learning log,
    planning changes to `planning/` with re-rendered HTML. Reference every file as `path:line`.

## 4. Failure modes to avoid

| Failure                     | What it looks like here                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| Building without a plan     | Writing `src/` code for a phase whose questionnaire isn't signed off           |
| Guessing through a conflict | Choosing between a DS-nn and the roadmap silently                              |
| False agreement             | "Agree" to a recommendation without checking it against the code and decisions |
| One-provider features       | A new tool wired into the Claude path only                                     |
| Self-grading                | An LLM step deciding pass/fail, writing a score, or editing the journal        |
| Unverified SDK use          | Calling an Agent SDK or Pyodide API from memory                                |
| Silent scope creep          | "While I was there I also refactored…"                                         |
| Unverified "done"           | Ticking `ROADMAP.md` before `npm run check` passed                             |
| Context bloat               | Pasting whole files, transcripts or tables into prompts or tool outputs        |
| Leaking the benchmark       | Reading answer keys or tuning prompts on holdout tasks                         |

## 5. Skill rules

1. Check this routing table before starting any task.
2. Follow a skill's steps in order; when you skip one, say which and why.
3. When two skills conflict, the more specific one wins, and CLAUDE.md beats both.
4. If no skill fits and the task is non-trivial, use `spec-driven-development`.
5. If a skill is wrong or out of date, don't work around it silently: fix the skill in the same
   PR (as a separate commit) or raise it as a follow-up.

## Quick reference

| Phase of work | Skills and agents                                                              |
| ------------- | ------------------------------------------------------------------------------ |
| Define        | `spec-driven-development`, `/spec-designer`, `plan-auditor`                    |
| Plan          | `planning-and-task-breakdown`                                                  |
| Build         | `docs-researcher`, `/add-ipc-channel`, `/add-mcp-tool`, `context-engineering`  |
| Verify        | `test-writer`, `npm run check`, `npm run test:e2e`, `npm run bench` (from P12) |
| Review        | `/review-suite` (code-reviewer until P10-09), `plan-auditor` (deliverables)    |
| Ship          | `/finish-phase`                                                                |
