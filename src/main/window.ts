import { join } from 'node:path';
import { BrowserWindow, type BrowserWindowConstructorOptions, type WebPreferences } from 'electron';
import type { WindowChrome } from './appearance';
import { runShortcut, shortcutFor } from './shortcuts';

/** Height of the page's title bar, which the native window controls must match. */
export const TITLE_BAR_HEIGHT = 40;

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

/**
 * The page draws the title bar; Windows keeps drawing the minimize/maximize/close buttons
 * (titleBarOverlay) in the theme's colours. The overlay only exists with titleBarStyle 'hidden'.
 */
export function mainWindowOptions(
  preloadPath: string,
  chrome: WindowChrome,
): BrowserWindowConstructorOptions {
  return {
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'DataDesk',
    backgroundColor: chrome.canvas,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: chrome.titleBar,
      symbolColor: chrome.symbols,
      height: TITLE_BAR_HEIGHT,
    },
    webPreferences: secureWebPreferences(preloadPath),
  };
}

export function createMainWindow(
  rendererUrl: string,
  chrome: WindowChrome,
  { dev }: { dev: boolean },
): BrowserWindow {
  const win = new BrowserWindow(
    mainWindowOptions(join(import.meta.dirname, '../preload/index.cjs'), chrome),
  );

  win.webContents.on('before-input-event', (event, input) => {
    const action = shortcutFor(input, { dev });
    if (!action) return;
    event.preventDefault();
    runShortcut(action, win.webContents);
  });
  win.once('ready-to-show', () => {
    win.show();
  });
  void win.loadURL(rendererUrl);
  return win;
}

/** Repaints the colours main owns when the theme changes. */
export function paintWindow(win: BrowserWindow, chrome: WindowChrome): void {
  win.setBackgroundColor(chrome.canvas);
  win.setTitleBarOverlay({ color: chrome.titleBar, symbolColor: chrome.symbols });
}
