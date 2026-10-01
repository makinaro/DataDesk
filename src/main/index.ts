import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
import { IpcEvents } from '../shared/ipc/channels';
import { createAgentRuntime } from './agent/agentRuntime';
import { ArtifactStore } from '../node-shared/artifactStore';
import { printHtmlToPdf } from './artifacts/printPdf';
import { renderChartSvg } from './artifacts/chartSvg';
import { registerAgentHandlers } from './ipc/handlers/agent';
import { registerArtifactHandlers } from './ipc/handlers/artifacts';
import { registerAppHandlers } from './ipc/handlers/app';
import { registerDatasetHandlers } from './ipc/handlers/datasets';
import { registerSecretsHandlers } from './ipc/handlers/secrets';
import { createIpcRouter } from './ipc/router';
import { createSenderCheck } from './ipc/trustedSender';
import { createStdioTransport } from './mcp/serverProcess';
import { UiMcpClient } from './mcp/uiClient';
import { serverPaths } from './paths';
import { KeyStore } from './secrets/keyStore';
import { SettingsStore } from './settings/settingsStore';
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
      const paths = serverPaths();
      const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
      const agent = createAgentRuntime({
        keyStore,
        settings,
        paths,
        app: {
          isPackaged: app.isPackaged,
          version: app.getVersion(),
          resourcesPath: process.resourcesPath,
        },
        // Only our own windows receive agent events.
        deliver: (event) => {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IpcEvents.agentEvent, event);
          }
        },
        log: (message, detail) => {
          console.error(`[agent] ${message}`, detail ?? '');
        },
      });
      registerSecretsHandlers(handle, keyStore, async (provider) => {
        // Both keys shape the session (the OpenAI key adds tools), so either change resets it.
        if (provider === 'anthropic' || provider === 'openai') await agent.onKeyChanged();
      });
      registerArtifactHandlers(handle, {
        store: new ArtifactStore(join(app.getPath('userData'), 'artifacts')),
        pickSavePath: async (defaultName, format) => {
          const options: Electron.SaveDialogOptions = {
            title: 'Export report',
            defaultPath: defaultName,
            filters:
              format === 'pdf'
                ? [{ name: 'PDF', extensions: ['pdf'] }]
                : [{ name: 'Markdown', extensions: ['md'] }],
          };
          const owner = BrowserWindow.getFocusedWindow();
          const result = owner
            ? await dialog.showSaveDialog(owner, options)
            : await dialog.showSaveDialog(options);
          return result.canceled || !result.filePath ? null : result.filePath;
        },
        printToPdf: printHtmlToPdf,
        renderSvg: renderChartSvg,
      });
      registerAgentHandlers(handle, {
        getOrchestrator: () => agent.get(),
        currentOrchestrator: () => agent.current(),
        approvals: agent.approvals,
        settings,
      });
      const uiClient = new UiMcpClient({
        createTransport: () =>
          createStdioTransport(paths, (line) => {
            console.error(line);
          }),
        log: (message) => {
          console.error(`[ui-mcp] ${message}`);
        },
      });
      registerDatasetHandlers(handle, {
        client: uiClient,
        pickFile: async () => {
          const owner = BrowserWindow.getFocusedWindow();
          const options: Electron.OpenDialogOptions = {
            title: 'Add a dataset',
            properties: ['openFile'],
            filters: [
              {
                name: 'Data files',
                extensions: ['csv', 'tsv', 'parquet', 'json', 'jsonl', 'ndjson', 'xlsx'],
              },
            ],
          };
          const result = owner
            ? await dialog.showOpenDialog(owner, options)
            : await dialog.showOpenDialog(options);
          return result.canceled ? null : (result.filePaths[0] ?? null);
        },
      });
      app.on('will-quit', () => {
        uiClient.close().catch((error: unknown) => {
          console.error('[ui-mcp] close failed', error);
        });
        agent.dispose().catch((error: unknown) => {
          console.error('[agent] dispose failed', error);
        });
      });

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
