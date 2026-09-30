import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { registerAppHandlers } from './ipc/handlers/app';
import { registerSecretsHandlers } from './ipc/handlers/secrets';
import { createIpcRouter } from './ipc/router';
import { createSenderCheck } from './ipc/trustedSender';
import { KeyStore } from './secrets/keyStore';
import {
  APP_ENTRY_URL,
  APP_ORIGIN,
  handleAppProtocol,
  registerAppScheme,
} from './security/appProtocol';
import { buildCsp } from './security/csp';
import { applyDevCspHeader, hardenApp } from './security/hardenApp';
import { createMainWindow } from './window';

// Lets e2e tests run against a throwaway profile. Dev/test builds only; must run before 'ready'.
const userDataOverride = !app.isPackaged ? process.env.DATADESK_USER_DATA : undefined;
if (userDataOverride) app.setPath('userData', userDataOverride);

// One instance per profile: two instances would each cache secrets.json and overwrite each other.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function start(): void {
  const devServerUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  const rendererUrl = devServerUrl ?? APP_ENTRY_URL;
  const rendererOrigin = devServerUrl ? new URL(devServerUrl).origin : APP_ORIGIN;

  registerAppScheme();

  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app
    .whenReady()
    .then(() => {
      hardenApp(rendererOrigin);

      if (devServerUrl) {
        applyDevCspHeader(buildCsp({ kind: 'development', devServerUrl }));
      } else {
        handleAppProtocol(
          join(import.meta.dirname, '../renderer'),
          buildCsp({ kind: 'production' }),
        );
      }

      const handle = createIpcRouter({
        ipcMain,
        isTrustedSender: createSenderCheck(rendererOrigin),
        logError: (message, detail) => {
          console.error(`[ipc] ${message}`, detail ?? '');
        },
      });
      registerAppHandlers(handle);

      const keyStore = new KeyStore(
        join(app.getPath('userData'), 'secrets.json'),
        safeStorage,
        () => {
          console.error('[secrets] secrets.json was unreadable; treating it as empty.');
        },
      );
      registerSecretsHandlers(handle, keyStore);

      createMainWindow(rendererUrl);
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow(rendererUrl);
      });
    })
    .catch((error: unknown) => {
      // Don't leave a windowless process running if startup fails.
      console.error('[main] startup failed', error);
      app.quit();
    });
}
