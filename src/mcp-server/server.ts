import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  ColumnInfoSchema,
  ColumnProfileSchema,
  DatasetNameSchema,
  DatasetSummarySchema,
  QueryTableSchema,
  RegisteredDatasetSchema,
} from '../shared/datasets';
import { DatasetUnavailableError, QueryTimeoutError, type DatasetDb } from './db/datasetDb';
import { MAX_SQL_LENGTH, ReadOnlyViolation } from './db/readOnlyGuard';
import { getSchema, listDatasets, profileColumn, registerDataset, sampleRows } from './datasets';
import { ImportPathError, SUPPORTED_EXTENSIONS, type ImportPolicy } from './fileAccess';

export const SERVER_NAME = 'datadesk';
export const SERVER_VERSION = '0.1.0';

export const TOOL_NAMES = [
  'register_dataset',
  'list_datasets',
  'get_schema',
  'sample_rows',
  'profile_column',
  'run_sql',
] as const;

export interface ServerDeps {
  db: DatasetDb;
  importPolicy: ImportPolicy;
}

// Output schemas come from src/shared/datasets.ts, the single source of truth for these shapes
// (they are also sent to clients as JSON Schema via tools/list).

// ---- Result helpers ----

function ok(structured: Record<string, unknown>, summary: string): CallToolResult {
  // Text content mirrors the structured result so clients that only read `content` still work.
  return {
    content: [{ type: 'text', text: `${summary}\n${JSON.stringify(structured)}` }],
    structuredContent: structured,
  };
}

/**
 * Errors are returned as tool results (isError) with a message the model can act on, never as
 * protocol errors. Expected failures get their own message; anything else only its first line,
 * so no stack traces or internal paths leak.
 */
