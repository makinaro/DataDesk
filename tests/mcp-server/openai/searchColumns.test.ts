import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '../../../src/mcp-server/openai/client';
import { contentHash, EmbeddingCache } from '../../../src/mcp-server/openai/embeddingCache';
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

  it('keys on model, dimensions and exact text', () => {
    const a = contentHash('sales.region', 'm1', 512);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash('sales.region', 'm1', 512)).toBe(a);
    expect(contentHash('sales.region', 'm2', 512)).not.toBe(a);
    expect(contentHash('sales.region', 'm1', 256)).not.toBe(a);
    expect(contentHash('sales.Region', 'm1', 512)).not.toBe(a);
  });

  it('persists across instances, evicts the oldest entries, and survives a corrupt file', async () => {
    const file = join(ws.root, 'cache', 'embeddings.json');
    const k = (i: number) => contentHash(String(i), 'm', 2);
    const first = new EmbeddingCache(file, 2);
    await first.load();
    first.set(k(1), [1, 0]);
    first.set(k(2), [0, 1]);
    first.set(k(3), [1, 1]);
    await first.save();

    const second = new EmbeddingCache(file, 2);
    await second.load();
    expect(second.size).toBe(2);
    expect(second.get(k(1))).toBeUndefined();
    expect(second.get(k(3))).toEqual([1, 1]);

    writeFileSync(file, '{not json');
    const third = new EmbeddingCache(file, 2);
    await third.load();
    expect(third.size).toBe(0);
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

  it('caches by content hash: a repeat search embeds nothing new, even in a new process', async () => {
    const file = join(ws.root, 'cache', 'embeddings.json');
    const openai = createFakeOpenAI();
    await searchColumns(
      { db: ws.db, openai, cache: new EmbeddingCache(file) },
      { query: 'unit price', limit: 5 },
    );
    expect(openai.embed).toHaveBeenCalledTimes(1);

    // A fresh cache instance (= a new datadesk-mcp process) reads the persisted file.
    const again = await searchColumns(
      { db: ws.db, openai, cache: new EmbeddingCache(file) },
      { query: 'unit price', limit: 5 },
    );
    expect(openai.embed).toHaveBeenCalledTimes(1);
    expect(again.newlyEmbedded).toBe(0);
    expect(again.matches[0]).toMatchObject({ column: 'unit_price' });

    // A new query costs exactly one new embedding.
    const third = await searchColumns(
      { db: ws.db, openai, cache: new EmbeddingCache(file) },
      { query: 'order date', limit: 5 },
    );
    expect(third.newlyEmbedded).toBe(1);
    expect(openai.embedded.at(-1)).toEqual(['order date']);

    const stored = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, unknown> };
    expect(Object.keys(stored.entries)).toContain(
      contentHash('order date', EMBEDDING_MODEL, EMBEDDING_DIMENSIONS),
    );
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
});
