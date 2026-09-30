import { sep } from 'node:path';
import { DatasetNameSchema, type CatalogEntry } from '../../shared/datasets';

/** Quotes a SQL identifier. Dataset names are also schema-validated, so this is belt and braces. */
export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Quotes a SQL string literal. */
export function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** DuckDB accepts forward slashes on every OS; they also avoid backslash-escaping surprises. */
export function toDuckDbPath(filePath: string): string {
  return filePath.split(sep).join('/');
}

/** The table-function call that reads a catalog entry's source file. */
export function readerSql(entry: CatalogEntry): string {
  const path = quoteLiteral(toDuckDbPath(entry.path));
  switch (entry.format) {
    case 'csv':
      return `read_csv(${path}, auto_detect = true, sample_size = 20480)`;
    case 'parquet':
      return `read_parquet(${path})`;
    case 'json':
      return `read_json(${path}, auto_detect = true)`;
    case 'xlsx':
      return entry.sheet
        ? `read_xlsx(${path}, sheet = ${quoteLiteral(entry.sheet)})`
        : `read_xlsx(${path})`;
  }
}

export function createViewSql(entry: CatalogEntry): string {
  const name = DatasetNameSchema.parse(entry.name);
  return `CREATE OR REPLACE VIEW ${quoteIdent(name)} AS SELECT * FROM ${readerSql(entry)}`;
}
