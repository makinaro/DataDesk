/**
 * datadesk-mcp stdio entry point.
 *
 * Runs as its own process: `node out/main/mcp-server.js` in dev and tests, or the Electron
 * binary with ELECTRON_RUN_AS_NODE=1 inside the app (DECISIONS D-003).
 * stdout carries the MCP protocol, so log to stderr only.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ArtifactStore } from '../node-shared/artifactStore';
import { Catalog } from './catalog';
import { loadConfigAndTakeSecrets } from './config';
import { DatasetDb } from './db/datasetDb';
import { createOpenAIClient } from './openai/client';
import { EmbeddingCache } from './openai/embeddingCache';
import { scrubSecrets } from './scrubEnv';
import { buildServer, SERVER_NAME, SERVER_VERSION } from './server';

/** One file; large Parquet files over a slow link can take a while. */
const HF_DOWNLOAD_TIMEOUT_MS = 20 * 60_000;

const log = (message: string) => {
  process.stderr.write(`[datadesk-mcp] ${message}\n`);
};

async function main(): Promise<void> {
  // Before anything else: drop secrets inherited from whoever spawned us (names only in the log).
  const scrubbed = scrubSecrets(process.env);
  if (scrubbed.length > 0) log(`removed inherited secrets from env: ${scrubbed.join(', ')}`);

  const config = loadConfigAndTakeSecrets(process.env);
  const db = new DatasetDb(new Catalog(config.catalogPath), {
    maxRows: config.maxRows,
    queryTimeoutMs: config.queryTimeoutMs,
    memoryLimit: config.memoryLimit,
    threads: config.threads,
    tempDir: config.tempDir ?? join(tmpdir(), 'datadesk-duckdb', String(process.pid)),
    extensionDir: config.extensionDir,
  });
  const server = buildServer({
    db,
    importPolicy: { denyDirs: config.denyDirs, maxFileBytes: config.maxFileBytes },
    artifacts: new ArtifactStore(config.artifactsDir),
    openai: config.openaiApiKey
      ? {
          client: createOpenAIClient(config.openaiApiKey),
          cache: new EmbeddingCache(join(config.cacheDir, 'embeddings.json')),
        }
      : undefined,
    hf: config.hfToken
      ? {
          token: config.hfToken,
          hfDir: config.hfDir,
          maxBytes: config.hfMaxBytes,
          timeoutMs: HF_DOWNLOAD_TIMEOUT_MS,
          fetch: globalThis.fetch,
        }
      : undefined,
    ui: config.uiTools ? { ownedDir: config.hfDir } : undefined,
  });

  let closing = false;
  const shutdown = (reason: string) => {
    if (closing) return;
    closing = true;
    log(`shutting down (${reason})`);
    void server
      .close()
      .catch(() => undefined)
      .finally(() => {
        db.close();
        process.exit(0);
      });
  };
  process.stdin.on('close', () => {
    shutdown('stdin closed');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  await server.connect(new StdioServerTransport());
  log(
    `${SERVER_NAME} ${SERVER_VERSION} ready (catalog: ${config.catalogPath}; OpenAI tools: ${config.openaiApiKey ? 'on' : 'off'}; HF tools: ${config.hfToken ? 'on' : 'off'})`,
  );
}

main().catch((error: unknown) => {
  log(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
