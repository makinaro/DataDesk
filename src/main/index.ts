import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { registerAppHandlers } from './ipc/handlers/app';
import { createIpcRouter } from './ipc/router';
import { createSenderCheck } from './ipc/trustedSender';
import {
  APP_ENTRY_URL,
  APP_ORIGIN,
  handleAppProtocol,
  registerAppScheme,
} from './security/appProtocol';
import { buildCsp } from './security/csp';
import { applyDevCspHeader, hardenApp } from './security/hardenApp';
import { createMainWindow } from './window';

// Lets e2e tests run against a throwaway profile. Must run before 'ready'.
const userDataOverride = process.env.DATADESK_USER_DATA;
if (userDataOverride) app.setPath('userData', userDataOverride);

const devServerUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const rendererUrl = devServerUrl ?? APP_ENTRY_URL;
const rendererOrigin = devServerUrl ? new URL(devServerUrl).origin : APP_ORIGIN;

registerAppScheme();

void app.whenReady().then(() => {
  hardenApp(rendererOrigin);

  if (devServerUrl) {
    applyDevCspHeader(buildCsp({ kind: 'development', devServerUrl }));
  } else {
    handleAppProtocol(join(import.meta.dirname, '../renderer'), buildCsp({ kind: 'production' }));
  }

  const handle = createIpcRouter({
    ipcMain,
    isTrustedSender: createSenderCheck(rendererOrigin),
    logError: (message, detail) => {
      console.error(`[ipc] ${message}`, detail ?? '');
    },
  });
  registerAppHandlers(handle);

  createMainWindow(rendererUrl);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(rendererUrl);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
