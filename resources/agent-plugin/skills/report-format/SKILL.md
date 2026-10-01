---
name: report-format
description: Structure and conventions for DataDesk reports written with save_report. Use when the user asks for a report, write-up, summary document, memo or something they can export or share.
---

# Report format for `save_report`

Reports are Markdown. The user reads them in the Report panel and can export them as Markdown or
PDF. Write for a busy reader who didn't see the conversation.

## Before writing

- Every number in the report must come from a tool result in this conversation. Don't estimate
  or invent values.
- Create the charts first with `create_chart` (follow the `chart-style` skill) and keep their
  `chartId`s.

## Structure

```markdown
# <Title that states the main finding>

**Dataset:** <name(s)> · **Rows analysed:** <n> · **Period:** <start – end>

## Key findings

- <Finding 1, with its number>
- <Finding 2, with its number>
- <Finding 3, with its number>

## Details

### <Topic 1>

<2–4 sentences explaining the finding and how it was measured.>

[[chart:<chartId>]]

### <Topic 2>

...

## Data quality and caveats

- <Missing data, duplicates, suspicious values, truncated results, small samples.>

## Method

<One short paragraph: which datasets, filters and aggregations; mention that figures come from
DuckDB SQL over the user's local files.>
```

## Conventions

- Embed a chart with a line containing **only** `[[chart:<chartId>]]`. Put a sentence before it
  saying what to look at. Never paste chart data or SQL result tables longer than ~10 rows.
- Small summary tables are fine (Markdown tables, ≤ 10 rows).
- Format numbers for reading: thousands separators, 1–2 decimals, units and currency.
- Keep it short: about 300–800 words. Prefer bullets for findings and short paragraphs for details.
- No raw HTML, images or external links (they won't render).
- If results were truncated or the data is incomplete, say so in "Data quality and caveats".

After `save_report`, tell the user the report is ready in the Report panel and summarise the key
findings in 2–3 sentences.
