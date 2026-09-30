import {
  StatementType,
  type DuckDBConnection,
  type DuckDBPreparedStatement,
} from '@duckdb/node-api';

export const MAX_SQL_LENGTH = 20_000;

export class ReadOnlyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadOnlyViolation';
  }
}

/**
 * Enforces "read-only" using DuckDB's own parser, not regex:
 * 1. `extractStatements` splits the input exactly as DuckDB would run it, so comments,
 *    string literals and `;` inside quotes can't hide a second statement.
 * 2. `prepare` binds the statement, and `statementType` reports what DuckDB will execute.
 *    Only SELECT is allowed (which includes WITH…SELECT, FROM-first, PIVOT, SUMMARIZE).
 *
 * This is one of three layers. The instance is also locked down (external access disabled,
 * only registered files readable, configuration locked; see datasetDb.ts), and results are
 * row-capped and time-limited.
 */
export async function prepareReadOnly(
  connection: DuckDBConnection,
  sql: string,
): Promise<DuckDBPreparedStatement> {
  if (sql.length > MAX_SQL_LENGTH) {
    throw new ReadOnlyViolation(`SQL is too long (max ${String(MAX_SQL_LENGTH)} characters).`);
  }
  const extracted = await connection.extractStatements(sql);
  if (extracted.count !== 1) {
    throw new ReadOnlyViolation(
      `Exactly one SQL statement is allowed (got ${String(extracted.count)}).`,
    );
  }
  const prepared = await extracted.prepare(0);
  if (prepared.statementType !== StatementType.SELECT) {
    const kind = StatementType[prepared.statementType];
    throw new ReadOnlyViolation(`Only SELECT queries are allowed (got ${kind}).`);
  }
  if (prepared.parameterCount > 0) {
    throw new ReadOnlyViolation('Parameter placeholders ($1, ?) are not supported.');
  }
  return prepared;
}
