import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { ServerPaths } from './mcp/serverProcess';

/** Filesystem locations the main process hands to child processes. */
export function serverPaths(): ServerPaths {
  // Packaged builds ship extensions as extraResources (Phase 8); dev uses the fetched copy.
  const extensionDir = app.isPackaged
    ? join(process.resourcesPath, 'duckdb-extensions')
    : join(app.getAppPath(), 'resources', 'duckdb-extensions');
  return {
    userData: app.getPath('userData'),
    mainDir: import.meta.dirname,
    extensionDir: existsSync(extensionDir) ? extensionDir : undefined,
  };
}
