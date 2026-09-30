import type { DuckDBResultReader } from '@duckdb/node-api';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface Table {
  columns: { name: string; type: string }[];
  rows: JsonValue[][];
}

const INTEGER_TYPES =
  /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT)$/;

/**
 * DuckDB's JSON conversion turns BIGINT/HUGEINT/DECIMAL into strings so no precision is lost.
 * The model reads numbers better than numeric strings, so convert values that fit a JS number
 * exactly (integers within ±2^53) or approximately (decimals), and leave the rest as strings.
 */
function toJsonSafe(value: JsonValue, type: string): JsonValue {
  if (typeof value !== 'string') return value;
  if (INTEGER_TYPES.test(type)) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value;
  }
  if (type.startsWith('DECIMAL')) {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

export function readTable(reader: DuckDBResultReader, maxRows = Infinity): Table {
  const names = reader.deduplicatedColumnNames();
  const types = reader.columnTypes().map((t) => t.toString());
  const columns = names.map((name, i) => ({ name, type: types[i] ?? 'UNKNOWN' }));
  const rows = (reader.getRowsJson() as JsonValue[][])
    .slice(0, maxRows)
    .map((row) => row.map((cell, i) => toJsonSafe(cell, types[i] ?? '')));
  return { columns, rows };
}