function fail(error: unknown): CallToolResult {
  let message: string;
  if (
    error instanceof ReadOnlyViolation ||
    error instanceof QueryTimeoutError ||
    error instanceof DatasetUnavailableError ||
    error instanceof ImportPathError
  ) {
    message = error.message;
  } else {
    const raw = error instanceof Error ? error.message : String(error);
    message = raw.split('\n')[0] ?? raw;
  }
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function attempt(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await work();
  } catch (error) {
    return fail(error);
  }
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Builds the datadesk MCP server. Transport-agnostic: stdio in production, in-memory in tests. */
export function buildServer({ db, importPolicy }: ServerDeps): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "DataDesk exposes the user's registered local datasets as DuckDB views (one view per dataset, " +
        'named after the dataset). Start with list_datasets, then get_schema / sample_rows / ' +
        'profile_column to understand the data, then run_sql for answers. SQL is DuckDB dialect, ' +
        'read-only, single SELECT statement, results are row-capped.',
    },
  );
  const { maxRows, queryTimeoutMs } = db.limits;

  server.registerTool(
    'register_dataset',
    {
      title: 'Register dataset',
      description:
        `Register a local data file as a dataset (a DuckDB view named after it). Supported: ${SUPPORTED_EXTENSIONS.join(', ')}. ` +
        'The path must be absolute. Re-registering a name replaces it. Returns the schema and row count.',
      inputSchema: {
        path: z.string().min(1).max(4096).describe('Absolute path to the file.'),
        name: DatasetNameSchema.optional().describe(
          'Dataset/view name (lowercase, digits, underscores). Defaults to one derived from the file name.',
        ),
        sheet: z.string().max(100).optional().describe('Excel only: the sheet to read.'),
      },
      outputSchema: RegisteredDatasetSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ path, name, sheet }) =>
      attempt(async () => {
        const { entry, columns, rowCount } = await registerDataset(db, importPolicy, {
          path,
          name,
          sheet,
        });
        return ok(
          { name: entry.name, format: entry.format, path: entry.path, rowCount, columns },
          `Registered "${entry.name}" (${rowCount === null ? 'row count unknown' : `${String(rowCount)} rows`}, ${String(columns.length)} columns).`,
        );
      }),
  );

  server.registerTool(
    'list_datasets',
    {
      title: 'List datasets',
      description:
        'List every registered dataset with its format, size, row and column counts. Datasets whose ' +
        'file is missing or unreadable are listed with an `error`.',
      outputSchema: { datasets: z.array(DatasetSummarySchema) },
      annotations: READ_ONLY,
    },
    () =>
      attempt(async () => {
        const datasets = await listDatasets(db);
        return ok({ datasets }, `${String(datasets.length)} dataset(s) registered.`);
      }),
  );

  server.registerTool(
    'get_schema',
    {
      title: 'Get schema',
      description: 'Column names, DuckDB types and nullability for one dataset.',
      inputSchema: { dataset: DatasetNameSchema },
      outputSchema: { dataset: z.string(), columns: z.array(ColumnInfoSchema) },
      annotations: READ_ONLY,
    },
    ({ dataset }) =>
      attempt(async () => {
        const columns = await getSchema(db, dataset);
        return ok({ dataset, columns }, `"${dataset}" has ${String(columns.length)} columns.`);
      }),
  );

  server.registerTool(
    'sample_rows',
    {
      title: 'Sample rows',
      description:
        'Return example rows from a dataset: the first N ("head") or a repeatable random sample ("random").',
      inputSchema: {
        dataset: DatasetNameSchema,
        limit: z.number().int().min(1).max(100).default(10),
        mode: z.enum(['head', 'random']).default('head'),
      },
      outputSchema: { dataset: z.string(), ...QueryTableSchema.shape },
      annotations: READ_ONLY,
    },
    ({ dataset, limit, mode }) =>
      attempt(async () => {
        const table = await sampleRows(db, dataset, limit, mode);
        return ok({ dataset, ...table }, `${String(table.rowCount)} row(s) from "${dataset}".`);
      }),
  );

  server.registerTool(
    'profile_column',
    {
      title: 'Profile column',
      description:
        'Summary statistics for one column: null fraction, approximate distinct count, min/max, ' +
        'mean/stddev/quartiles for numeric columns, and the most frequent values.',
      inputSchema: {
        dataset: DatasetNameSchema,
        column: z.string().min(1).max(256),
        top_n: z.number().int().min(1).max(50).default(10),
      },
      outputSchema: ColumnProfileSchema.shape,
      annotations: READ_ONLY,
    },
    ({ dataset, column, top_n }) =>
      attempt(async () => {
        const profile = await profileColumn(db, dataset, column, top_n);
        return ok(
          { ...profile },
          `Profile of "${dataset}"."${column}" (${profile.type}, ${(profile.nullFraction * 100).toFixed(1)}% null).`,
        );
      }),
  );

  server.registerTool(
    'run_sql',
    {
      title: 'Run SQL',
      description:
        'Run ONE read-only DuckDB SELECT query over the registered datasets (each is a view named after ' +
        `the dataset). Writes, DDL, COPY, ATTACH, SET, PRAGMA and multiple statements are rejected. ` +
        `At most ${String(maxRows)} rows are returned (\`truncated\` tells you if there were more): aggregate ` +
        `or filter instead of fetching raw rows. Very long text cells are clipped (\`clippedCells\`) and ` +
        `very large results are cut off by size. Queries are cancelled after ${String(queryTimeoutMs / 1000)} s.`,
      inputSchema: {
        sql: z.string().min(1).max(MAX_SQL_LENGTH),
        max_rows: z.number().int().min(1).max(maxRows).optional(),
      },
      outputSchema: { ...QueryTableSchema.shape, elapsedMs: z.number() },
      annotations: READ_ONLY,
    },
    ({ sql, max_rows }, extra) =>
      attempt(async () => {
        const started = performance.now();
        const result = await db.query(sql, max_rows ?? maxRows, extra.signal);
        const elapsedMs = Math.round(performance.now() - started);
        const note = result.truncated ? ' (truncated; aggregate or add LIMIT)' : '';
        return ok(
          { ...result, elapsedMs },
          `${String(result.rowCount)} row(s) in ${String(elapsedMs)} ms${note}.`,
        );
      }),
  );

  return server;
}
