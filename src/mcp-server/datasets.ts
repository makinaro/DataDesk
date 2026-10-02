import { realpath, rm, rmdir } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  suggestDatasetName,
  type Cell,
  type CatalogEntry,
  type ColumnInfo,
  type ColumnProfile,
  type DatasetSummary,
} from '../shared/datasets';
import { DatasetUnavailableError, type DatasetDb, type QueryResult } from './db/datasetDb';
import { quoteIdent } from './db/sql';
import { isRealFileInside, validateImportPath, type ImportPolicy } from './fileAccess';

/**
 * Tool logic, independent of the MCP SDK so it can be unit-tested directly.
 * Every function takes a validated dataset name and only builds SQL from quoted identifiers.
 */

export async function registerDataset(
  db: DatasetDb,
  policy: ImportPolicy,
  input: { path: string; name?: string | undefined; sheet?: string | undefined },
): Promise<{ entry: CatalogEntry; columns: ColumnInfo[]; rowCount: number | null }> {
  const file = await validateImportPath(input.path, policy);
  const fileName = file.path.split(/[\\/]/).pop() ?? 'dataset';
  const stored = await db.register({
    name: input.name ?? suggestDatasetName(fileName),
    path: file.path,
    format: file.format,
    sizeBytes: file.sizeBytes,
    registeredAt: new Date().toISOString(),
    ...(input.sheet && file.format === 'xlsx' ? { sheet: input.sheet } : {}),
  });
  // Registered and persisted at this point; a slow DESCRIBE shouldn't turn that into an error.
  const columns = await getSchema(db, stored.name).catch(() => []);
  return { entry: stored, columns, rowCount: stored.rowCount ?? null };
}

/**
 * One summary per dataset. Row counts come from the catalog (counted at registration), so
 * listing never scans files, and one broken dataset never fails the whole listing.
 */
export async function listDatasets(db: DatasetDb): Promise<DatasetSummary[]> {
  const summaries: DatasetSummary[] = [];
  for (const { entry, error } of await db.datasets()) {
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
    try {
      const columns = await getSchema(db, entry.name);
      summaries.push({ ...base, rowCount: entry.rowCount ?? null, columnCount: columns.length });
    } catch (e) {
      // E.g. the file was deleted after the session was built.
      const message = e instanceof Error ? (e.message.split('\n')[0] ?? e.message) : String(e);
      summaries.push({ ...base, rowCount: null, columnCount: null, error: message });
    }
  }
  return summaries;
}

/**
 * Removes a dataset from the catalog. Its file is deleted only when DataDesk owns it (a
 * download inside `ownedDir`, the HF folder) and no other dataset still points at it. The
 * user's own files are never touched; they are only forgotten.
 */
export async function removeDataset(
  db: DatasetDb,
  name: string,
  ownedDir: string,
): Promise<{ removed: true; deletedFile: boolean }> {
  // Not assertAvailable(): a broken dataset (say, its file was deleted) must still be removable.
  const all = (await db.datasets()).map((d) => d.entry);
  const entry = all.find((e) => e.name === name);
  if (!entry || !(await db.unregister(name))) {
    throw new DatasetUnavailableError(name, 'not registered. Call list_datasets.');
  }
  const fold = (p: string) => (process.platform === 'linux' ? p : p.toLowerCase());
  const shared = all.some((e) => e.name !== name && fold(e.path) === fold(entry.path));
  if (shared || !(await isRealFileInside(entry.path, ownedDir))) {
    return { removed: true, deletedFile: false };
  }
  await rm(entry.path, { force: true });
  // Download folders (owner/repo/revision) that are now empty go too; stop at the first that
  // isn't, and never remove ownedDir itself. The catalog holds real paths (8.3 short names and
  // junctions expanded), so compare against ownedDir's real path too.
  const root = await realpath(ownedDir).catch(() => resolve(ownedDir));
  for (let dir = dirname(entry.path); fold(dir) !== fold(root); dir = dirname(dir)) {
    if (!fold(dir).startsWith(fold(root + sep))) break;
    try {
      await rmdir(dir);
    } catch {
      break;
    }
  }
  return { removed: true, deletedFile: true };
}

export async function getSchema(db: DatasetDb, name: string): Promise<ColumnInfo[]> {
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
  const quantiles: ColumnProfile['quantiles'] = Array.isArray(q)
    ? { p25: q[0] ?? null, p50: q[1] ?? null, p75: q[2] ?? null }
    : null;
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
    topValues: top.rows.map(([value, count]) => ({ value: value ?? null, count: Number(count) })),
  };
}

function asText(value: Cell | undefined): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
