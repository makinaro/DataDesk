# Advanced-Analysis Track: Planning Index

| Field     | Value                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status    | P10–P23 plans drafted and every questionnaire answered by `@spec-designer`; **waiting for contributor review, the plan-auditor and maintainer sign-off, phase by phase** |
| Authority | `CLAUDE.md` > `DECISIONS.md` > P10 decision log (DS-nn) > `roadmap.md` > phase plans                                                                                     |
| Format    | `plans/_TEMPLATE.md`                                                                                                                                                     |
| Rendered  | `planning/html/` (git-ignored). Regenerate with `npm run plan:html`                                                                                                      |

## Start here

1. [roadmap.md](roadmap.md): vision, requirements, metrics, architecture, phases P10–P23, risks.
2. [audit/repo-audit-2026-10-02.md](audit/repo-audit-2026-10-02.md): what exists today and what
   the advanced-analysis track needs.
3. [plans/P10-questionnaire.md](plans/P10-questionnaire.md): **44 questions, each with a
   recommendation.** "Agree" is a complete answer. Any contributor may answer; sign your answer.
4. [plans/P10-requirements-and-scope.md](plans/P10-requirements-and-scope.md): the P10 plan and
   the decision log so far.
5. [decisions-draft.md](decisions-draft.md): draft entries D-030..D-045 from the P10 answers. They
   go into `DECISIONS.md` at P10 sign-off, not before.

## How a phase moves

```
plan + questionnaire drafted ─► /spec-designer answers ─► contributors review or override
   ─► plan-auditor (blind) ─► fixes ─► maintainer sign-off
   ─► work items copied into ROADMAP.md ─► branch phase-N-<slug> ─► build (CLAUDE.md loop)
   ─► plan-auditor on deliverables ─► /finish-phase ─► PR review ─► next phase
```

## Files

Every questionnaire has been answered by `/spec-designer` (signed `@spec-designer`). P10 is signed
off; P11–P23 have been through the plan-auditor (three rounds each, every finding fixed, defaults
applied) and wait for maintainer sign-off. The **Audit Qs** column counts the audit questions with
defaults in each `Pn-audit.md` (batched in [pending.md](pending.md)). Answers in later phases assume
the earlier phases' answers; a changed answer upstream may change answers downstream.

| Phase | Plan                                        | Questionnaire                | Qs  | Overturned | Maintainer | Audit Qs | Milestone     |
| ----- | ------------------------------------------- | ---------------------------- | --- | ---------- | ---------- | -------- | ------------- |
| P10   | `plans/P10-requirements-and-scope.md`       | `plans/P10-questionnaire.md` | 44  | 10         | 8          | —        | M1 Foundation |
| P11   | `plans/P11-architecture-and-design.md`      | `plans/P11-questionnaire.md` | 12  | 2          | 0          | 18       | M1 Foundation |
| P12   | `plans/P12-benchmark-and-scorer.md`         | `plans/P12-questionnaire.md` | 11  | 1          | 1          | 21       | M1 Foundation |
| P13   | `plans/P13-compute-sandbox-spike.md`        | `plans/P13-questionnaire.md` | 10  | 1          | 0          | 23       | M1 Foundation |
| P14   | `plans/P14-ds-server-journal-provenance.md` | `plans/P14-questionnaire.md` | 10  | 4          | 0          | 21       | MVP v0.1      |
| P15   | `plans/P15-data-wrangling.md`               | `plans/P15-questionnaire.md` | 10  | 3          | 0          | 24       | MVP v0.1      |
| P16   | `plans/P16-statistical-inference.md`        | `plans/P16-questionnaire.md` | 10  | 7          | 0          | 24       | MVP v0.1      |
| P17   | `plans/P17-machine-learning.md`             | `plans/P17-questionnaire.md` | 10  | 3          | 0          | 25       | v0.2          |
| P18   | `plans/P18-forecasting.md`                  | `plans/P18-questionnaire.md` | 8   | 5          | 0          | 22       | v0.2          |
| P19   | `plans/P19-critic-and-method-checks.md`     | `plans/P19-questionnaire.md` | 9   | 6          | 0          | 27       | v0.2          |
| P20   | `plans/P20-learning-and-memory.md`          | `plans/P20-questionnaire.md` | 10  | 7          | 1          | 19       | v0.3          |
| P21   | `plans/P21-outputs-and-analysis-ui.md`      | `plans/P21-questionnaire.md` | 8   | 4          | 0          | 17       | v0.3          |
| P22   | `plans/P22-evaluation.md`                   | `plans/P22-questionnaire.md` | 8   | 4          | 3          | 18       | v1.0          |
| P23   | `plans/P23-hardening-and-release.md`        | `plans/P23-questionnaire.md` | 9   | 7          | 1          | 23       | v1.0          |

