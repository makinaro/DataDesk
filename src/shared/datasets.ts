import { z } from 'zod';

/**
 * Dataset shapes shared by the MCP server (producer), main process (UI MCP client) and renderer.
 * Dataset names become DuckDB view names, so they are restricted to safe SQL identifiers.
 */
export const DatasetNameSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]{0,62}$/,
    'Use lowercase letters, digits and underscores, starting with a letter (max 63 chars).',
  );

export const DatasetFormatSchema = z.enum(['csv', 'parquet', 'json', 'xlsx']);
export type DatasetFormat = z.infer<typeof DatasetFormatSchema>;

export const CatalogEntrySchema = z.strictObject({
  name: DatasetNameSchema,
  path: z.string().min(1),
  format: DatasetFormatSchema,
  sizeBytes: z.number().int().nonnegative(),
  registeredAt: z.iso.datetime(),
  /** Excel only: which sheet to read. */
  sheet: z.string().max(100).optional(),
  /** Counted at registration so listings never scan files. Absent if counting timed out. */
  rowCount: z.number().int().nonnegative().optional(),
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

export const ColumnInfoSchema = z.strictObject({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
});
export type ColumnInfo = z.infer<typeof ColumnInfoSchema>;

export const DatasetSummarySchema = z.strictObject({
  name: DatasetNameSchema,
  format: DatasetFormatSchema,
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  registeredAt: z.string(),
  rowCount: z.number().int().nonnegative().nullable(),
  columnCount: z.number().int().nonnegative().nullable(),
  /** Set when the source file is missing or unreadable. The dataset stays listed so the user can fix it. */
  error: z.string().optional(),
});
export type DatasetSummary = z.infer<typeof DatasetSummarySchema>;

/** A result cell: any JSON value (nested DuckDB types arrive as arrays/objects). */
export const CellSchema = z.json();
export type Cell = z.infer<typeof CellSchema>;

export const RegisteredDatasetSchema = z.object({
  name: DatasetNameSchema,
  format: DatasetFormatSchema,
  path: z.string(),
  /** Null if counting didn't finish within the query timeout. */
  rowCount: z.number().int().nonnegative().nullable(),
  columns: z.array(ColumnInfoSchema),
});
export type RegisteredDataset = z.infer<typeof RegisteredDatasetSchema>;

/** A query result as returned by run_sql and sample_rows (and shown as previews). */
export const QueryTableSchema = z.object({
  columns: z.array(z.object({ name: z.string(), type: z.string() })),
  rows: z.array(z.array(CellSchema)),
  rowCount: z.number().int().nonnegative(),
  /** More rows existed than were returned (row cap or byte budget). */
  truncated: z.boolean(),
  /** String cells shortened to the cell size limit. */
  clippedCells: z.number().int().nonnegative(),
});
export type QueryTable = z.infer<typeof QueryTableSchema>;

export const DatasetPreviewSchema = QueryTableSchema;
export type DatasetPreview = QueryTable;

export const ColumnProfileSchema = z.object({
  dataset: z.string(),
  column: z.string(),
  type: z.string(),
  rowCount: z.number().int().nonnegative(),
  nullCount: z.number().int().nonnegative(),
  nullFraction: z.number(),
  distinctCount: z.number().int().nonnegative(),
  min: CellSchema,
  max: CellSchema,
  mean: z.number().nullable(),
  stddev: z.number().nullable(),
  quantiles: z.object({ p25: CellSchema, p50: CellSchema, p75: CellSchema }).nullable(),
  topValues: z.array(z.object({ value: CellSchema, count: z.number().int() })),
});
export type ColumnProfile = z.infer<typeof ColumnProfileSchema>;

/** Lowercase, replace unsafe characters with `_`, and make sure it starts with a letter. */
export function suggestDatasetName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase();
  let name = base.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(name)) name = `ds_${name}`;
  return name.slice(0, 63) || 'dataset';
}
