import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Node-only helpers shared by the main process and datadesk-mcp (never the renderer or preload).
 */

export type RenameFn = (from: string, to: string) => Promise<void>;

// On Windows, antivirus, the search indexer or sync clients can briefly hold the target open,
// making rename-over-existing fail with one of these codes. They usually clear within ms.
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_ATTEMPTS = 5;

async function renameWithRetry(renameFile: RenameFn, from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await renameFile(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (attempt >= RENAME_ATTEMPTS || !TRANSIENT_RENAME_CODES.has(code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
}

export interface AtomicWriteOptions {
  mode?: number;
  /** Injected in tests to simulate locked files. */
  renameFile?: RenameFn;
}

/** Writes via a unique temp file + rename, so readers never see a half-written file. */
export async function writeFileAtomic(
  filePath: string,
  contents: string,
  { mode, renameFile = rename }: AtomicWriteOptions = {},
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${String(process.pid)}.${String(Date.now())}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await writeFile(tmp, contents, { encoding: 'utf8', ...(mode === undefined ? {} : { mode }) });
    await renameWithRetry(renameFile, tmp, filePath);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}
