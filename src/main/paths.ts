import { app } from 'electron';
import type { ServerPaths } from './mcp/serverProcess';
import { resolveServerPaths } from './resourcePaths';

/** Filesystem locations the main process hands to child processes. */
export function serverPaths(): ServerPaths {
  return resolveServerPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
    mainDir: import.meta.dirname,
  });
}
