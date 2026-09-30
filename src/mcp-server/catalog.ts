import { mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
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

export class CatalogBusyError extends Error {
  constructor() {
    super('The dataset catalog is busy (another DataDesk process is writing). Try again.');
    this.name = 'CatalogBusyError';
  }
}

const LOCK_WAIT_MS = 5_000;
/** A lock older than this was left by a crashed process and may be taken over. */
const LOCK_STALE_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Registered datasets, persisted as JSON. Several datadesk-mcp processes share this file
 * (the UI's server and each agent session's server; see DECISIONS D-002), so:
 * - every read goes to disk,
 * - every write is an atomic temp-file + rename (readers never see half a file), and
 * - read-modify-write cycles hold a cross-process lockfile, so concurrent registrations from
 *   different processes can't overwrite each other.
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
    const valid = CatalogEntrySchema.parse(entry);
    await this.withLock(async () => {
      const file = await this.read();
      const datasets = file.datasets.filter((d) => d.name !== valid.name);
      datasets.push(valid);
      datasets.sort((a, b) => a.name.localeCompare(b.name));
      await this.write({ version: 1, datasets });
    });
  }

  remove(name: string): Promise<boolean> {
    return this.withLock(async () => {
      const file = await this.read();
      const datasets = file.datasets.filter((d) => d.name !== name);
      if (datasets.length === file.datasets.length) return false;
      await this.write({ version: 1, datasets });
      return true;
    });
  }

  private async withLock<T>(work: () => Promise<T>): Promise<T> {
    const lockPath = `${this.filePath}.lock`;
    await mkdir(dirname(this.filePath), { recursive: true });
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      try {
        // 'wx' = create exclusively: fails with EEXIST if another process holds the lock.
        const handle = await open(lockPath, 'wx');
        await handle.writeFile(String(process.pid));
        await handle.close();
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const age = await stat(lockPath).then(
          (s) => Date.now() - s.mtimeMs,
          () => 0,
        );
        if (age > LOCK_STALE_MS) {
          await rm(lockPath, { force: true });
          continue;
        }
        if (Date.now() > deadline) throw new CatalogBusyError();
        await sleep(20 + Math.random() * 30);
      }
    }
    try {
      return await work();
    } finally {
      await rm(lockPath, { force: true });
    }
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
