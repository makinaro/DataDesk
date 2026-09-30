import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';

const KEY = 'sk-ant-e2e-test-key-not-real-0001';

test('keys can be set and cleared; status is booleans only; disk is encrypted', async ({
  electronApp,
  page,
}) => {
  const set = await page.evaluate((key) => window.datadesk.secrets.set('anthropic', key), KEY);
  expect(set).toEqual({ ok: true, data: { anthropic: true, openai: false, huggingface: false } });

  const status = await page.evaluate(() => window.datadesk.secrets.status());
  expect(JSON.stringify(status)).not.toContain(KEY);

  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  const onDisk = readFileSync(join(userData, 'secrets.json'), 'utf8');
  expect(onDisk).not.toContain(KEY);

  const cleared = await page.evaluate(() => window.datadesk.secrets.clear('anthropic'));
  expect(cleared).toEqual({
    ok: true,
    data: { anthropic: false, openai: false, huggingface: false },
  });
});

test('malformed requests from the renderer are rejected by main', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.datadesk.secrets.set('not-a-provider' as 'openai', 'x'),
  );
  expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
});

test('Settings dialog shows status and clears the input on save', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const input = page.getByLabel('OpenAI', { exact: true });
  await input.fill(KEY);
  await page.getByRole('button', { name: 'Save OpenAI key' }).click();
  await expect(page.getByTestId('status-openai')).toHaveText('Set');
  await expect(input).toHaveValue('');
  expect(await page.content()).not.toContain(KEY);
});
