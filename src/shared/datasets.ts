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

/** Scalar cell values after conversion to JSON-safe types. */
export const CellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type Cell = z.infer<typeof CellSchema>;

/** Lowercase, replace unsafe characters with `_`, and make sure it starts with a letter. */
export function suggestDatasetName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase();
  let name = base.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(name)) name = `ds_${name}`;
  return name.slice(0, 63) || 'dataset';
}
