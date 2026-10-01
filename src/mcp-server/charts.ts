import { randomUUID } from 'node:crypto';
import { compile } from 'vega-lite';
import { z } from 'zod';
import type { ArtifactStore } from '../node-shared/artifactStore';
import {
  ArtifactIdSchema,
  chartRefs,
  type ChartArtifact,
  type ReportArtifact,
} from '../shared/artifacts';
import { rowsToValues, sanitizeVegaLiteSpec } from '../shared/vegaSpec';
import type { DatasetDb } from './db/datasetDb';

/** A problem the model can fix (bad spec, unknown field, missing chart). */
export class ArtifactInputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ArtifactInputError';
  }
}

export interface CreateChartInput {
  title: string;
  sql: string;
  spec: Record<string, unknown>;
}

export const CreatedChartSchema = z.object({
  chartId: z.string(),
  title: z.string(),
  rowCount: z.number().int(),
  truncated: z.boolean(),
  columns: z.array(z.string()),
});
export type CreatedChart = z.infer<typeof CreatedChartSchema>;

/**
 * Runs the (guarded) SQL, inlines its rows into the sanitized spec, compile-checks it with
 * Vega-Lite, and stores it. Only the id and a summary go back to the model.
 */
export async function createChart(
  db: DatasetDb,
  store: ArtifactStore,
  input: CreateChartInput,
  signal?: AbortSignal,
): Promise<CreatedChart> {
  const clean = sanitizeVegaLiteSpec(input.spec);
  if (!clean.ok) throw new ArtifactInputError(`Invalid chart spec: ${clean.error}`);

  const result = await db.queryForChart(input.sql, signal);
  const columns = result.columns.map((c) => c.name);
  if (result.rowCount === 0) {
    throw new ArtifactInputError('The chart query returned no rows; nothing to plot.');
  }
  const missing = clean.fields.filter((f) => !columns.includes(f) && !clean.derived.includes(f));
  if (missing.length > 0) {
    throw new ArtifactInputError(
      `The spec uses fields the query doesn't return: ${missing.join(', ')}. ` +
        `Query columns: ${columns.join(', ')}.`,
    );
  }

  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    ...clean.spec,
    data: { values: rowsToValues(columns, result.rows) },
  };
  try {
    compile(spec as Parameters<typeof compile>[0]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ArtifactInputError(
      `Vega-Lite could not compile the spec: ${reason.split('\n')[0] ?? reason}`,
      { cause: error },
    );
  }

  const chart: ChartArtifact = {
    id: randomUUID(),
    kind: 'chart',
    title: input.title,
    spec: spec as ChartArtifact['spec'],
    sql: input.sql,
    rowCount: result.rowCount,
    truncated: result.truncated,
    createdAt: new Date().toISOString(),
  };
  await store.saveChart(chart);
  return {
    chartId: chart.id,
    title: chart.title,
    rowCount: chart.rowCount,
    truncated: chart.truncated,
    columns,
  };
}

export const SavedReportSchema = z.object({
  reportId: z.string(),
  title: z.string(),
  chartIds: z.array(z.string()),
});
export type SavedReport = z.infer<typeof SavedReportSchema>;

const MAX_REPORT_CHARTS = 50;

/** Stores a Markdown report after checking every [[chart:<id>]] reference exists. */
export async function saveReport(
  store: ArtifactStore,
  input: { title: string; markdown: string },
): Promise<SavedReport> {
  const ids = chartRefs(input.markdown);
  const malformed = ids.filter((id) => !ArtifactIdSchema.safeParse(id).success);
  if (malformed.length > 0) {
    throw new ArtifactInputError(
      `These chart references are not valid chart ids: ${malformed.join(', ')}. ` +
        'Use the chartId returned by create_chart.',
    );
  }
  if (ids.length > MAX_REPORT_CHARTS) {
    throw new ArtifactInputError(
      `A report can embed at most ${String(MAX_REPORT_CHARTS)} charts (found ${String(ids.length)}).`,
    );
  }
  const found = await Promise.all(ids.map((id) => store.getChart(id)));
  const unknown = ids.filter((_, i) => found[i] === undefined);
  if (unknown.length > 0) {
    throw new ArtifactInputError(
      `The report references charts that don't exist: ${unknown.join(', ')}. ` +
        'Use the chartId returned by create_chart.',
    );
  }
  const report: ReportArtifact = {
    id: randomUUID(),
    kind: 'report',
    title: input.title,
    markdown: input.markdown,
    chartIds: ids,
    createdAt: new Date().toISOString(),
  };
  await store.saveReport(report);
  return { reportId: report.id, title: report.title, chartIds: ids };
}
