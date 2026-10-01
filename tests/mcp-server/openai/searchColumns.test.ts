import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '../../../src/mcp-server/openai/client';
import {
  contentHash,
  decodeVector,
  EmbeddingCache,
  encodeVector,
} from '../../../src/mcp-server/openai/embeddingCache';
import {
  cosine,
  describeColumn,
  rank,
  searchColumns,
} from '../../../src/mcp-server/openai/searchColumns';
import { createWorkspace } from '../fixtures';
import { createFakeOpenAI } from './fakeOpenAI';

describe('cosine and rank', () => {
  it('scores identical directions 1, orthogonal 0, and handles zero vectors', () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it('ranks by similarity, keeps input order on ties, and applies the limit', () => {
    const items = [
      { id: 'a', vector: [0, 1] },
      { id: 'b', vector: [1, 0] },
      { id: 'c', vector: [1, 0] },
      { id: 'd', vector: [1, 1] },
    ];
    expect(rank([1, 0], items, 3).map((r) => r.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('describeColumn (what is sent to OpenAI)', () => {
  it('includes at most 3 distinct, clipped, whitespace-collapsed sample values', () => {
    const long = 'x'.repeat(100);
    expect(
      describeColumn('sales', 'region', 'VARCHAR', ['South', null, 'South', 'East\n\t', long, 'W']),
    ).toBe(`sales.region (VARCHAR): e.g. South, East, ${'x'.repeat(39)}…`);
    expect(describeColumn('t', 'c', 'INTEGER', [null, null])).toBe('t.c (INTEGER)');
  });
});

describe('EmbeddingCache', () => {
  let ws: ReturnType<typeof createWorkspace>;
  beforeEach(() => {
    ws = createWorkspace();
  });
  afterEach(() => {
    ws.cleanup();
  });
  const k = (i: number) => contentHash(String(i), 'm', 2);
  const persist = { persist: true };

  it('keys on model, dimensions and exact text', () => {
    const a = contentHash('sales.region', 'm1', 512);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash('sales.region', 'm1', 512)).toBe(a);
    expect(contentHash('sales.region', 'm2', 512)).not.toBe(a);
    expect(contentHash('sales.region', 'm1', 256)).not.toBe(a);
    expect(contentHash('sales.Region', 'm1', 512)).not.toBe(a);
  });

  it('stores vectors compactly as base64 Float32', () => {
    const v = [0.25, -1.5, 3];
    expect(decodeVector(encodeVector(v))).toEqual(v);
    expect(encodeVector(new Array<number>(512).fill(0.1)).length).toBeLessThan(2_800);
  });

  it('persists column vectors, keeps queries in memory, and evicts least recently used', async () => {
    const file = join(ws.root, 'cache', 'embeddings.json');
    const first = new EmbeddingCache(file, 2);
    await first.load();
    first.set(k(1), [1, 0], persist);
    first.set(k(2), [0, 1], persist);
    first.get(k(1)); // refresh 1, so 2 is now the stalest
    first.set(k(3), [1, 1], persist);
    first.set(k(9), [9, 9], { persist: false });
    await first.save();

    const second = new EmbeddingCache(file, 2);
    await second.load();
    expect(second.size).toBe(2);
    expect(second.get(k(2))).toBeUndefined();
    expect(second.get(k(1))).toEqual([1, 0]);
    expect(second.get(k(3))).toEqual([1, 1]);
    expect(second.get(k(9))).toBeUndefined(); // the query was never written

    writeFileSync(file, '{not json');
    const third = new EmbeddingCache(file, 2);
    await third.load();
    expect(third.size).toBe(0);
  });

  it('loads once when calls race, keeping entries set in the meantime', async () => {
    const file = join(ws.root, 'cache', 'embeddings.json');
    const seed = new EmbeddingCache(file);
    seed.set(k(1), [1, 0], persist);
    await seed.save();

    const cache = new EmbeddingCache(file);
    const a = cache.load();
    cache.set(k(2), [0, 1], persist); // set before the file finished loading
    const b = cache.load();
    await Promise.all([a, b]);
    expect(cache.get(k(1))).toEqual([1, 0]);
    expect(cache.get(k(2))).toEqual([0, 1]);
  });

  it('warns instead of failing when the file cannot be written', async () => {
    const blocker = join(ws.root, 'not-a-dir');
    writeFileSync(blocker, 'x'); // a file where the cache folder should be
    const warnings: string[] = [];
    const cache = new EmbeddingCache(join(blocker, 'embeddings.json'), 10, (m) => warnings.push(m));
    cache.set(k(1), [1], persist);
    await expect(cache.save()).resolves.toBeUndefined();
    expect(warnings).toEqual([expect.stringContaining('could not save the embedding cache')]);
  });
});

describe('searchColumns', () => {
  let ws: ReturnType<typeof createWorkspace>;
  beforeEach(async () => {
    ws = createWorkspace();
    await ws.db.register(ws.entry('sales', 'sales.csv', 'csv'));
    await ws.db.register(ws.entry('events', 'events.ndjson', 'json'));
  });
  afterEach(() => {
    ws.cleanup();
  });

  it('ranks the most relevant columns first across datasets', async () => {
    const openai = createFakeOpenAI();
    const cache = new EmbeddingCache(join(ws.root, 'cache', 'embeddings.json'));
    const result = await searchColumns(
      { db: ws.db, openai, cache },
      { query: 'which region', limit: 3 },
    );
    expect(result.matches[0]).toMatchObject({ dataset: 'sales', column: 'region' });
    expect(result.columnsSearched).toBe(10); // 7 sales + 3 events columns
    expect(result.matches).toHaveLength(3);
    // Only column descriptions (name, type, a few samples) and the query were sent.
    const sent = openai.embedded.flat();
    expect(sent).toContain('which region');
    expect(sent.some((t) => t.startsWith('sales.region (VARCHAR): e.g. '))).toBe(true);
    expect(sent).toHaveLength(11);
  });

  it('caches by content hash: columns are embedded once, even across processes', async () => {
    const file = join(ws.root, 'cache', 'embeddings.json');
    const openai = createFakeOpenAI();
    const cache = new EmbeddingCache(file);
    await searchColumns({ db: ws.db, openai, cache }, { query: 'unit price', limit: 5 });
    expect(openai.embed).toHaveBeenCalledTimes(1);

    // Same process, same query: nothing new is sent.
    const same = await searchColumns(
      { db: ws.db, openai, cache },
      { query: 'unit price', limit: 5 },
    );
    expect(same.newlyEmbedded).toBe(0);
    expect(openai.embed).toHaveBeenCalledTimes(1);

    // A new process reads the persisted column vectors; only the (memory-only) query is new.
    const fresh = await searchColumns(
      { db: ws.db, openai, cache: new EmbeddingCache(file) },
      { query: 'unit price', limit: 5 },
    );
    expect(fresh.newlyEmbedded).toBe(1);
    expect(openai.embedded.at(-1)).toEqual(['unit price']);
    expect(fresh.matches[0]).toMatchObject({ column: 'unit_price' });

    const stored = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, unknown> };
    const keys = Object.keys(stored.entries);
    expect(keys).toHaveLength(10); // the 10 column descriptions
    expect(keys).not.toContain(contentHash('unit price', EMBEDDING_MODEL, EMBEDDING_DIMENSIONS));
  });

  it('can be limited to specific datasets', async () => {
    const openai = createFakeOpenAI();
    const result = await searchColumns(
      { db: ws.db, openai, cache: new EmbeddingCache(undefined) },
      { query: 'event kind', datasets: ['events'], limit: 10 },
    );
    expect(result.columnsSearched).toBe(3);
    expect(new Set(result.matches.map((m) => m.dataset))).toEqual(new Set(['events']));
  });

  it('ranks correctly even when a tiny cache evicts during the search', async () => {
    const openai = createFakeOpenAI();
    const cache = new EmbeddingCache(undefined, 2); // far fewer slots than columns
    await searchColumns({ db: ws.db, openai, cache }, { query: 'unit price', limit: 3 });
    const again = await searchColumns(
      { db: ws.db, openai, cache },
      { query: 'unit price', limit: 3 },
    );
    expect(again.matches[0]).toMatchObject({ column: 'unit_price' });
    expect(again.matches[0]?.score).toBeGreaterThan(0);
    expect(again.truncated).toBe(false);
  });
});

describe('describeColumn bounds', () => {
  it('clips long column names and nested types so one description stays small', () => {
    const text = describeColumn('d', 'n'.repeat(1_000), `STRUCT(${'a INTEGER, '.repeat(500)})`, []);
    expect(text.length).toBeLessThan(340);
    expect(text).toContain('…');
  });
});
