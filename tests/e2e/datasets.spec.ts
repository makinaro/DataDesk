import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from './fixtures';

let dataDir: string;
test.beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'datadesk-e2e-data-'));
  copyFileSync(resolve('test-data/public/sales.csv'), join(dataDir, 'sales.csv'));
});
test.afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('Add file… registers a CSV through the real MCP server and shows schema + preview', async ({
  electronApp,
  page,
}) => {
  // Only the OS dialog is stubbed; everything else (IPC, UiMcpClient, spawned datadesk-mcp,
  // DuckDB) is real.
  const csv = join(dataDir, 'sales.csv');
  await electronApp.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [filePath] });
  }, csv);

  await page.getByRole('button', { name: 'Add file…' }).click();

  const list = page.getByRole('list', { name: 'Registered datasets' });
  await expect(list.getByText('sales', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(list.getByText(/CSV · 60 rows · 7 cols/)).toBeVisible();

  const columns = page.getByRole('list', { name: 'Columns of sales' });
  await expect(columns.getByText('order_date')).toBeVisible();
  await expect(columns.getByText('DATE', { exact: true })).toBeVisible();

  const preview = page.getByRole('table', { name: 'Preview of sales' });
  await expect(preview.locator('tbody tr')).toHaveCount(20);
  await expect(preview.getByText('Doohickey, Deluxe').first()).toBeVisible();
});

test('registered datasets are written to the catalog in userData', async ({
  electronApp,
  page,
}) => {
  const csv = join(dataDir, 'sales.csv');
  await electronApp.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [filePath] });
  }, csv);
  await page.getByRole('button', { name: 'Add file…' }).click();
  await expect(page.getByText(/CSV · 60 rows/)).toBeVisible({ timeout: 20_000 });

  const list = await page.evaluate(() => window.datadesk.datasets.list());
  expect(list).toMatchObject({ ok: true, data: [{ name: 'sales', rowCount: 60 }] });

  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  const catalog = JSON.parse(readFileSync(join(userData, 'catalog.json'), 'utf8')) as {
    datasets: { name: string; path: string }[];
  };
  // The catalog stores the real path (e.g. 8.3 short names expanded).
  expect(catalog.datasets).toEqual([
    // .native expands 8.3 short names (CI temp dirs), matching the server's realpath.
    expect.objectContaining({ name: 'sales', path: realpathSync.native(csv) }),
  ]);
});

test('files constructed by page script cannot be registered (no filesystem path)', async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.datadesk.datasets.registerFile(new File(['a,b\n1,2\n'], 'C:/Windows/win.ini')),
  );
  expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
});

test('unsupported files are refused with a clear reason', async ({ electronApp, page }) => {
  await electronApp.evaluate(
    ({ dialog }, filePath) => {
      dialog.showOpenDialog = () =>
        Promise.resolve({
          canceled: false,
          filePaths: [filePath],
        });
    },
    resolve('package.json').replace(/json$/, 'lock'),
  );
  await page.getByRole('button', { name: 'Add file…' }).click();
  await expect(page.getByRole('alert')).toContainText(/Unsupported file type/, {
    timeout: 20_000,
  });
});
