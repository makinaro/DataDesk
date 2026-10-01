import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  safeStorage,
} from 'electron';
import { IpcEvents } from '../shared/ipc/channels';
import { createAgentRuntime } from './agent/agentRuntime';
import { applyTheme, chromeFor } from './appearance';
import { createCompareRuntime } from './agent/compareRuntime';
import { ArtifactStore } from '../node-shared/artifactStore';
import { printHtmlToPdf } from './artifacts/printPdf';
import { renderChartSvg } from './artifacts/chartSvg';
import { registerAgentHandlers } from './ipc/handlers/agent';
import { registerAppearanceHandlers } from './ipc/handlers/appearance';
import { registerArtifactHandlers } from './ipc/handlers/artifacts';
import { registerClipboardHandlers } from './ipc/handlers/clipboard';
import { registerCompareHandlers } from './ipc/handlers/compare';
import { registerAppHandlers } from './ipc/handlers/app';
import { registerDatasetHandlers } from './ipc/handlers/datasets';
import { registerSecretsHandlers } from './ipc/handlers/secrets';
import { createIpcRouter } from './ipc/router';
import { createSenderCheck } from './ipc/trustedSender';
import { createStdioTransport } from './mcp/serverProcess';
import { UiMcpClient } from './mcp/uiClient';
import { serverPaths } from './paths';
import { KeyStore } from './secrets/keyStore';
import { AppearanceStore } from './settings/appearanceStore';
import { SettingsStore } from './settings/settingsStore';
import {
  APP_ENTRY_URL,
  APP_ORIGIN,
  handleAppProtocol,
  registerAppScheme,
} from './security/appProtocol';
import { buildCsp } from './security/csp';
import { applyDevCspHeader, hardenApp } from './security/hardenApp';
import { createMainWindow, paintWindow } from './window';

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
    .then(async () => {
      hardenApp(rendererOrigin);
      // No File/Edit/View menu: the page draws the title bar (D-025). Its shortcuts that still
      // matter are handled per window in createMainWindow.
      Menu.setApplicationMenu(null);

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
      registerClipboardHandlers(handle, clipboard);

      const appearanceStore = new AppearanceStore(join(app.getPath('userData'), 'appearance.json'));
      let theme = (await appearanceStore.get()).theme;
      const paintAll = (chrome: ReturnType<typeof chromeFor>) => {
        for (const win of BrowserWindow.getAllWindows()) paintWindow(win, chrome);
      };
      applyTheme(theme, { nativeTheme, paint: paintAll });
      // Fires when the OS theme changes, which matters while the theme is "system".
      nativeTheme.on('updated', () => {
        paintAll(chromeFor(theme, nativeTheme.shouldUseDarkColors));
      });
      registerAppearanceHandlers(handle, {
        store: appearanceStore,
        onChanged: (appearance) => {
          theme = appearance.theme;
          applyTheme(theme, { nativeTheme, paint: paintAll });
        },
      });

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
      const compare = createCompareRuntime({
        keyStore,
        settings,
        paths,
        app: {
          isPackaged: app.isPackaged,
          version: app.getVersion(),
          resourcesPath: process.resourcesPath,
        },
        deliver: (event) => {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IpcEvents.compareEvent, event);
          }
        },
        log: (message, detail) => {
          console.error(`[compare] ${message}`, detail ?? '');
        },
      });
      // Every key shapes the session (OpenAI and Hugging Face add tools), so any change resets it.
      registerSecretsHandlers(handle, keyStore, async () => {
        await Promise.all([agent.onKeyChanged(), compare.onKeyChanged()]);
      });
      registerCompareHandlers(handle, compare);
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
        onSettingsChanged: async () => {
          await Promise.all([agent.onSettingsChanged(), compare.onSettingsChanged()]);
        },
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
        compare.dispose().catch((error: unknown) => {
          console.error('[compare] dispose failed', error);
        });
      });

      const openWindow = () =>
        createMainWindow(rendererUrl, chromeFor(theme, nativeTheme.shouldUseDarkColors), {
          dev: !app.isPackaged,
        });
      openWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) openWindow();
      });
    })
    .catch((error: unknown) => {
      // Don't leave a windowless process running if startup fails.
      console.error('[main] startup failed', error);
      app.quit();
    });
}
