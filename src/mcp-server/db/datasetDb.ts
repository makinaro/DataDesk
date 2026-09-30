import { mkdirSync } from 'node:fs';
import {
  DuckDBInstance,
  type DuckDBConnection,
  type DuckDBPreparedStatement,
} from '@duckdb/node-api';
import type { CatalogEntry } from '../../shared/datasets';
import type { Catalog } from '../catalog';
import { readTable, type Table } from './convert';
import { prepareReadOnly } from './readOnlyGuard';
import { createViewSql, quoteLiteral, toDuckDbPath } from './sql';

export interface DbOptions {
  maxRows: number;
  queryTimeoutMs: number;
  memoryLimit: string;
  threads: number;
  /** Where DuckDB may spill to disk. */
  tempDir: string;
  /** Pre-fetched DuckDB extensions (Excel). Nothing is ever downloaded at query time. */
  extensionDir?: string | undefined;
}

export class QueryTimeoutError extends Error {
  constructor(ms: number) {
    super(`Query cancelled after ${String(ms)} ms. Narrow it down (filter, aggregate, LIMIT).`);
    this.name = 'QueryTimeoutError';
  }
}

export class DatasetUnavailableError extends Error {
  constructor(name: string, reason: string) {
    super(`Dataset "${name}" is unavailable: ${reason}`);
    this.name = 'DatasetUnavailableError';
  }
}

export interface QueryResult extends Table {
  rowCount: number;
  truncated: boolean;
}

interface Session {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
  signature: string;
  entries: CatalogEntry[];
  /** Datasets whose view couldn't be created (missing file, parse error, no Excel support). */
  failures: Map<string, string>;
}

function closeSession(session: Session): void {
  try {
    session.connection.closeSync();
    session.instance.closeSync();
  } catch {
    // Already closed.
  }
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}

/**
 * Owns the in-memory DuckDB instance that backs every tool call.
 *
 * Lockdown (verified against DuckDB 1.5.6, see DECISIONS D-009): once
 * `enable_external_access = false`, only files listed in `allowed_paths` can be read, and the
 * list can't be changed. So each catalog change builds a *fresh* locked instance: views for
 * every registered file, `allowed_paths` = exactly those files, then external access off and
 * configuration locked. Views don't copy data, so rebuilding is cheap.
 */