## For the maintainer: decisions

The maintainer's answers are recorded in the questionnaires as **Maintainer decision (2026-10-03)**
lines. Open items and next steps are tracked in [pending.md](pending.md).

| Where                                   | Decision                                                                                        | Status          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- |
| P10 Q30                                 | ~1 h/week reading plans; PR review automated (DS-22)                                            | decided         |
| P10 Q31                                 | Ship unsigned with checksums; revisit signing at P23                                            | deferred to P23 |
| P10 Q35                                 | Two labellers, spread over several sessions                                                     | decided         |
| P10 Q40                                 | Maintainer decides disagreements; only one-way doors block work                                 | decided         |
| P10 Q41                                 | No human approval; the automated review suite plus CI gates every PR (DS-22)                    | decided         |
| P20 Q10                                 | Sealed half of the holdout used once in P20                                                     | decided         |
| P22 Q6                                  | Four safety metrics never waived; waived quality targets logged as limitations                  | decided         |
| P23 Q7                                  | CI builds releases; maintainer publishes the draft                                              | decided         |
| P10 Q19, Q23, Q44 · P12 Q7 · P22 Q3, Q4 | Money items: **planned costs only**, each approved explicitly at the start of its phase (DS-21) | planned         |

**Planned API spend for benchmark work across the track:** about **$450–550** in total, spread
across contributors' own keys. **Not approved yet**: each phase's share needs the maintainer's
explicit approval before that phase starts coding or running (DS-21). The breakdown, at about $13
per provider pass:

- baseline: $26
- six single-run phase gates on both providers: ≈ $156
- MVP gate: $78
- learning sequence plus holdout-a: ≈ $90
- final runs: $63
- ablations: $72
- plus noise re-runs

Re-projected after P13 and P14 measure real per-task costs.

## The questions that shape the most

| Question | Why it matters                                                       |
| -------- | -------------------------------------------------------------------- |
| Q8       | The data size target decides whether Pyodide passes the P13 gate     |
| Q10      | Per-execution limits are the sandbox's resource boundary             |
| Q15      | The ML protocol defines what "test-set contamination" (M-06) means   |
| Q19, Q21 | Benchmark size and targets define every exit criterion from P14 on   |
| Q25      | Lesson approval rules decide whether self-learning can mask problems |
| Q28      | How strict provider parity is decides the size of every phase        |
| Q34–Q36  | Which model judges, how it is calibrated, and whether it can block   |
| Q37      | First context budgets per role, the starting point of ADR-09         |
| Q40–Q42  | Decision authority, review rule and branch model for contributors    |

## New here?

Read `CONTRIBUTING.md` (written in P10-08) for setup, roles, claiming work and reviews. The
planning rules are in roadmap §18.

## Tools

- **For coding agents:** start every session with the `using-agent-skills` skill (CLAUDE.md
  session start, step 5). It routes work to `spec-driven-development` (writing a phase spec),
  `planning-and-task-breakdown` (a signed-off phase into tasks) and the other skills. See roadmap §18.1a.

- **Render to HTML:** `npm run plan:html` (first time: `npm run plan:setup`). On Windows you can also run
  `planning\md2html.cmd`. One file: `node planning/tools/md2html/md2html.mjs <file.md> --open`.
- **Answer a questionnaire:** `/spec-designer planning/plans/Pn-questionnaire.md`. A senior
  system architect answers every open question with its reasoning, signs `@spec-designer`, and
  ends with a summary of what needs the maintainer. Contributors then agree or override.
- **Blind audit:** the `plan-auditor` agent (`.claude/agents/plan-auditor.md`) reviews a phase's
  plan and questionnaire before it starts, and its deliverables before sign-off.
