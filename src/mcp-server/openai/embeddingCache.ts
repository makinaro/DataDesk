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

/** Vectors are stored as base64 Float32 (~2.7 KB at 512 dims, vs ~7 KB as JSON numbers). */
export function encodeVector(vector: readonly number[]): string {
  return Buffer.from(new Float32Array(vector).buffer).toString('base64');
}

export function decodeVector(encoded: string): number[] {
  const bytes = Buffer.from(encoded, 'base64');
  return Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2));
}

const CacheFileSchema = z.object({
  version: z.literal(2),
  entries: z.record(z.string().regex(/^[0-9a-f]{64}$/), z.string().max(65_536)),
});

/**
 * Content-addressed embedding cache. Column-description vectors are persisted as one JSON file
 * (each agent session runs its own datadesk-mcp, so a column is embedded once, not once per
 * session); one-off vectors such as search queries stay in memory only.
 * Bounded and least-recently-used: a lookup refreshes an entry, the stalest are dropped.
 * The cache is an optimisation: failing to read or write it never fails a tool call.
 */
export class EmbeddingCache {
  private readonly persisted = new Map<string, number[]>();
  private readonly memory = new Map<string, number[]>();
  private loading: Promise<void> | undefined;
  private dirty = false;

  constructor(
    private readonly file: string | undefined,
    private readonly maxEntries = 5_000,
    private readonly warn: (message: string) => void = (m) => {
      process.stderr.write(`[datadesk-mcp] ${m}\n`);
    },
  ) {}

  /** Loads the file once, however many calls race; entries set meanwhile are kept. */
  load(): Promise<void> {
    this.loading ??= this.readFile();
    return this.loading;
  }

  private async readFile(): Promise<void> {
    if (!this.file) return;
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch {
      return; // no cache yet
    }
    try {
      const parsed = CacheFileSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return; // corrupt or old format: rebuilt as we go
      for (const [key, encoded] of Object.entries(parsed.data.entries)) {
        if (!this.persisted.has(key)) this.persisted.set(key, decodeVector(encoded));
      }
      this.evict();
    } catch {
      // Unparseable file: start empty.
    }
  }

  get(key: string): number[] | undefined {
    const hit = this.persisted.get(key);
    if (hit) {
      this.persisted.delete(key); // refresh recency
      this.persisted.set(key, hit);
      return hit;
    }
    return this.memory.get(key);
  }

  set(key: string, vector: number[], { persist }: { persist: boolean }): void {
    const target = persist ? this.persisted : this.memory;
    target.delete(key);
    target.set(key, vector);
    if (persist) this.dirty = true;
    this.evict();
  }

  private evict(): void {
    for (const map of [this.persisted, this.memory]) {
      while (map.size > this.maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    }
  }

  get size(): number {
    return this.persisted.size;
  }

  async save(): Promise<void> {
    if (!this.file || !this.dirty) return;
    const entries = Object.fromEntries(
      [...this.persisted].map(([key, vector]) => [key, encodeVector(vector)]),
    );
    try {
      await writeFileAtomic(this.file, JSON.stringify({ version: 2, entries }));
      this.dirty = false;
    } catch (error) {
      // E.g. antivirus holding the file. Keep going; we'll try again on the next save.
      this.warn(
        `could not save the embedding cache: ${error instanceof Error ? error.name : 'error'}`,
      );
    }
  }
}