export class DatasetDb {
  private session: Session | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly catalog: Catalog,
    private readonly options: DbOptions,
  ) {}

  get limits(): Pick<DbOptions, 'maxRows' | 'queryTimeoutMs'> {
    return { maxRows: this.options.maxRows, queryTimeoutMs: this.options.queryTimeoutMs };
  }

  /** Validates a new entry by building a session that includes it, and only then persists it. */
  register(entry: CatalogEntry): Promise<void> {
    return this.exclusive(async () => {
      const others = (await this.catalog.list()).filter((e) => e.name !== entry.name);
      const next = await this.build([...others, entry]);
      const failure = next.failures.get(entry.name);
      if (failure !== undefined) {
        closeSession(next);
        throw new DatasetUnavailableError(entry.name, failure);
      }
      await this.catalog.upsert(entry);
      next.signature = JSON.stringify(await this.catalog.list());
      this.replace(next);
    });
  }

  unregister(name: string): Promise<boolean> {
    return this.exclusive(async () => {
      const removed = await this.catalog.remove(name);
      if (removed) await this.fresh();
      return removed;
    });
  }

  /** Current catalog entries plus, for each, the error if its view couldn't be created. */
  datasets(): Promise<{ entry: CatalogEntry; error: string | undefined }[]> {
    return this.exclusive(async () => {
      const session = await this.fresh();
      return session.entries.map((entry) => ({ entry, error: session.failures.get(entry.name) }));
    });
  }

  /** Runs model-supplied SQL: read-only guard, row cap, timeout. */
  query(sql: string, maxRows = this.options.maxRows): Promise<QueryResult> {
    const cap = Math.min(maxRows, this.options.maxRows);
    return this.exclusive(async () => {
      const { connection } = await this.fresh();
      const prepared = await prepareReadOnly(connection, sql);
      return this.execute(connection, prepared, cap);
    });
  }

  /**
   * Runs SQL that *our code* built from validated identifiers (schema/profile helpers).
   * Still row-capped, time-limited and executed on the locked-down instance.
   */
  internalQuery(sql: string, maxRows = this.options.maxRows): Promise<QueryResult> {
    return this.exclusive(async () => {
      const { connection } = await this.fresh();
      const prepared = await connection.prepare(sql);
      return this.execute(connection, prepared, maxRows);
    });
  }

  /** Throws DatasetUnavailableError if the dataset isn't registered or its view failed. */
  async assertAvailable(name: string): Promise<CatalogEntry> {
    const all = await this.datasets();
    const found = all.find((d) => d.entry.name === name);
    if (!found) throw new DatasetUnavailableError(name, 'not registered. Call list_datasets.');
    if (found.error !== undefined) throw new DatasetUnavailableError(name, found.error);
    return found.entry;
  }

  close(): void {
    if (this.session) closeSession(this.session);
    this.session = undefined;
  }

  private async execute(
    connection: DuckDBConnection,
    prepared: DuckDBPreparedStatement,
    maxRows: number,
  ): Promise<QueryResult> {
    // An object, not a `let`: TS flow analysis can't see the timer callback mutating a local.
    const state = { timedOut: false };
    const timer = setTimeout(() => {
      state.timedOut = true;
      connection.interrupt();
    }, this.options.queryTimeoutMs);
    try {
      // Stream, and stop after cap+1 rows, so a huge result is never materialized.
      const reader = await prepared.streamAndReadUntil(maxRows + 1);
      const table = readTable(reader, maxRows);
      const truncated = reader.currentRowCount > maxRows || !reader.done;
      return { ...table, rowCount: table.rows.length, truncated };
    } catch (error) {
      if (state.timedOut) throw new QueryTimeoutError(this.options.queryTimeoutMs);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Rebuilds the session if another process (or we) changed the catalog. */
  private async fresh(): Promise<Session> {
    const entries = await this.catalog.list();
    const signature = JSON.stringify(entries);
    if (this.session?.signature === signature) return this.session;
    const next = await this.build(entries);
    this.replace(next);
    return next;
  }

  private replace(next: Session): void {
    const previous = this.session;
    this.session = next;
    if (previous) closeSession(previous);
  }

  private async build(entries: CatalogEntry[]): Promise<Session> {
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    const failures = new Map<string, string>();
    try {
      mkdirSync(this.options.tempDir, { recursive: true });
      await connection.run(`SET autoinstall_known_extensions = false`);
      await connection.run(`SET autoload_known_extensions = false`);
      await connection.run(`SET memory_limit = ${quoteLiteral(this.options.memoryLimit)}`);
      await connection.run(`SET threads = ${String(this.options.threads)}`);
      await connection.run(
        `SET temp_directory = ${quoteLiteral(toDuckDbPath(this.options.tempDir))}`,
      );

      let excelError: string | undefined;
      if (entries.some((e) => e.format === 'xlsx')) {
        excelError = await this.loadExcel(connection);
      }

      const readable: string[] = [];
      for (const entry of entries) {
        if (entry.format === 'xlsx' && excelError !== undefined) {
          failures.set(entry.name, excelError);
          continue;
        }
        try {
          await connection.run(createViewSql(entry));
          readable.push(toDuckDbPath(entry.path));
        } catch (error) {
          failures.set(entry.name, firstLine(error));
        }
      }

      const allowed = readable.map(quoteLiteral).join(', ');
      await connection.run(`SET allowed_paths = [${allowed}]`);
      await connection.run(`SET enable_external_access = false`);
      await connection.run(`SET lock_configuration = true`);
    } catch (error) {
      connection.closeSync();
      instance.closeSync();
      throw error;
    }
    return { instance, connection, signature: JSON.stringify(entries), entries, failures };
  }

  private async loadExcel(connection: DuckDBConnection): Promise<string | undefined> {
    const dir = this.options.extensionDir;
    if (!dir) return 'Excel support is not installed (run `npm run duckdb:extensions`).';
    try {
      await connection.run(`SET extension_directory = ${quoteLiteral(toDuckDbPath(dir))}`);
      await connection.run(`LOAD excel`);
      return undefined;
    } catch (error) {
      return `Excel support could not be loaded: ${firstLine(error)}`;
    }
  }

  /** Serializes all database work: one connection, one query at a time. */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
