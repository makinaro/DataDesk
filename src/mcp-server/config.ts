import { z } from 'zod';

/**
 * datadesk-mcp is configured only through environment variables, which the parent process
 * (the Electron main process, or the Agent SDK acting for it) builds explicitly.
 */
const EnvSchema = z.object({
  DATADESK_CATALOG_PATH: z.string().min(1),
  /** Directories whose files may never be registered (e.g. the app's own userData). `;`-separated. */
  DATADESK_DENY_DIRS: z.string().default(''),
  DATADESK_MAX_ROWS: z.coerce.number().int().min(1).max(10_000).default(500),
  DATADESK_QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).max(300_000).default(15_000),
  DATADESK_MEMORY_LIMIT: z
    .string()
    .regex(/^\d+(\.\d+)?\s?(KB|MB|GB)$/i)
    .default('2GB'),
  DATADESK_THREADS: z.coerce.number().int().min(1).max(64).default(4),
  DATADESK_MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(2 * 1024 ** 3),
});

export interface ServerConfig {
  catalogPath: string;
  denyDirs: string[];
  maxRows: number;
  queryTimeoutMs: number;
  memoryLimit: string;
  threads: number;
  maxFileBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const parsed = EnvSchema.parse(env);
  return {
    catalogPath: parsed.DATADESK_CATALOG_PATH,
    denyDirs: parsed.DATADESK_DENY_DIRS.split(';')
      .map((d) => d.trim())
      .filter(Boolean),
    maxRows: parsed.DATADESK_MAX_ROWS,
    queryTimeoutMs: parsed.DATADESK_QUERY_TIMEOUT_MS,
    memoryLimit: parsed.DATADESK_MEMORY_LIMIT.replace(/\s/g, ''),
    threads: parsed.DATADESK_THREADS,
    maxFileBytes: parsed.DATADESK_MAX_FILE_BYTES,
  };
}
