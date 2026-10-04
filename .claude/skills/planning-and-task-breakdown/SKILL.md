---
name: planning-and-task-breakdown
description: Turn a signed-off DataDesk phase plan into small, verifiable, ordered tasks. Tasks are recorded in ROADMAP.md as checkboxes and as one GitHub issue each, with acceptance criteria, verification commands, dependencies and files. Use right after a phase is signed off, when a work item feels too big or vague to start, when contributors need to split a phase between them, or when the implementation order isn't obvious.
argument-hint: '[phase number]'
---

# Planning and task breakdown on DataDesk

A signed-off phase plan (`planning/plans/Pn-<slug>.md`) says **what** and **why**. This skill
turns its work items into tasks that one agent session can implement, test and verify. Good
breakdown is the difference between a phase that lands cleanly and a tangled branch.

**Entry check.** The phase must be signed off (spec-driven-development Gate 4). If it isn't, stop
and run `spec-driven-development` first. Planning is read-only: no `src/` changes in this skill.

**Money check (DS-21).** If any task in the phase spends API money (a benchmark run, gate,
learning sequence or evaluation), list those tasks with their projected cost at the top of the
breakdown. The phase's spend must be **explicitly approved by the maintainer** and recorded in the
plan before those tasks, or the code that triggers them, start. Mark each paid task `💲 needs
approved spend` in its issue.

## Step 1: Read before you split

- The phase plan, its answered questionnaire, its audit, and the decisions it inherits (§1)
- The code the phase touches, to find existing patterns (the file each new piece should resemble)
- `docs/ds/06-context-contracts.md`, `07-interfaces.md`, `08-threat-model.md` for affected roles,
  tools and surfaces

Write down risks and unknowns as you go; unknown APIs become `docs-researcher` tasks.

## Step 2: Map the dependency graph

Most DataDesk features follow the same shape. Build from the bottom up:

```
zod schema in src/shared/ (contract, schemaVersion, valid + invalid sample tests)
   │
   ├── server or main implementation (datadesk-mcp / datadesk-ds tool, IPC handler, journal, checks)
   │      │
   │      ├── agent wiring: scope table row, init-guard allowlist, Claude options, OpenAI tool  ◄─ parity test
   │      │      │
   │      │      └── runtime skill / prompt changes (context contract, output-size test)
   │      │
   │      └── renderer: preload method → UI component → component tests → e2e
   │
   └── migration of persisted data (fixture of the old version)
            │
            └── bench task or gate run (only for phases with bench gates)
```

**Contract first.** The zod schema is the agreement between pieces. Once it is merged into the
phase branch, the pieces above it can be built in parallel by different contributors.

## Step 3: Slice vertically

Each task delivers one thing that works end to end and can be tested, not a layer of everything.

**Bad (horizontal):**
`Task 1: all schemas` · `Task 2: all tools` · `Task 3: all UI` · `Task 4: wire it up`

**Good (vertical):**
`Task 1: save_plan works end to end (schema + tool + journal entry + both providers + test)`
`Task 2: run_python refuses without a plan (guard + error message + test)`
`Task 3: plan card shows in turn steps (preload + component + component test)`

Exception: a shared contract (one schema used by several slices) is its own first task.

## Step 4: Write each task

Each task is one GitHub issue (P10 Q43) and one line in `ROADMAP.md` under its phase:

```markdown
## Pn-xx.k: <short imperative title>

**Work item:** Pn-xx · **Decisions:** D-NNN, DS-nn, Pn Qm
**Description:** One paragraph: what this task makes true.

**Acceptance criteria:**

- [ ] <specific, testable condition>
- [ ] <specific, testable condition>
- [ ] Both providers: parity test passes (if the analyst's tools, roles or limits changed)

**Verification:**

- [ ] `npm run check`
- [ ] `npx vitest run tests/<mirrored path>`
- [ ] `npm run test:e2e` (if UI, windows, IPC or packaging changed)
- [ ] `npm run bench -- --tasks dev …` (only if this task closes a bench gate)
- [ ] Manual: <what to look at in `npm run dev`, if anything>

**Dependencies:** Pn-xx.j (or "none")
**Files likely touched:** `src/…`, `tests/…` (≤ 5 files; more means split)
**Size:** XS | S | M
**Branch:** `phase-N/<item-id>-<slug>`
```

