import { expect, test } from './fixtures';

test('bridge exposes only whitelisted methods', async ({ page }) => {
  const shape = await page.evaluate(() => {
    const api = window.datadesk as unknown as Record<string, Record<string, unknown>>;
    return Object.fromEntries(
      Object.entries(api).map(([ns, methods]) => [ns, Object.keys(methods).sort()]),
    );
  });
  expect(shape).toEqual({
    agent: ['approve', 'onEvent', 'reset', 'send', 'stop'],
    app: ['info'],
    artifacts: ['exportChart', 'exportReport', 'getChart', 'getReport'],
    clipboard: ['writeText'],
    compare: ['onEvent', 'reset', 'run', 'stop'],
    datasets: ['list', 'pick', 'preview', 'registerFile', 'remove', 'schema'],
    secrets: ['clear', 'set', 'status'],
    settings: ['getAgent', 'getAppearance', 'setAgent', 'setAppearance'],
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

test('clipboard:writeText reaches the system clipboard', async ({ electronApp, page }) => {
  const result = await page.evaluate(() => window.datadesk.clipboard.writeText('SELECT 1;'));
  expect(result).toEqual({ ok: true, data: { ok: true } });
  expect(await electronApp.evaluate(({ clipboard }) => clipboard.readText())).toBe('SELECT 1;');
});
