import { join } from 'node:path';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface ServerPaths {
  /** Electron's userData directory. */
  userData: string;
  /** Directory containing the built mcp-server.js (out/main). */
  mainDir: string;
  /** Pre-fetched DuckDB extensions, if present. */
  extensionDir: string | undefined;
}

/**
 * The environment datadesk-mcp gets, built explicitly (CLAUDE.md, Security rule 5).
 * StdioClientTransport adds only a short OS allowlist (PATH, SYSTEMROOT, TEMP, …) on top, so
 * nothing else from our environment (and no API key) reaches the child.
 */
export function buildServerEnv(
  paths: ServerPaths,
  purpose: 'ui' | 'agent',
): Record<string, string> {
  const env: Record<string, string> = {
    ELECTRON_RUN_AS_NODE: '1',
    DATADESK_CATALOG_PATH: join(paths.userData, 'catalog.json'),
    // Nothing inside DataDesk's own profile (secrets, catalog, logs) may be registered as data.
    DATADESK_DENY_DIRS: paths.userData,
    DATADESK_TEMP_DIR: join(paths.userData, 'duckdb-tmp', purpose),
  };
  if (paths.extensionDir) env.DATADESK_EXTENSION_DIR = paths.extensionDir;
  return env;
}

/** Spawns datadesk-mcp with the Electron binary in Node mode (DECISIONS D-003). */
export function createStdioTransport(
  paths: ServerPaths,
  onStderr: (line: string) => void,
): StdioClientTransport {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(paths.mainDir, 'mcp-server.js')],
    env: buildServerEnv(paths, 'ui'),
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) if (line.trim()) onStderr(line.trim());
  });
  return transport;
}
