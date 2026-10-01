import { z } from 'zod';

/**
 * Charts and reports the analyst produces. The MCP server writes them to an artifact store
 * (userData/artifacts) and returns only ids to the model: chart data never goes back into the
 * model's context. The UI loads artifacts by id.
 */

export const ArtifactIdSchema = z.uuid();

/** Titles end up in tool-result summaries and file names, so they must be one line. */
const singleLine = (s: string) =>
  !Array.from(s).some((ch) => ch.charCodeAt(0) < 0x20 || ch === '');
export const ChartTitleSchema = z
  .string()
  .min(1)
  .max(120)
  .refine(singleLine, 'The title must be a single line without control characters.');
export const ReportTitleSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(singleLine, 'The title must be a single line without control characters.');

export const ChartArtifactSchema = z.strictObject({
  id: ArtifactIdSchema,
  kind: z.literal('chart'),
  title: ChartTitleSchema,
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
  title: ReportTitleSchema,
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
