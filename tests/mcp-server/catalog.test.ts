import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Catalog, CatalogCorruptError } from '../../src/mcp-server/catalog';
import type { CatalogEntry } from '../../src/shared/datasets';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'catalog-'));
  file = join(dir, 'catalog.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const entry = (name: string): CatalogEntry => ({
  name,
  path: `C:/data/${name}.csv`,
  format: 'csv',
  sizeBytes: 10,
  registeredAt: '2026-10-01T00:00:00.000Z',
});

describe('Catalog', () => {
  it('is empty when no file exists', async () => {
    await expect(new Catalog(file).list()).resolves.toEqual([]);
  });

  it('upserts sorted by name and replaces same-name entries', async () => {
    const catalog = new Catalog(file);
    await catalog.upsert(entry('sales'));
    await catalog.upsert(entry('events'));
    await catalog.upsert({ ...entry('sales'), sizeBytes: 99 });
    const list = await catalog.list();
    expect(list.map((d) => d.name)).toEqual(['events', 'sales']);
    expect(list[1]?.sizeBytes).toBe(99);
  });

  it('sees writes from another instance (shared by several server processes)', async () => {
    await new Catalog(file).upsert(entry('sales'));
    await expect(new Catalog(file).get('sales')).resolves.toMatchObject({ name: 'sales' });
  });

  it('does not lose concurrent writes from different processes (lockfile)', async () => {
    // Separate Catalog instances stand in for separate datadesk-mcp processes.
    const writers = Array.from({ length: 8 }, () => new Catalog(file));
    await Promise.all(writers.map((c, i) => c.upsert(entry(`ds_${String(i)}`))));
    const names = (await new Catalog(file).list()).map((d) => d.name);
    expect(names).toEqual(Array.from({ length: 8 }, (_, i) => `ds_${String(i)}`));
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it('takes over a stale lock left by a crashed process', async () => {
    writeFileSync(`${file}.lock`, '99999');
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${file}.lock`, old, old);
    await new Catalog(file).upsert(entry('sales'));
    await expect(new Catalog(file).get('sales')).resolves.toBeDefined();
  });

  it('removes entries', async () => {
    const catalog = new Catalog(file);
    await catalog.upsert(entry('sales'));
    await expect(catalog.remove('sales')).resolves.toBe(true);
    await expect(catalog.remove('sales')).resolves.toBe(false);
  });

  it('rejects invalid entries (e.g. unsafe dataset names)', async () => {
    await expect(new Catalog(file).upsert(entry('Robert; DROP TABLE'))).rejects.toThrow();
  });

  it('reports a corrupt file instead of silently dropping datasets', async () => {
    writeFileSync(file, '{ broken');
    await expect(new Catalog(file).list()).rejects.toBeInstanceOf(CatalogCorruptError);
  });
});
