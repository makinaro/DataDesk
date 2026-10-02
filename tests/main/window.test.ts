import { describe, expect, it, vi } from 'vitest';
import { THEME_CHROME } from '../../src/shared/appearance';

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }));

const { mainWindowOptions, secureWebPreferences } = await import('../../src/main/window');

describe('secureWebPreferences', () => {
  it('enforces the CLAUDE.md security baseline', () => {
    expect(secureWebPreferences('/preload.cjs')).toMatchObject({
      preload: '/preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
    });
  });
});

describe('mainWindowOptions', () => {
  const chrome = THEME_CHROME.light;

  it('hides the native title bar but keeps native window controls in the theme colours', () => {
    expect(mainWindowOptions('/preload.cjs', chrome)).toMatchObject({
      backgroundColor: chrome.canvas,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: chrome.titleBar, symbolColor: chrome.symbols, height: 40 },
    });
  });

  it('keeps the hardened webPreferences', () => {
    expect(mainWindowOptions('/preload.cjs', chrome).webPreferences).toEqual(
      secureWebPreferences('/preload.cjs'),
    );
  });
});
