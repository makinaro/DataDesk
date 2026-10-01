import { z } from 'zod';
import type { DatasetDb } from '../db/datasetDb';
import { getSchema, sampleRows } from '../datasets';
import type { OpenAIClient } from './client';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './client';
import { contentHash, type EmbeddingCache } from './embeddingCache';

/**
 * What leaves the machine per column: its (clipped) name and type and a few short sample
 * values. Every part is bounded, so one description can't exceed the embedding input limit.
 */
const SAMPLE_ROWS = 20;
const SAMPLE_VALUES = 3;
const SAMPLE_CHARS = 40;
const NAME_CHARS = 200;
const TYPE_CHARS = 120;
const MAX_COLUMNS = 2_000;

export const ColumnMatchSchema = z.object({
  dataset: z.string(),
  column: z.string(),
  type: z.string(),
  score: z.number(),
});
export type ColumnMatch = z.infer<typeof ColumnMatchSchema>;

export const SearchColumnsResultSchema = z.object({
  matches: z.array(ColumnMatchSchema),
  columnsSearched: z.number().int(),
  /** More columns existed than the search cap; narrow with `datasets`. */
  truncated: z.boolean(),
  newlyEmbedded: z.number().int(),
});
export type SearchColumnsResult = z.infer<typeof SearchColumnsResultSchema>;

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** Highest score first; ties keep their original (dataset, column) order. */
export function rank<T extends { vector: readonly number[] }>(
  query: readonly number[],
  items: readonly T[],
  limit: number,
): (T & { score: number })[] {
  return items
    .map((item, i) => ({ ...item, score: cosine(query, item.vector), i }))
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .slice(0, limit)
    .map(({ i: _i, ...rest }) => rest as T & { score: number });
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** The text embedded for a column, e.g. `sales.region (VARCHAR): e.g. South, East, West`. */
export function describeColumn(
  dataset: string,
  column: string,
  type: string,
  samples: readonly unknown[],
): string {
  const values: string[] = [];
  for (const v of samples) {
    if (v === null || v === undefined) continue;
    const text = clip(
      (typeof v === 'string' ? v : JSON.stringify(v)).replace(/\s+/g, ' ').trim(),
      SAMPLE_CHARS,
    );
    if (text && !values.includes(text)) values.push(text);
    if (values.length === SAMPLE_VALUES) break;
  }
  const head = `${dataset}.${clip(column, NAME_CHARS)} (${clip(type, TYPE_CHARS)})`;
  return values.length ? `${head}: e.g. ${values.join(', ')}` : head;
}

interface ColumnDoc {
  dataset: string;
  column: string;
  type: string;
  text: string;
}

async function collectColumns(
  db: DatasetDb,
  datasets: readonly string[],
): Promise<{ docs: ColumnDoc[]; truncated: boolean }> {
  const docs: ColumnDoc[] = [];
  for (const dataset of datasets) {
    if (docs.length >= MAX_COLUMNS) return { docs, truncated: true };
    const columns = await getSchema(db, dataset);
    const sample = await sampleRows(db, dataset, SAMPLE_ROWS, 'head');
    for (const c of columns) {
      if (docs.length >= MAX_COLUMNS) return { docs, truncated: true };
      const index = sample.columns.findIndex((s) => s.name === c.name);
      const values = index < 0 ? [] : sample.rows.map((row) => row[index]);
      docs.push({
        dataset,
        column: c.name,
        type: c.type,
        text: describeColumn(dataset, c.name, c.type, values),
      });
    }
  }
  return { docs, truncated: false };
}

/**
 * Semantic column search: embeds each column's description (cached by content hash, so only new
 * or changed columns cost a request) and the query, then ranks by cosine similarity. Ranking
 * uses this search's own vectors, so cache eviction can never zero a score.
 */
export async function searchColumns(
  deps: { db: DatasetDb; openai: OpenAIClient; cache: EmbeddingCache },
  input: { query: string; datasets?: string[] | undefined; limit: number },
  signal?: AbortSignal,
): Promise<SearchColumnsResult> {
  const { db, openai, cache } = deps;
  await cache.load();
  const names =
    input.datasets ??
    (await db.datasets()).filter((d) => d.error === undefined).map((d) => d.entry.name);
  const { docs, truncated } = await collectColumns(db, names);
  if (docs.length === 0) {
    return { matches: [], columnsSearched: 0, truncated: false, newlyEmbedded: 0 };
  }

  const key = (text: string) => contentHash(text, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS);
  const vectors = new Map<string, number[]>();
  const missing: string[] = [];
  for (const text of new Set([input.query, ...docs.map((d) => d.text)])) {
    const hit = cache.get(key(text));
    if (hit) vectors.set(text, hit);
    else missing.push(text);
  }
  if (missing.length > 0) {
    const fresh = await openai.embed(missing, signal);
    missing.forEach((text, i) => {
      const vector = fresh[i];
      if (!vector) return;
      vectors.set(text, vector);
      // Column descriptions are reused across sessions; queries are one-offs (memory only).
      cache.set(key(text), vector, { persist: text !== input.query });
    });
    await cache.save();
  }

  const ranked = rank(
    vectors.get(input.query) ?? [],
    docs.map((d) => ({ ...d, vector: vectors.get(d.text) ?? [] })),
    input.limit,
  );
  return {
    matches: ranked.map((r) => ({
      dataset: r.dataset,
      column: r.column,
      type: r.type,
      score: Math.round(r.score * 1000) / 1000,
    })),
    columnsSearched: docs.length,
    truncated,
    newlyEmbedded: missing.length,
  };
}
