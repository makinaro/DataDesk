import { expect, test } from './fixtures';

test('app launches and renders the shell', async ({ page }) => {
  await expect(page).toHaveTitle('DataDesk');
  await expect(page.getByRole('heading', { name: 'DataDesk' })).toBeVisible();
});

test('uses the isolated userData directory from DATADESK_USER_DATA', async ({ electronApp }) => {
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  expect(userData).toContain('datadesk-e2e-');
});
