import { dirname, join } from 'node:path';
import { z } from 'zod';
import { HF_MAX_DOWNLOAD_BYTES } from '../shared/hf';

/**
 * datadesk-mcp is configured only through environment variables, which the parent process
 * (the Electron main process, or the Agent SDK acting for it) builds explicitly.
 */
const EnvSchema = z.object({
  DATADESK_CATALOG_PATH: z.string().min(1),
  /** Charts and reports. Defaults to an "artifacts" folder next to the catalog. */
  DATADESK_ARTIFACTS_DIR: z.string().min(1).optional(),
  /** Directories whose files may never be registered (e.g. the app's own userData). `;`-separated. */
  DATADESK_DENY_DIRS: z.string().default(''),
  DATADESK_MAX_ROWS: z.coerce.number().int().min(1).max(10_000).default(500),
  DATADESK_QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).max(300_000).default(15_000),
  DATADESK_MEMORY_LIMIT: z
    .string()
    .regex(/^\d+(\.\d+)?\s?(KB|MB|GB)$/i)
    .default('2GB'),
  /** Where DuckDB spills to disk. Defaults to a per-process folder in the OS temp dir. */
  DATADESK_TEMP_DIR: z.string().min(1).optional(),
  /** Pre-fetched DuckDB extensions (Excel). Nothing is downloaded at query time. */
  DATADESK_EXTENSION_DIR: z.string().min(1).optional(),
  DATADESK_THREADS: z.coerce.number().int().min(1).max(64).default(4),
  /**
   * Enables the OpenAI tools (search_columns, second_opinion). Passed by main through the agent
   * CLI's explicitly built env, never on a command line (DECISIONS D-018). Empty = disabled.
   */
  DATADESK_OPENAI_API_KEY: z.string().optional(),
  /**
   * Enables load_hf_dataset (and is sent to huggingface.co for gated datasets). Arrives through
   * the agent CLI's env, like the OpenAI key (DECISIONS D-019). Empty = disabled.
   */
  DATADESK_HF_TOKEN: z.string().optional(),
  /** Where load_hf_dataset downloads to. Defaults to datasets/hf next to the catalog. */
  DATADESK_HF_DIR: z.string().min(1).optional(),
  DATADESK_HF_MAX_BYTES: z.coerce.number().int().min(1).default(HF_MAX_DOWNLOAD_BYTES),
  /** Embedding cache. Defaults to a "cache" folder next to the catalog. */
  DATADESK_CACHE_DIR: z.string().min(1).optional(),
  DATADESK_MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(2 * 1024 ** 3),
});

export interface ServerConfig {
  catalogPath: string;
  artifactsDir: string;
  denyDirs: string[];
  maxRows: number;
  queryTimeoutMs: number;
  memoryLimit: string;
  threads: number;
  maxFileBytes: number;
  tempDir: string | undefined;
  extensionDir: string | undefined;
  openaiApiKey: string | undefined;
  cacheDir: string;
  hfToken: string | undefined;
  hfDir: string;
  hfMaxBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const parsed = EnvSchema.parse(env);
  const openaiKey = parsed.DATADESK_OPENAI_API_KEY?.trim();
  const hfToken = parsed.DATADESK_HF_TOKEN?.trim();
  return {
    catalogPath: parsed.DATADESK_CATALOG_PATH,
    artifactsDir:
      parsed.DATADESK_ARTIFACTS_DIR ?? join(dirname(parsed.DATADESK_CATALOG_PATH), 'artifacts'),
    denyDirs: parsed.DATADESK_DENY_DIRS.split(';')
      .map((d) => d.trim())
      .filter(Boolean),
    maxRows: parsed.DATADESK_MAX_ROWS,
    queryTimeoutMs: parsed.DATADESK_QUERY_TIMEOUT_MS,
    memoryLimit: parsed.DATADESK_MEMORY_LIMIT.replace(/\s/g, ''),
    threads: parsed.DATADESK_THREADS,
    maxFileBytes: parsed.DATADESK_MAX_FILE_BYTES,
    tempDir: parsed.DATADESK_TEMP_DIR,
    extensionDir: parsed.DATADESK_EXTENSION_DIR,
    // Blank (main blanks secrets with '') means disabled.
    openaiApiKey: openaiKey === '' ? undefined : openaiKey,
    cacheDir: parsed.DATADESK_CACHE_DIR ?? join(dirname(parsed.DATADESK_CATALOG_PATH), 'cache'),
    hfToken: hfToken === '' ? undefined : hfToken,
    hfDir: parsed.DATADESK_HF_DIR ?? join(dirname(parsed.DATADESK_CATALOG_PATH), 'datasets', 'hf'),
    hfMaxBytes: parsed.DATADESK_HF_MAX_BYTES,
  };
}

/**
 * Reads the config, then removes the keys from the environment: from here on they live only in
 * the returned config, so nothing else in this process (or a child it spawned) sees them.
 */
export function loadConfigAndTakeSecrets(env: NodeJS.ProcessEnv): ServerConfig {
  const config = loadConfig(env);
  Reflect.deleteProperty(env, 'DATADESK_OPENAI_API_KEY');
  Reflect.deleteProperty(env, 'DATADESK_HF_TOKEN');
  return config;
}
