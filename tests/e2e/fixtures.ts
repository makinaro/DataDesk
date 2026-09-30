import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

interface AppFixtures {
  electronApp: ElectronApplication;
  page: Page;
}

/** Launches the built app (out/) with a throwaway userData dir, so tests never touch real keys. */
export const test = base.extend<AppFixtures>({
  // Playwright requires an object pattern for the first fixture argument, even when unused.
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const userData = mkdtempSync(join(tmpdir(), 'datadesk-e2e-'));
    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env, DATADESK_USER_DATA: userData, NODE_ENV: 'production' },
    });
    await use(app);
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  },
  page: async ({ electronApp }, use) => {
    const firstWindow = await electronApp.firstWindow();
    await firstWindow.waitForLoadState('domcontentloaded');
    await use(firstWindow);
  },
});

export { expect } from '@playwright/test';
