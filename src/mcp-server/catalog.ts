import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { writeFileAtomic } from '../node-shared/atomicFile';
import { CatalogEntrySchema, type CatalogEntry } from '../shared/datasets';

const CatalogFileSchema = z.strictObject({
  version: z.literal(1),
  datasets: z.array(CatalogEntrySchema),
});
type CatalogFile = z.infer<typeof CatalogFileSchema>;

export class CatalogCorruptError extends Error {
  constructor(path: string) {
    super(`The dataset catalog at ${path} is unreadable.`);
    this.name = 'CatalogCorruptError';
  }
}

/**
 * Registered datasets, persisted as JSON. Several datadesk-mcp processes may share this file
 * (the UI's server and each agent session's server; see DECISIONS D-002), so every read goes to
 * disk and every write is an atomic temp-file + rename.
 */
export class Catalog {
  constructor(private readonly filePath: string) {}

  async list(): Promise<CatalogEntry[]> {
    return (await this.read()).datasets;
  }

  async get(name: string): Promise<CatalogEntry | undefined> {
    return (await this.list()).find((d) => d.name === name);
  }

  /** Adds or replaces the entry with the same name. */
  async upsert(entry: CatalogEntry): Promise<void> {
    const file = await this.read();
    const datasets = file.datasets.filter((d) => d.name !== entry.name);
    datasets.push(CatalogEntrySchema.parse(entry));
    datasets.sort((a, b) => a.name.localeCompare(b.name));
    await this.write({ version: 1, datasets });
  }

  async remove(name: string): Promise<boolean> {
    const file = await this.read();
    const datasets = file.datasets.filter((d) => d.name !== name);
    if (datasets.length === file.datasets.length) return false;
    await this.write({ version: 1, datasets });
    return true;
  }

  private async read(): Promise<CatalogFile> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, datasets: [] };
      throw error;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new CatalogCorruptError(this.filePath);
    }
    const parsed = CatalogFileSchema.safeParse(json);
    if (!parsed.success) throw new CatalogCorruptError(this.filePath);
    return parsed.data;
  }

  private async write(file: CatalogFile): Promise<void> {
    await writeFileAtomic(this.filePath, JSON.stringify(file, null, 2));
  }
}
