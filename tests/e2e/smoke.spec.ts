import { expect, test } from './fixtures';

test('app launches and renders the shell', async ({ window }) => {
  await expect(window).toHaveTitle('DataDesk');
  await expect(window.getByRole('heading', { name: 'DataDesk' })).toBeVisible();
});

test('uses the isolated userData directory from DATADESK_USER_DATA', async ({ electronApp }) => {
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  expect(userData).toContain('datadesk-e2e-');
});
