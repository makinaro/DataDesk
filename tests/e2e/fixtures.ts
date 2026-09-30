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
  window: Page;
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
  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';
