import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Catalog } from '../../src/mcp-server/catalog';
import { DatasetDb, type DbOptions } from '../../src/mcp-server/db/datasetDb';
import type { CatalogEntry, DatasetFormat } from '../../src/shared/datasets';

export const PUBLIC_DIR = resolve('test-data/public');
export const SECRET = 'TOP-SECRET-TOKEN';

/**
 * A throwaway workspace: copies of the public fixtures in `data/`, a "secret" file next to them
 * (to prove sibling files stay unreadable), and a fresh catalog + DatasetDb.
 */
export function createWorkspace(options: Partial<DbOptions> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'datadesk-mcp-'));
  const dataDir = join(root, 'data');
  mkdirSync(dataDir, { recursive: true });
  for (const f of ['sales.csv', 'sales.parquet', 'sales.json', 'events.ndjson']) {
    copyFileSync(join(PUBLIC_DIR, f), join(dataDir, f));
  }
  const secretPath = join(dataDir, 'secret.txt');
  writeFileSync(secretPath, SECRET);

  const catalog = new Catalog(join(root, 'catalog.json'));
  const dbOptions: DbOptions = {
    maxRows: 100,
    queryTimeoutMs: 5_000,
    memoryLimit: '512MB',
    threads: 2,
    tempDir: join(root, 'tmp'),
    ...options,
  };
  const db = new DatasetDb(catalog, dbOptions);

  const entry = (name: string, file: string, format: DatasetFormat): CatalogEntry => {
    const path = join(dataDir, file);
    return {
      name,
      path,
      format,
      sizeBytes: statSync(path).size,
      registeredAt: new Date().toISOString(),
    };
  };

  return {
    root,
    dataDir,
    secretPath,
    catalog,
    db,
    dbOptions,
    entry,
    cleanup: () => {
      db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Forward-slash path for embedding in SQL string literals. */
export const sqlPath = (p: string) => p.split('\\').join('/');
