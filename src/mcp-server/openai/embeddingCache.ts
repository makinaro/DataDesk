import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { writeFileAtomic } from '../../node-shared/atomicFile';

/** Cache key: the exact text and the embedding settings that produced the vector. */
export function contentHash(text: string, model: string, dimensions: number): string {
  return createHash('sha256')
    .update(`${model}\n${String(dimensions)}\n${text}`)
    .digest('hex');
}

const CacheFileSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string().regex(/^[0-9a-f]{64}$/), z.array(z.number()).max(4096)),
});

/**
 * Content-addressed embedding cache, persisted as one JSON file. Each agent session runs its own
 * datadesk-mcp process, so persisting means a column is embedded once, not once per session.
 * Bounded: when full, the oldest entries are dropped (insertion order).
 */
export class EmbeddingCache {
  private entries = new Map<string, number[]>();
  private loaded = false;
  private dirty = false;

  constructor(
    private readonly file: string | undefined,
    private readonly maxEntries = 20_000,
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file) return;
    try {
      const parsed = CacheFileSchema.safeParse(JSON.parse(await readFile(this.file, 'utf8')));
      // A corrupt or old-format cache is simply rebuilt.
      if (parsed.success) this.entries = new Map(Object.entries(parsed.data.entries));
    } catch {
      // Missing file: start empty.
    }
  }

  get(key: string): number[] | undefined {
    return this.entries.get(key);
  }

  set(key: string, vector: number[]): void {
    this.entries.delete(key);
    this.entries.set(key, vector);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.dirty = true;
  }

  get size(): number {
    return this.entries.size;
  }

  async save(): Promise<void> {
    if (!this.file || !this.dirty) return;
    await writeFileAtomic(
      this.file,
      JSON.stringify({ version: 1, entries: Object.fromEntries(this.entries) }),
    );
    this.dirty = false;
  }
}
