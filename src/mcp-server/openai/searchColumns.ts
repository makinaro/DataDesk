import { z } from 'zod';
import type { DatasetDb } from '../db/datasetDb';
import { getSchema, sampleRows } from '../datasets';
import type { OpenAIClient } from './client';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './client';
import { contentHash, type EmbeddingCache } from './embeddingCache';

/** What leaves the machine per column: its name, type and a few short sample values. */
const SAMPLE_ROWS = 20;
const SAMPLE_VALUES = 3;
const SAMPLE_CHARS = 40;
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
    const text = (typeof v === 'string' ? v : JSON.stringify(v)).replace(/\s+/g, ' ').trim();
    const clipped = text.length > SAMPLE_CHARS ? `${text.slice(0, SAMPLE_CHARS - 1)}…` : text;
    if (clipped && !values.includes(clipped)) values.push(clipped);
    if (values.length === SAMPLE_VALUES) break;
  }
  return `${dataset}.${column} (${type})${values.length ? `: e.g. ${values.join(', ')}` : ''}`;
}

interface ColumnDoc {
  dataset: string;
  column: string;
  type: string;
  text: string;
}

async function collectColumns(db: DatasetDb, datasets: readonly string[]): Promise<ColumnDoc[]> {
  const docs: ColumnDoc[] = [];
  for (const dataset of datasets) {
    const columns = await getSchema(db, dataset);
    const sample = await sampleRows(db, dataset, SAMPLE_ROWS, 'head');
    columns.forEach((c) => {
      const index = sample.columns.findIndex((s) => s.name === c.name);
      const values = index < 0 ? [] : sample.rows.map((row) => row[index]);
      docs.push({
        dataset,
        column: c.name,
        type: c.type,
        text: describeColumn(dataset, c.name, c.type, values),
      });
    });
    if (docs.length > MAX_COLUMNS) break;
  }
  return docs.slice(0, MAX_COLUMNS);
}

/**
 * Semantic column search: embeds each column's description (cached by content hash, so only new
 * or changed columns cost a request) and the query, then ranks by cosine similarity.
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
  const docs = await collectColumns(db, names);
  if (docs.length === 0) return { matches: [], columnsSearched: 0, newlyEmbedded: 0 };

  const key = (text: string) => contentHash(text, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS);
  const texts = [input.query, ...docs.map((d) => d.text)];
  const missing = [...new Set(texts.filter((t) => cache.get(key(t)) === undefined))];
  if (missing.length > 0) {
    const vectors = await openai.embed(missing, signal);
    missing.forEach((text, i) => {
      const vector = vectors[i];
      if (vector) cache.set(key(text), vector);
    });
    await cache.save();
  }

  const vectorOf = (text: string): number[] => cache.get(key(text)) ?? [];
  const ranked = rank(
    vectorOf(input.query),
    docs.map((d) => ({ ...d, vector: vectorOf(d.text) })),
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
    newlyEmbedded: missing.length,
  };
}
