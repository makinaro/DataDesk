import { expect, test } from './fixtures';

const width = (el: Element) => el.getBoundingClientRect().width;

test('panels resize by mouse drag and keyboard, and keep their size after a reload', async ({
  page,
}) => {
  const sidebar = page.getByRole('region', { name: 'Datasets' });
  const handle = page.getByRole('separator', { name: 'Resize datasets' });
  const start = await sidebar.evaluate(width);

  const box = await handle.boundingBox();
  if (!box) throw new Error('splitter not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => sidebar.evaluate(width)).toBeCloseTo(start + 60, 0);

  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => sidebar.evaluate(width)).toBeCloseTo(start + 36, 0);

  await page.reload();
  await expect
    .poll(() => page.getByRole('region', { name: 'Datasets' }).evaluate(width))
    .toBeCloseTo(start + 36, 0);
});

test('every theme and both layouts render with zero CSP violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await page.reload();

  const region = (name: string) => page.getByRole('region', { name });
  const after = (a: string, b: string) =>
    page.evaluate(
      ([first, second]) => {
        const find = (n: string) => document.querySelector(`section[aria-label="${n}"]`);
        const x = find(first);
        const y = find(second);
        return !!x && !!y && !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
      },
      [a, b] as const,
    );

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  for (const theme of ['Light', 'Slate', 'System', 'Dark']) {
    await page.getByRole('radio', { name: new RegExp(`^${theme}`) }).check({ force: true });
    await expect(page.getByRole('radio', { name: new RegExp(`^${theme}`) })).toBeChecked();
  }
  await page.getByRole('radio', { name: /Chat-first/ }).check({ force: true });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(region('Agent timeline')).toBeVisible();
  expect(await after('Chat', 'Charts & report')).toBe(true);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await page.getByRole('radio', { name: /Results-first/ }).check({ force: true });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(region('Chat')).toBeVisible();
  expect(await after('Charts & report', 'Chat')).toBe(true);

  expect(violations).toEqual([]);
});

test('the window itself never scrolls, however long the conversation gets', async ({
  electronApp,
  page,
}) => {
  // Regression: each message's screen-reader label (sr-only, position: absolute) escaped the
  // chat's scroll box and stretched the document, so the whole page, title bar and all, scrolled.
  let seq = 1000;
  for (let i = 0; i < 25; i++) {
    await electronApp.evaluate(
      ({ BrowserWindow }, payload) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('agent:event', payload);
      },
      {
        kind: 'assistant_message',
        messageId: `m${String(i)}`,
        text: `Answer ${String(i)}\n\n- a\n- b\n- c`,
        parentToolUseId: null,
        seq: seq++,
        at: Date.now(),
      },
    );
  }
  await expect(page.getByText('Answer 24')).toBeAttached();
  const size = () =>
    page.evaluate(() => {
      const doc = document.scrollingElement;
      return { scroll: doc?.scrollHeight, client: doc?.clientHeight, top: doc?.scrollTop };
    });
  const before = await size();
  expect(before.scroll).toBe(before.client);

  await page.mouse.move(600, 300);
  await page.mouse.wheel(0, 3000);
  await expect.poll(async () => (await size()).top).toBe(0);
  await expect(page.getByRole('heading', { name: 'DataDesk' })).toBeInViewport();
  // The chat itself still scrolls.
  await expect(page.getByText('Answer 0')).not.toBeInViewport();
});
