import { JsonDuckDBValueConverter, type DuckDBResult } from '@duckdb/node-api';
import type { Cell } from '../../shared/datasets';

export interface ReadLimits {
  maxRows: number;
  /** Budget for the serialized rows; reading stops (truncated) once it would be exceeded. */
  maxBytes: number;
  /** Longer string cells are clipped with a marker. */
  maxCellChars: number;
}

export interface Table {
  columns: { name: string; type: string }[];
  rows: Cell[][];
  /** More rows existed than were returned (row cap or byte budget). */
  truncated: boolean;
  /** Number of string cells shortened to maxCellChars. */
  clippedCells: number;
}

const INTEGER_TYPES =
  /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT)$/;

/**
 * DuckDB's JSON conversion turns BIGINT/HUGEINT/DECIMAL into strings so no precision is lost.
 * The model reads numbers better than numeric strings, so convert values that fit a JS number
 * exactly (integers within ±2^53) or approximately (decimals), and leave the rest as strings.
 */
function toJsonSafe(value: Cell, type: string): Cell {
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

/**
 * Reads a streaming result chunk by chunk (up to 2048 rows each) and stops as soon as the row
 * cap or byte budget is reached, so a huge or very wide result is never fully materialized.
 */
export async function readStream(result: DuckDBResult, limits: ReadLimits): Promise<Table> {
  const names = result.deduplicatedColumnNames();
  const types = result.columnTypes().map((t) => t.toString());
  const columns = names.map((name, i) => ({ name, type: types[i] ?? 'UNKNOWN' }));
  const rows: Cell[][] = [];
  let bytes = 0;
  let clippedCells = 0;
  let truncated = false;

  read: for (;;) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    for (const raw of chunk.convertRows(JsonDuckDBValueConverter)) {
      if (rows.length >= limits.maxRows) {
        truncated = true;
        break read;
      }
      const row = raw.map((cell, i) => {
        const value = toJsonSafe(cell, types[i] ?? '');
        if (typeof value === 'string' && value.length > limits.maxCellChars) {
          clippedCells++;
          const more = value.length - limits.maxCellChars;
          return `${value.slice(0, limits.maxCellChars)}… [${String(more)} more characters]`;
        }
        return value;
      });
      const size = JSON.stringify(row).length;
      if (rows.length > 0 && bytes + size > limits.maxBytes) {
        truncated = true;
        break read;
      }
      bytes += size;
      rows.push(row);
    }
  }
  return { columns, rows, truncated, clippedCells };
}
