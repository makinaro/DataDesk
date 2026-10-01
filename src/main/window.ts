import { join } from 'node:path';
import { BrowserWindow, type WebPreferences } from 'electron';

/** The only webPreferences any DataDesk window may use (CLAUDE.md, Security rule 2). */
export function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    // Dropping a file on the window would otherwise navigate to file://. Drops are handled in the DOM.
    navigateOnDragDrop: false,
    webviewTag: false,
  };
}

export function createMainWindow(rendererUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'DataDesk',
    backgroundColor: '#0e0e0e',
    webPreferences: secureWebPreferences(join(import.meta.dirname, '../preload/index.cjs')),
  });

  win.once('ready-to-show', () => {
    win.show();
  });
  void win.loadURL(rendererUrl);
  return win;
}
