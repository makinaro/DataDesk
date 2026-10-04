---
name: spec-driven-development
description: Write the DataDesk spec before any code. The spec is a phase plan plus its questionnaire in planning/plans/, and the docs/ds/ documents they produce, gated by answers, the plan-auditor and maintainer sign-off. Use when starting a new phase, a new feature or a significant change that has no signed-off plan; when requirements are vague; or when one request bundles several independently testable capabilities that must first be split into phases or work items.
argument-hint: '[phase number or short feature description]'
---

# Spec-driven development on DataDesk

Code without a spec is guessing. On DataDesk the spec is not a single `SPEC.md`: it is the
**planning set** this repo already uses. The roadmap holds the capability map, each phase has a
plan and a questionnaire, and decisions land in `DECISIONS.md`. This skill owns how a spec gets
written, clarified and approved. `planning/plans/_TEMPLATE.md` owns its format.

## The gated workflow

```
SCOPE CHECK ──► SPECIFY ──► ANSWER ──► AUDIT ──► SIGN-OFF ──► (planning-and-task-breakdown)
  roadmap        plan +       /spec-      plan-     maintainer
  §9–§10         questionnaire designer   auditor
```

Do not advance until the current gate is passed. Each gate leaves a file behind.

### Gate 0: Scope check (is this one phase, part of one, or several?)

The roadmap (`planning/roadmap.md` §9–§10) **is** the capability map: phases with stable ids
(P10…P23), dependencies and milestones. Before writing a spec:

1. Find where the request fits. Is it already a work item (`Pn-xx`) in a phase? Then you're
   refining that phase's plan, not writing a new spec.
2. If it is new, decide its size:
   - fits inside the current phase's objective → **add a work item** to that plan, marked
     "added by <decision>", and a questionnaire item if it needs a choice;
   - an independently testable capability with its own users, data or metrics → **a new phase**:
     propose its row for roadmap §9 (id, name, dependencies, milestone, size) and its §10 section;
   - several capabilities bundled together → **split first**: propose one row per capability
     with the dependency direction (no cycles) and a build order, and have that **map approved
     before any phase spec is written**.
3. Never renumber or rename existing phase or work-item ids. Add, don't reshuffle.

### Gate 1: Specify

**Surface assumptions first**, in the conversation and in the plan's §1:

```
ASSUMPTIONS I'M MAKING:
1. This lands in phase P15 (wrangling), after P14's journal exists.
2. It needs a new datadesk-ds tool, so both providers and the scope table change (DS-04).
3. It touches no CLAUDE.md security rule.
→ Correct me now, or these go into the plan as written.
```

Then write `planning/plans/Pn-<slug>.md` and `Pn-questionnaire.md` in the `_TEMPLATE.md` format.
On DataDesk the six classic spec areas live in fixed places:

| Spec area         | Where it lives on DataDesk                                   | What the spec must state                                             |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Objective         | Plan header (Objective, Rule for the phase), roadmap §10     | What and why, and what it must not drift into                        |
| Commands          | CLAUDE.md npm scripts                                        | Only the commands this phase adds (e.g. `npm run bench`), with flags |
| Project structure | `docs/ARCHITECTURE.md`, plan §4 Deliverable Map              | Exact file paths for every deliverable                               |
| Code style        | CLAUDE.md "Code conventions"; one existing file as the model | Name the existing file the new code should resemble                  |
| Testing strategy  | CLAUDE.md "Testing rules"; plan §5 Exit Checklist            | Which tests prove each exit criterion; bench metrics where relevant  |
| Boundaries        | CLAUDE.md security rules; DS-nn; plan "Rule for the phase"   | The three tiers below, specific to this phase                        |

**Boundaries in three tiers**, written into the plan's §1 or §6:

- **Always:** zod both ways; one scope table for both providers; journal written by code;
  `npm run check` per task; the docs-researcher before fast-moving APIs.
- **Ask first** (becomes a questionnaire item): new dependencies; a new process, window or
  protocol; changes to persisted schemas (bump `schemaVersion` + migration); anything that
  changes a metric's meaning; anything that costs benchmark money.
- **Never:** weaken a CLAUDE.md security rule; let an LLM compute or certify a score; read
  `.env*`, `test-data/private/` or `bench/answer-keys/`; ship a provider-only feature; push
  without the contributor's rule allowing it.

**Turn vague requests into success criteria.** Every exit criterion names a number and a file it
comes from:

```
REQUEST:  "Make the analyst better at spotting leakage"
CRITERIA: - Leakage traps detected ≥ 80% on dev (M-02 slice, bench/results/pNN/)
          - Warning precision on clean control tasks ≥ 80% (M-03)
          - 0 test-lock violations (M-06)
→ Are these the right targets?
```

Questions go into the **questionnaire**, never left in prose: one decision per question, with
what it blocks and a recommendation, so "agree" is a complete answer.

### Gate 2: Answer

Run `/spec-designer planning/plans/Pn-questionnaire.md`. It answers every open question
critically and flags what only the maintainer may decide. Contributors then agree or override
in the answer blocks (signed `— @handle`).

### Gate 3: Audit

Run the `plan-auditor` agent on the plan and the answered questionnaire. Save its report as
`planning/plans/Pn-audit.md`. Fix every Critical and Major finding in the plan (or route it as a
work item), and re-run the audit if a finding changed a decision.

### Gate 4: Sign-off

The maintainer signs off. Then:

1. Answers become D-NNN entries in `DECISIONS.md` (numbers assigned at merge).
2. The roadmap is updated if any id, target or dependency changed (with a revision row).
3. `npm run plan:html`.
4. Hand over to `planning-and-task-breakdown`.

## Keeping the spec alive

- **Decisions change → spec first.** If implementation shows a decision is wrong, stop, append a
  new D-NNN that supersedes the old one (never edit history), update the plan, then code.
- **Scope changes are visible.** An added or cut work item is edited in the plan with its reason;
  `ROADMAP.md` follows.
- **PRs cite the spec.** Each PR names its work item (`Pn-xx`) and the decisions it implements.
- **Public wording.** Planning files reference only this repository; no other projects and no
  named contributors (DS-16, DS-18).

## Common rationalizations

| Rationalization                         | Reality here                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "It's small, no spec needed"            | Then it's a work item in an existing plan with acceptance criteria: two lines, still written down |
| "I'll update the plan after coding"     | That's documentation. The plan's value is the questions answered before the code                  |
| "The recommendation is obviously right" | The plan-auditor treats every recommendation as a junior's proposal, and so should you            |
| "Both providers can come later"         | DS-04: parity is a phase exit rule, so it's part of the spec now                                  |
| "This metric is obvious"                | If it has no numerator, denominator and source file, it isn't a metric                            |

## Red flags

- Code under `src/` for a phase whose questionnaire isn't signed off
- A plan without a Deliverable Map with exact paths, or an exit criterion without evidence
- Decisions made in chat or a PR comment and never written to `DECISIONS.md`
- A questionnaire question that the roadmap or a decision already answers
- One plan covering two independently testable capabilities
- A new tool, window or schema with no threat-model row (`docs/ds/08`)

## Verification before handing over

- [ ] Scope check done; the work has a phase id and work-item ids
- [ ] Plan and questionnaire follow `_TEMPLATE.md`; every plan field is filled
- [ ] Assumptions listed; boundaries in three tiers
- [ ] Every exit criterion is measurable from files, not from the agent's own report
- [ ] Questionnaire answered (`/spec-designer`), reviewed by contributors
- [ ] `Pn-audit.md` exists; Critical and Major findings resolved
- [ ] Maintainer sign-off; decisions appended; HTML re-rendered
