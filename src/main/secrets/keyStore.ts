import { readFile, rename } from 'node:fs/promises';
import { z } from 'zod';
import { writeFileAtomic, type RenameFn } from '../../node-shared/atomicFile';
import { ProviderSchema, type Provider, type SecretsStatus } from '../../shared/ipc/contract';

/** The slice of Electron's safeStorage we use (DPAPI on Windows). Injected for tests. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class EncryptionUnavailableError extends Error {
  constructor() {
    super('OS-level encryption is unavailable, so API keys cannot be stored safely.');
    this.name = 'EncryptionUnavailableError';
  }
}

const SecretsFileSchema = z.strictObject({
  version: z.literal(1),
  keys: z.partialRecord(ProviderSchema, z.base64()),
});
type SecretsFile = z.infer<typeof SecretsFileSchema>;

const EMPTY: SecretsFile = { version: 1, keys: {} };

/**
 * Encrypted API key storage. Lives only in the main process.
 * - `status`, `set` and `clear` are safe to expose over IPC (they return booleans).
 * - `getKey` returns plaintext and must never be wired to an IPC handler.
 */
export class KeyStore {
  private cache: SecretsFile | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly safeStorage: SafeStorageLike,
    private readonly onCorruptFile: (error: unknown) => void = () => undefined,
    private readonly renameFile: RenameFn = rename,
  ) {}

  async status(): Promise<SecretsStatus> {
    const file = await this.load();
    return {
      anthropic: file.keys.anthropic !== undefined,
      openai: file.keys.openai !== undefined,
      huggingface: file.keys.huggingface !== undefined,
    };
  }

  async set(provider: Provider, key: string): Promise<SecretsStatus> {
    if (!this.safeStorage.isEncryptionAvailable()) throw new EncryptionUnavailableError();
    const encrypted = this.safeStorage.encryptString(key).toString('base64');
    await this.update((file) => ({ ...file, keys: { ...file.keys, [provider]: encrypted } }));
    return this.status();
  }

  async clear(provider: Provider): Promise<SecretsStatus> {
    await this.update((file) => {
      const { [provider]: _removed, ...keys } = file.keys;
      return { ...file, keys };
    });
    return this.status();
  }

  /** Main-process only. Returns undefined if unset or if decryption is impossible. */
  async getKey(provider: Provider): Promise<string | undefined> {
    const encrypted = (await this.load()).keys[provider];
    if (encrypted === undefined) return undefined;
    if (!this.safeStorage.isEncryptionAvailable()) throw new EncryptionUnavailableError();
    return this.safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }

  private async load(): Promise<SecretsFile> {
    if (this.cache) return this.cache;
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = EMPTY;
        return this.cache;
      }
      throw error;
    }
    const parsed = SecretsFileSchema.safeParse(safeJsonParse(raw));
    if (!parsed.success) {
      // Don't crash the app over a damaged file. Treat it as empty; the next write replaces it.
      this.onCorruptFile(parsed.error);
      this.cache = EMPTY;
      return this.cache;
    }
    this.cache = parsed.data;
    return this.cache;
  }

  /** Serializes read-modify-write cycles and writes atomically (temp file + rename). */
  private update(mutate: (file: SecretsFile) => SecretsFile): Promise<void> {
    const run = async (): Promise<void> => {
      const next = mutate(await this.load());
      await writeFileAtomic(this.filePath, JSON.stringify(next, null, 2), {
        mode: 0o600,
        renameFile: this.renameFile,
      });
      this.cache = next;
    };
    const result = this.writeQueue.then(run, run);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
