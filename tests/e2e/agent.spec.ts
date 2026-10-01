import { expect, test } from './fixtures';

// No network in automated tests: these only exercise paths that never reach Anthropic.

test('chat explains that an Anthropic key is needed before the analyst can start', async ({
  page,
}) => {
  await page.getByLabel('Message').fill('Which region sold the most?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('alert')).toContainText('Add your Anthropic API key');
  // The user's message is still shown in the conversation.
  await expect(
    page.getByRole('list', { name: 'Conversation' }).getByText('Which region sold the most?'),
  ).toBeVisible();
});

test('analyst settings persist and are validated by main', async ({ page }) => {
  const settings = {
    provider: 'openai' as const,
    model: 'haiku',
    openaiModel: 'gpt-5.4' as const,
    maxBudgetUsd: 0.5,
    maxTurns: 8,
  };
  const saved = await page.evaluate((s) => window.datadesk.settings.setAgent(s), settings);
  expect(saved).toEqual({ ok: true, data: settings });
  const invalid = await page.evaluate(
    (s) => window.datadesk.settings.setAgent({ ...s, maxBudgetUsd: 999 }),
    settings,
  );
  expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  const unknownModel = await page.evaluate(
    (s) => window.datadesk.settings.setAgent({ ...s, openaiModel: 'gpt-4o' as 'gpt-5.4' }),
    settings,
  );
  expect(unknownModel).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  await expect
    .poll(() => page.evaluate(() => window.datadesk.settings.getAgent()))
    .toEqual({ ok: true, data: settings });
});

test('approving an unknown request is a no-op', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.datadesk.agent.approve('11111111-1111-4111-8111-111111111111', true),
  );
  expect(result).toEqual({ ok: true, data: { found: false } });
});

test('compare mode explains that it needs both keys, and the chat comes back', async ({ page }) => {
  await page.getByRole('button', { name: 'Compare' }).click();
  await page.getByLabel('Question to compare').fill('Which region sold the most?');
  await page
    .getByRole('region', { name: 'Compare providers' })
    .getByRole('button', { name: 'Compare' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'needs both an Anthropic and an OpenAI API key',
  );
  await page.getByRole('button', { name: 'Compare', pressed: true }).click();
  await expect(page.getByLabel('Message')).toBeVisible();
});
