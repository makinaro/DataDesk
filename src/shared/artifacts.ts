import { z } from 'zod';

/**
 * Charts and reports the analyst produces. The MCP server writes them to an artifact store
 * (userData/artifacts) and returns only ids to the model: chart data never goes back into the
 * model's context. The UI loads artifacts by id.
 */

export const ArtifactIdSchema = z.uuid();

export const ChartArtifactSchema = z.strictObject({
  id: ArtifactIdSchema,
  kind: z.literal('chart'),
  title: z.string().min(1).max(120),
  /** Sanitized Vega-Lite spec with the query rows inlined as data.values. */
  spec: z.record(z.string(), z.json()),
  sql: z.string().max(20_000),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type ChartArtifact = z.infer<typeof ChartArtifactSchema>;

export const ReportArtifactSchema = z.strictObject({
  id: ArtifactIdSchema,
  kind: z.literal('report'),
  title: z.string().min(1).max(200),
  markdown: z.string().max(100_000),
  /** Charts referenced in the markdown as [[chart:<id>]]. */
  chartIds: z.array(ArtifactIdSchema).max(50),
  createdAt: z.iso.datetime(),
});
export type ReportArtifact = z.infer<typeof ReportArtifactSchema>;

export type Artifact = ChartArtifact | ReportArtifact;

/** `[[chart:<uuid>]]` on its own line embeds a chart in a report. */
export const CHART_REF = /\[\[chart:([0-9a-f-]{36})\]\]/gi;

export function chartRefs(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(CHART_REF)].map((m) => (m[1] ?? '').toLowerCase()))];
}