## Step 5: Order, checkpoints and claiming

Order the tasks so that:

1. dependencies are satisfied (the contract first);
2. every task leaves `npm run check` green and the app runnable;
3. **the riskiest task comes first** (an unverified SDK fact, the sandbox, anything security-relevant), so failure is cheap;
4. a **checkpoint** follows every 2–3 tasks.

```markdown
### Checkpoint Pn-A (after tasks .1–.3)

- [ ] `npm run check` and `npm run test:e2e` green on the phase branch
- [ ] Escape suite still green (from P13 on)
- [ ] One end-to-end flow works in `npm run dev`
- [ ] Contributors review before continuing
```

Contributors **claim** a task by assigning its issue before starting. One task per branch and per
squash-merged PR into the phase branch (P10 Q42). Once its committed `/review-suite` verdict has no
blocker, CI is green and a **human peer who isn't the author has approved it** (DS-22), **a human
merges it**. Agents never merge (DS-23).

## Task sizing

| Size | Files | Example on DataDesk                                                    |
| ---- | ----- | ---------------------------------------------------------------------- |
| XS   | 1     | Add a field to a zod schema with its tests                             |
| S    | 1–2   | A new IPC channel via `/add-ipc-channel`                               |
| M    | 3–5   | A new analyst tool end to end via `/add-mcp-tool`, both providers      |
| L    | 6–8   | **Split it.** E.g. the context builder = shaping + briefs + state card |
| XL   | 8+    | **Never.** That's a work item, not a task                              |

Split further when a task takes more than one session, needs more than three acceptance criteria,
touches two independent subsystems (e.g. journal _and_ renderer), or has "and" in its title.

## Where the plan lives

- The **phase plan** (`planning/plans/Pn-<slug>.md`) stays the design record. Add a "Task
  breakdown" section to it listing task ids in order, with their issue numbers and checkpoints.
- **`ROADMAP.md`** gets the phase's tasks as checkboxes. It is the source of truth for "done",
  ticked in the same commit as the task (CLAUDE.md).
- **GitHub Issues** hold the full task text (Step 4), created by the issue-sync script (P10-08).
  There is no `tasks/todo.md` on this project.

**Never overwrite an unfinished plan.** If `ROADMAP.md` already has unchecked tasks for this phase:

- re-planning the same phase at the maintainer's request → update in place and say what changed;
- a different phase → **stop and ask.** Don't delete, close or rewrite another phase's open tasks
  or issues; they may be in progress on someone else's machine.

## Parallel work between contributors

- **Safe in parallel:** independent vertical slices once their contract is merged; tests for
  finished code (`test-writer`); docs; runtime skill text.
- **Strictly sequential:** persisted-schema changes and migrations; scope-table and init-guard
  edits (one at a time, since they conflict); anything changing a bench gate's meaning.
- **Coordinate first:** two slices sharing a tool or IPC contract (merge the contract first).

## Common rationalizations

| Rationalization                           | Reality here                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "The plan's work items are tasks already" | Work items are design units; most need 2–5 tasks to be one-session sized                                 |
| "I'll wire OpenAI at the end"             | Then the last task is XL and the parity test fails at the phase exit. Each slice includes both providers |
| "Tests can be a separate task"            | A task without tests isn't done (CLAUDE.md per-task loop). Tests are in the same task                    |
| "Checkpoints slow us down"                | They're where a second contributor catches what the first one's agent missed                             |
| "The old ROADMAP entries look stale"      | Unchecked boxes may be someone's work in progress. Ask                                                   |

## Red flags

- A task without acceptance criteria or verification commands
- A task touching more than ~5 files, or both main-process state and the renderer
- The OpenAI half of a feature scheduled "later"
- Schema changes without a `schemaVersion` bump and migration fixture
- Riskiest work scheduled last
- No checkpoints; tasks not claimed; two people on one branch

## Verification before implementation starts

- [ ] The phase is signed off; its decisions are in `DECISIONS.md`
- [ ] Every task has acceptance criteria, verification commands, dependencies, files and a size of M or smaller
- [ ] The contract tasks come first; the riskiest task is early
- [ ] Checkpoints every 2–3 tasks
- [ ] Tasks are in `ROADMAP.md` and as GitHub issues; the plan lists them in order
- [ ] No other phase's open tasks were touched
- [ ] Contributors have reviewed the breakdown
