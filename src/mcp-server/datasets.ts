import { suggestDatasetName, type CatalogEntry, type DatasetSummary } from '../shared/datasets';
import type { DatasetDb, QueryResult } from './db/datasetDb';
import { quoteIdent } from './db/sql';
import { validateImportPath, type ImportPolicy } from './fileAccess';

/**
 * Tool logic, independent of the MCP SDK so it can be unit-tested directly.
 * Every function takes a validated dataset name and only builds SQL from quoted identifiers.
 */

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
}

export async function registerDataset(
  db: DatasetDb,
  policy: ImportPolicy,
  input: { path: string; name?: string | undefined; sheet?: string | undefined },
): Promise<{ entry: CatalogEntry; columns: ColumnSchema[]; rowCount: number }> {
  const file = await validateImportPath(input.path, policy);
  const fileName = file.path.split(/[\\/]/).pop() ?? 'dataset';
  const entry: CatalogEntry = {
    name: input.name ?? suggestDatasetName(fileName),
    path: file.path,
    format: file.format,
    sizeBytes: file.sizeBytes,
    registeredAt: new Date().toISOString(),
    ...(input.sheet && file.format === 'xlsx' ? { sheet: input.sheet } : {}),
  };
  await db.register(entry);
  const [columns, rowCount] = await Promise.all([
    getSchema(db, entry.name),
    countRows(db, entry.name),
  ]);
  return { entry, columns, rowCount };
}

export async function listDatasets(db: DatasetDb): Promise<DatasetSummary[]> {
  const datasets = await db.datasets();
  const summaries: DatasetSummary[] = [];
  for (const { entry, error } of datasets) {
    const base = {
      name: entry.name,
      format: entry.format,
      path: entry.path,
      sizeBytes: entry.sizeBytes,
      registeredAt: entry.registeredAt,
    };
    if (error !== undefined) {
      summaries.push({ ...base, rowCount: null, columnCount: null, error });
      continue;
    }
    const [columns, rowCount] = await Promise.all([
      getSchema(db, entry.name),
      countRows(db, entry.name),
    ]);
    summaries.push({ ...base, rowCount, columnCount: columns.length });
  }
  return summaries;
}

export async function getSchema(db: DatasetDb, name: string): Promise<ColumnSchema[]> {
  await db.assertAvailable(name);
  const result = await db.internalQuery(`DESCRIBE ${quoteIdent(name)}`, 10_000);
  const col = (field: string) => result.columns.findIndex((c) => c.name === field);
  const [iName, iType, iNull] = [col('column_name'), col('column_type'), col('null')];
  return result.rows.map((row) => ({
    name: asText(row[iName]),
    type: asText(row[iType]),
    nullable: row[iNull] !== 'NO',
  }));
}

async function countRows(db: DatasetDb, name: string): Promise<number> {
  const result = await db.internalQuery(`SELECT count(*) FROM ${quoteIdent(name)}`, 1);
  return Number(result.rows[0]?.[0] ?? 0);
}

export async function sampleRows(
  db: DatasetDb,
  name: string,
  limit: number,
  mode: 'head' | 'random',
): Promise<QueryResult> {
  await db.assertAvailable(name);
  const n = Math.max(1, Math.min(limit, db.limits.maxRows));
  const sql =
    mode === 'random'
      ? `SELECT * FROM ${quoteIdent(name)} USING SAMPLE reservoir(${String(n)} ROWS) REPEATABLE (42)`
      : `SELECT * FROM ${quoteIdent(name)} LIMIT ${String(n)}`;
  return db.internalQuery(sql, n);
}

export interface ColumnProfile {
  dataset: string;
  column: string;
  type: string;
  rowCount: number;
  nullCount: number;
  nullFraction: number;
  distinctCount: number;
  min: unknown;
  max: unknown;
  mean: number | null;
  stddev: number | null;
  quantiles: { p25: unknown; p50: unknown; p75: unknown } | null;
  topValues: { value: unknown; count: number }[];
}

const NUMERIC =
  /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL)/;

export async function profileColumn(
  db: DatasetDb,
  name: string,
  column: string,
  topN = 10,
): Promise<ColumnProfile> {
  const schema = await getSchema(db, name);
  const info = schema.find((c) => c.name === column);
  if (!info) {
    throw new Error(
      `Column "${column}" not found in "${name}". Columns: ${schema.map((c) => c.name).join(', ')}`,
    );
  }
  const t = quoteIdent(name);
  const c = quoteIdent(column);
  const numeric = NUMERIC.test(info.type);
  const orderable = numeric || /^(DATE|TIME|TIMESTAMP|VARCHAR)/.test(info.type);

  const stats = await db.internalQuery(
    `SELECT count(*) AS n, count(*) - count(${c}) AS nulls, approx_count_distinct(${c}) AS distinct_n,
       ${orderable ? `min(${c})` : 'NULL'} AS min_v, ${orderable ? `max(${c})` : 'NULL'} AS max_v,
       ${numeric ? `avg(${c})::DOUBLE` : 'NULL'} AS mean_v,
       ${numeric ? `stddev_samp(${c})::DOUBLE` : 'NULL'} AS sd_v,
       ${numeric ? `quantile_cont(${c}, [0.25, 0.5, 0.75])` : 'NULL'} AS q
     FROM ${t}`,
    1,
  );
  const [n, nulls, distinct, minV, maxV, mean, sd, q] = stats.rows[0] ?? [];
  const top = await db.internalQuery(
    `SELECT ${c} AS value, count(*) AS count FROM ${t} WHERE ${c} IS NOT NULL
     GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${String(Math.max(1, Math.min(topN, 50)))}`,
    50,
  );

  const rowCount = Number(n ?? 0);
  const nullCount = Number(nulls ?? 0);
  const quantiles = Array.isArray(q) ? { p25: q[0], p50: q[1], p75: q[2] } : null;
  return {
    dataset: name,
    column,
    type: info.type,
    rowCount,
    nullCount,
    nullFraction: rowCount === 0 ? 0 : nullCount / rowCount,
    distinctCount: Number(distinct ?? 0),
    min: minV ?? null,
    max: maxV ?? null,
    mean: typeof mean === 'number' ? mean : null,
    stddev: typeof sd === 'number' ? sd : null,
    quantiles,
    topValues: top.rows.map(([value, count]) => ({ value, count: Number(count) })),
  };
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
