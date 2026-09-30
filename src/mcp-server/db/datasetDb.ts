import { mkdirSync } from 'node:fs';
import {
  DuckDBInstance,
  type DuckDBConnection,
  type DuckDBPreparedStatement,
} from '@duckdb/node-api';
import type { CatalogEntry } from '../../shared/datasets';
import type { Catalog } from '../catalog';
import { readStream, type Table } from './convert';
import { prepareReadOnly } from './readOnlyGuard';
import { createViewSql, quoteIdent, quoteLiteral, toDuckDbPath } from './sql';

export interface DbOptions {
  maxRows: number;
  queryTimeoutMs: number;
  memoryLimit: string;
  threads: number;
  /** Where DuckDB may spill to disk. */
  tempDir: string;
  /** Pre-fetched DuckDB extensions (Excel). Nothing is ever downloaded at query time. */
  extensionDir?: string | undefined;
  /** Budget for one result's serialized rows (default 2 MB). */
  maxResultBytes?: number;
  /** String cells longer than this are clipped (default 10 000 characters). */
  maxCellChars?: number;
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
}

interface Session {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
  /** The catalog contents this session was built from; any difference triggers a rebuild. */
  signature: string;
  entries: CatalogEntry[];
  /** Datasets whose view couldn't be created (missing file, parse error, no Excel support). */
  failures: Map<string, string>;
}

const sortByName = (entries: CatalogEntry[]) =>
  [...entries].sort((a, b) => a.name.localeCompare(b.name));
const signatureOf = (entries: CatalogEntry[]) => JSON.stringify(entries);

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

  /**
   * Validates a new entry by building a session that includes it, counts its rows (under the
   * query timeout) so listings never have to scan files, and only then persists it.
   * Returns the stored entry (with `rowCount` when counting finished in time).
   */
  register(entry: CatalogEntry): Promise<CatalogEntry> {
    return this.exclusive(async () => {
      const others = (await this.catalog.list()).filter((e) => e.name !== entry.name);
      const next = await this.build(sortByName([...others, entry]));
      try {
        const failure = next.failures.get(entry.name);
        if (failure !== undefined) throw new DatasetUnavailableError(entry.name, failure);

        let stored: CatalogEntry = { ...entry };
        delete stored.rowCount;
        try {
          const count = await this.execute(
            next.connection,
            () => next.connection.prepare(`SELECT count(*) FROM ${quoteIdent(entry.name)}`),
            1,
          );
          const n = count.rows[0]?.[0];
          if (typeof n === 'number') stored = { ...stored, rowCount: n };
        } catch {
          // Too slow or unreadable to count now: registered without a row count.
        }

        await this.catalog.upsert(stored);
        // Stamp the session with what the catalog holds *if nobody else wrote meanwhile*.
        // If another process did, the signatures differ and the next call rebuilds.
        next.entries = sortByName([...others, stored]);
        next.signature = signatureOf(next.entries);
        this.replace(next);
        return stored;
      } catch (error) {
        if (this.session !== next) closeSession(next);
        throw error;
      }
    });
  }

  unregister(name: string): Promise<boolean> {
    return this.exclusive(async () => {
      const removed = await this.catalog.remove(name);
      if (removed) await this.fresh();
      return removed;
    });
  }

  /**
   * Current catalog entries plus, for each, the error if its view couldn't be created.
   * Failed datasets are retried on every listing, so a reconnected drive recovers.
   */
  datasets(): Promise<{ entry: CatalogEntry; error: string | undefined }[]> {
    return this.exclusive(async () => {
      const session = await this.fresh({ retryFailures: true });
      return session.entries.map((entry) => ({ entry, error: session.failures.get(entry.name) }));
    });
  }

  /** Runs model-supplied SQL: read-only guard, row/byte caps, timeout, optional cancellation. */
  query(sql: string, maxRows = this.options.maxRows, signal?: AbortSignal): Promise<QueryResult> {
    const cap = Math.min(maxRows, this.options.maxRows);
    return this.exclusive(async () => {
      signal?.throwIfAborted();
      const { connection } = await this.fresh();
      return this.execute(connection, () => prepareReadOnly(connection, sql), cap, signal);
    });
  }

  /**
   * Runs SQL that *our code* built from validated identifiers (schema/profile helpers).
   * Still capped, time-limited and executed on the locked-down instance.
   */
  internalQuery(sql: string, maxRows = this.options.maxRows): Promise<QueryResult> {
    return this.exclusive(async () => {
      const { connection } = await this.fresh();
      return this.execute(connection, () => connection.prepare(sql), maxRows);
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

  /**
   * Prepares (binds) and streams one statement. The timeout and cancellation cover binding too:
   * binding can be expensive (e.g. read_csv sniffing a large file).
   */
  private async execute(
    connection: DuckDBConnection,
    prepare: () => Promise<DuckDBPreparedStatement>,
    maxRows: number,
    signal?: AbortSignal,
  ): Promise<QueryResult> {
    // An object, not a `let`: TS flow analysis can't see the callbacks mutating a local.
    const state = { timedOut: false, cancelled: false };
    const timer = setTimeout(() => {
      state.timedOut = true;
      connection.interrupt();
    }, this.options.queryTimeoutMs);
    // The MCP client cancelled the tool call (e.g. the user pressed Stop): stop DuckDB too.
    const onAbort = () => {
      state.cancelled = true;
      connection.interrupt();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    // Read through a function: TS narrows `state.timedOut` after the first check and can't see
    // the timer flipping it across an await.
    const timedOut = () => state.timedOut;
    try {
      const prepared = await prepare();
      if (timedOut()) throw new QueryTimeoutError(this.options.queryTimeoutMs);
      const table = await readStream(await prepared.stream(), {
        maxRows,
        maxBytes: this.options.maxResultBytes ?? 2_000_000,
        maxCellChars: this.options.maxCellChars ?? 10_000,
      });
      if (timedOut()) throw new QueryTimeoutError(this.options.queryTimeoutMs);
      return { ...table, rowCount: table.rows.length };
    } catch (error) {
      if (timedOut()) throw new QueryTimeoutError(this.options.queryTimeoutMs);
      if (state.cancelled) throw new Error('Query cancelled.', { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Rebuilds the session if the catalog changed (possibly in another process). */
  private async fresh(options: { retryFailures?: boolean } = {}): Promise<Session> {
    const entries = await this.catalog.list();
    const current = this.session;
    const upToDate = current?.signature === signatureOf(entries);
    if (current && upToDate && !(options.retryFailures && current.failures.size > 0)) {
      return current;
    }
    const next = await this.build(entries);
    this.replace(next);
    return next;
  }

  private replace(next: Session): void {
    const previous = this.session;
    this.session = next;
    if (previous && previous !== next) closeSession(previous);
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
    return { instance, connection, signature: signatureOf(entries), entries, failures };
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
