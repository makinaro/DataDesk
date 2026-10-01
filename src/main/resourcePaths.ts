import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ServerPaths } from './mcp/serverProcess';

/** Where the app runs from; read from Electron's `app` in paths.ts, plain values in tests. */
export interface AppLocation {
  isPackaged: boolean;
  /** process.resourcesPath: `<install dir>\resources` when packaged. */
  resourcesPath: string;
  /** app.getAppPath(): the repo root in dev, `resources\app.asar` when packaged. */
  appPath: string;
  userData: string;
  /** The directory of the built main bundle (out/main), which also holds mcp-server.js. */
  mainDir: string;
}

/**
 * Filesystem locations handed to child processes (D-023). Packaged builds read the plugin and
 * the DuckDB extensions from `resources\` (extraResources), because separate processes like the
 * Claude Code CLI can't read inside app.asar. mcp-server.js stays in app.asar: it runs under the
 * Electron binary in Node mode, which can.
 */
export function resolveServerPaths(
  location: AppLocation,
  exists: (path: string) => boolean = existsSync,
): ServerPaths {
  const resources = location.isPackaged
    ? location.resourcesPath
    : join(location.appPath, 'resources');
  const extensionDir = join(resources, 'duckdb-extensions');
  return {
    agentPluginDir: join(resources, 'agent-plugin'),
    userData: location.userData,
    mainDir: location.mainDir,
    // Optional: without it datadesk-mcp still runs, only Excel import is unavailable.
    extensionDir: exists(extensionDir) ? extensionDir : undefined,
  };
}

/**
 * Files an agent session can't start without. Antivirus quarantining claude.exe or a partial
 * install would otherwise surface as a cryptic spawn error.
 */
export function missingRuntimeFiles(
  files: { claudeExecutable?: string | undefined; agentPluginDir: string },
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (files.claudeExecutable !== undefined && !exists(files.claudeExecutable)) {
    return `DataDesk's Claude runtime is missing (${files.claudeExecutable}). It may have been quarantined by antivirus software; reinstall DataDesk.`;
  }
  if (!exists(join(files.agentPluginDir, '.claude-plugin', 'plugin.json'))) {
    return `DataDesk's analyst skills are missing (${files.agentPluginDir}). Reinstall DataDesk.`;
  }
  return undefined;
}
