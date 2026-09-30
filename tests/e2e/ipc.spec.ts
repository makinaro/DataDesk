import { expect, test } from './fixtures';

test('bridge exposes only whitelisted methods', async ({ page }) => {
  const shape = await page.evaluate(() => {
    const api = window.datadesk as unknown as Record<string, Record<string, unknown>>;
    return Object.fromEntries(
      Object.entries(api).map(([ns, methods]) => [ns, Object.keys(methods).sort()]),
    );
  });
  expect(shape).toEqual({
    app: ['info'],
    datasets: ['list', 'pick', 'preview', 'registerFile', 'schema'],
    secrets: ['clear', 'set', 'status'],
  });
});

test('app:info round-trips through the validated IPC router', async ({ page }) => {
  const result = await page.evaluate(() => window.datadesk.app.info());
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.data.versions.electron).toMatch(/^\d+\./);
    expect(result.data.platform).toBe(process.platform);
  }
});
