import { expect, test } from './fixtures';

test('no menu bar; the page draws the title bar beside native window controls', async ({
  electronApp,
  page,
}) => {
  const menu = await electronApp.evaluate(({ Menu }) => Menu.getApplicationMenu());
  expect(menu).toBeNull();

  // Chromium's Window Controls Overlay API reports the native controls Electron draws.
  const overlay = await page.evaluate(() => {
    const wco = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean } })
      .windowControlsOverlay;
    return wco?.visible ?? null;
  });
  expect(overlay).toBe(true);

  const titleBar = page.getByRole('banner');
  await expect(titleBar.getByRole('heading', { name: 'DataDesk' })).toBeVisible();
  const regions = await titleBar.evaluate((bar) => ({
    bar: getComputedStyle(bar).getPropertyValue('app-region'),
    button: getComputedStyle(bar.querySelector('button') ?? bar).getPropertyValue('app-region'),
  }));
  expect(regions).toEqual({ bar: 'drag', button: 'no-drag' });
});

test('text fields keep copy and paste without an application menu', async ({ page }) => {
  const box = page.getByLabel('Message');
  await box.fill('units by region');
  await box.press('Control+a');
  await box.press('Control+x');
  await expect(box).toHaveValue('');
  await box.press('Control+v');
  await expect(box).toHaveValue('units by region');
});

// Playwright's key presses are injected into the page, below before-input-event, so this sends
// native key events from main, the way a real keyboard arrives.
test('Ctrl+= and Ctrl+0 still zoom the page', async ({ electronApp, page }) => {
  await page.getByLabel('Message').focus();
  const press = (keyCode: string) =>
    electronApp.evaluate(({ BrowserWindow }, code) => {
      BrowserWindow.getAllWindows()[0]?.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: code,
        modifiers: ['control'],
      });
    }, keyCode);
  const zoom = () =>
    electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.getZoomLevel(),
    );
  await press('=');
  await expect.poll(zoom).toBe(0.5);
  await press('0');
  await expect.poll(zoom).toBe(0);
});
