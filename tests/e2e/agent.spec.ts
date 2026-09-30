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
  const saved = await page.evaluate(() =>
    window.datadesk.settings.setAgent({ model: 'haiku', maxBudgetUsd: 0.5, maxTurns: 8 }),
  );
  expect(saved).toEqual({ ok: true, data: { model: 'haiku', maxBudgetUsd: 0.5, maxTurns: 8 } });
  const invalid = await page.evaluate(() =>
    window.datadesk.settings.setAgent({ model: 'haiku', maxBudgetUsd: 999, maxTurns: 8 }),
  );
  expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  await expect
    .poll(() => page.evaluate(() => window.datadesk.settings.getAgent()))
    .toEqual({ ok: true, data: { model: 'haiku', maxBudgetUsd: 0.5, maxTurns: 8 } });
});

test('approving an unknown request is a no-op', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.datadesk.agent.approve('11111111-1111-4111-8111-111111111111', true),
  );
  expect(result).toEqual({ ok: true, data: { found: false } });
});
