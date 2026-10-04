# Phase Plan Template and Authoring Rules

Every phase in the advanced-analysis track has a plan (`Pn-<slug>.md`) and a questionnaire (`Pn-questionnaire.md`)
in this format. P10 is the worked example. After the blind audit, a phase also has `Pn-audit.md`.

## Binding context every plan must respect

- **Authority order:** `CLAUDE.md` (security rules, conventions) > `DECISIONS.md` (D-NNN) > the
  P10 decision log (DS-nn, until promoted to D-NNN) > `planning/roadmap.md` > the phase drafts. A
  plan may not contradict a decision; if it needs to revisit one, it raises a questionnaire item
  that says so.
- **Platform:** Electron + TypeScript strict + React. The analyst runs on the Claude Agent SDK and
  the OpenAI Agents SDK with the user's keys. **Both providers, every feature** (DS-04).
- **Code, not the agent:** anything scored, safety-relevant or reproducible (journal, splits,
  test locks, provenance, method checks, scores, lesson validation) runs as code. Agents write
  code, plans and prose. No plan may have an LLM compute a metric or write a file the scorer reads.
- **Sandbox:** analysis code runs only in the compute host, with no network, no keys, and no
  files outside its grants (NFR-01).
- **Privacy:** the model sees aggregates and ≤ 20-row samples only (DS-09).
- **Autonomy:** fully autonomous within budget (DS-06); dataset and Hub approvals remain.
- **Budget:** $1 per analysis and $15 per benchmark pass per provider by default (DS-08).
- **Measurement:** DS-Bench from P12 on; the holdout is opened only in P22, except holdout-a once in P20 (D-036).
- **Collaboration:** several contributors, one maintainer who signs off (DS-18, roadmap §18). Every question needs a recommendation, and answers are signed (`— @handle`).

## Plan file structure (`Pn-<slug>.md`)

```
# Pn Plan: <Name>

| Field | Value |  Phase · Milestone · Objective (roadmap wording) · Entry criteria · Size (roadmap) ·
                    Branch · Inputs (files) · Outputs (deliverables with file paths) · Status

**Rule for the phase:** one sentence on what this phase must not drift into.

## 1. Inherited Decisions and Inputs
Table: decision (D-NNN / DS-nn) or doc section → what it forces in this phase.

## 2. Session Plan
Table: Session · Work items · Output at end of session. Order by dependency.

## 3. Work Item Breakdown
One subsection per roadmap work item Pn-xx (keep the IDs; add items only if a decision forces it,
and say which). Each: checkbox tasks · **Done when:** one observable condition ·
**Depends on:** Qn items, if any.

## 4. Deliverable Map
Table: Deliverable (Dn-x) · File path · Produced by · Satisfies (ECn-x).

## 5. Exit Checklist
Table: EC / DoD · Check · Evidence · State (all "Open"). Roadmap ECs plus DoD 1–7 (roadmap §17);
say which DoD items do not apply.

## 6. Phase Risks
Table: Risk · Mitigation. 3–6 rows; cite roadmap R-nn where one exists.

## 7. Hand-off to P(n+1)
Bullets: what the next phase consumes, by file path.
```

## Questionnaire structure (`Pn-questionnaire.md`)

```
# Pn Questionnaire: Decisions Needed Before <Phase Name>

| Field | Value |  Purpose · Already decided (decisions that bind) · How to answer

## A. <Theme>
**Qn. <Question in one sentence?>** One or two sentences of context. Options if natural.
*Blocks: <ECn-x, Pn-xx>.*

> **Recommendation (Claude):** the default and why, in ≤ 3 sentences, so "agree" is enough.

> **Answer Qn:**
>
> _(write here)_
```

Rules for questions:

- Only questions whose answer changes the work. No question that a decision or doc already answers.
- Every question answerable in one sentence or by "agree".
- Group by theme (A, B, C …); number Q1.. per file; each names what it blocks.

## Style

- Tables over prose. Plans under ~250 lines, questionnaires under ~200 (P10 is longer by design).
- Reference files by path and items by ID (Pn-xx, ECn-x, Dn-x, M-nn, R-nn, FR-nn, NFR-nn, D-NNN, DS-nn).
- Do not invent metric, FR or NFR IDs in a phase plan; raise a question instead.
- After editing anything under `planning/`, run `npm run plan:html`.
