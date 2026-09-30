import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }));

const { secureWebPreferences } = await import('../../src/main/window');

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
