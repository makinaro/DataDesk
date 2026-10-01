---
name: chart-style
description: How to choose and write Vega-Lite charts for DataDesk's create_chart tool. Use before every create_chart call, or when the user asks for a chart, plot, graph or visualization.
---

# Chart style for `create_chart`

`create_chart` takes a **title**, a read-only **SQL** query (up to 5 000 rows) and a Vega-Lite v6
**spec without `data`**. The query result becomes the data. The tool returns a `chartId`.

## Hard rules (the tool rejects violations)

- No `data`, `datasets`, `url`, `href` or `usermeta` anywhere in the spec.
- Allowed top-level keys: `mark`, `encoding`, `layer`, `hconcat`, `vconcat`, `concat`, `facet`,
  `repeat`, `resolve`, `transform`, `params`, `width`, `height`, `title`, `description`, `config`,
  `view`, `padding`, `autosize`.
- Every `field` must be a column the SQL returns. Alias columns in SQL
  (`sum(units) AS total_units`) and reference the alias.

## Choose the chart from the question

| Question                            | Chart                                                          |
| ----------------------------------- | -------------------------------------------------------------- |
| Compare a measure across categories | Bar (horizontal if labels are long or there are >8 categories) |
| Change over time                    | Line (`temporal` x); bar if fewer than ~8 periods              |
| Distribution of one measure         | Histogram: `bin: true` on x, `count()` on y                    |
| Relationship between two measures   | Point (scatter), optional `color` by category                  |
| Part-to-whole with ≤ 5 parts        | Stacked bar (avoid pie charts)                                 |

## Do the work in SQL

Aggregate, filter, sort and limit in the query; keep the spec simple. For top-N charts, use
`ORDER BY … DESC LIMIT 10`, and in the spec sort the axis by the measure:
`"sort": "-x"` (horizontal bars) or `"sort": "-y"`.

## Encoding conventions

- Types: `quantitative` for measures, `nominal` for categories, `ordinal` for ordered categories,
  `temporal` for dates (cast with `CAST(col AS DATE)` or `date_trunc` in SQL).
- Axis titles in plain words with units: `"title": "Revenue (USD)"`.
- Numbers: `"format": ",.0f"`; percentages: `"format": ".1%"`.
- Use `color` only for a meaningful category (≤ 8 values). Otherwise leave the default color.
- Add `"tooltip"` with the key fields so users can hover for exact values.
- Let the chart size itself: omit `width`/`height`, or use `"width": "container"`.

## Example

SQL: `SELECT region, sum(units) AS total_units FROM sales GROUP BY region ORDER BY total_units DESC`

```json
{
  "mark": "bar",
  "encoding": {
    "y": { "field": "region", "type": "nominal", "sort": "-x", "title": "Region" },
    "x": {
      "field": "total_units",
      "type": "quantitative",
      "title": "Units sold",
      "format": ",.0f"
    },
    "tooltip": [{ "field": "region" }, { "field": "total_units", "format": ",.0f" }]
  }
}
```

Title it with the takeaway when it's clear ("West sold the most units"), otherwise describe it
("Units sold by region").
