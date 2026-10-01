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
