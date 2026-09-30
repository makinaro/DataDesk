import { expect, test } from './fixtures';

interface EffectivePrefs {
  contextIsolation?: boolean;
  nodeIntegration?: boolean;
  sandbox?: boolean;
  webSecurity?: boolean;
}

test('window runs with hardened webPreferences', async ({ electronApp, page }) => {
  await page.waitForLoadState('domcontentloaded');
  const prefs = await electronApp.evaluate(({ BrowserWindow }) => {
    // getLastWebPreferences() is untyped but is the only way to read the *effective* prefs.
    // If Electron removes it, this test fails loudly instead of passing vacuously.
    const contents = BrowserWindow.getAllWindows()[0]?.webContents as unknown as {
      getLastWebPreferences: () => EffectivePrefs;
    };
    const p = contents.getLastWebPreferences();
    return {
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      sandbox: p.sandbox,
      webSecurity: p.webSecurity,
    };
  });
  expect(prefs).toEqual({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  });
});

test('renderer has no Node.js globals', async ({ page }) => {
  const globals = await page.evaluate(() => {
    const g = globalThis as Record<string, unknown>;
    return { require: typeof g.require, process: typeof g.process, module: typeof g.module };
  });
  expect(globals).toEqual({ require: 'undefined', process: 'undefined', module: 'undefined' });
});

test('renderer is served from app:// with the production CSP header', async ({ page }) => {
  expect(new URL(page.url()).protocol).toBe('app:');
  const csp = await page.evaluate(async () => {
    const res = await fetch('app://datadesk/index.html');
    return res.headers.get('content-security-policy');
  });
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
});

test('missing app:// files return a 404 that still carries the CSP', async ({ page }) => {
  const res = await page.evaluate(async () => {
    const r = await fetch('app://datadesk/does-not-exist.js');
    return { status: r.status, csp: r.headers.get('content-security-policy') };
  });
  expect(res.status).toBe(404);
  expect(res.csp).toContain("default-src 'none'");
});

test('CSP blocks inline scripts injected into the DOM', async ({ page }) => {
  // Playwright's evaluate runs via DevTools (which bypasses CSP), so instead we inject a real
  // <script> element and check that the page refused to run it.
  const result = await page.evaluate(async () => {
    const g = globalThis as unknown as { __inlineRan?: boolean };
    const violation = new Promise<string>((resolve) => {
      document.addEventListener(
        'securitypolicyviolation',
        (e: SecurityPolicyViolationEvent) => {
          resolve(e.violatedDirective);
        },
        { once: true },
      );
    });
    const script = document.createElement('script');
    script.textContent = 'globalThis.__inlineRan = true;';
    document.head.appendChild(script);
    return { ran: g.__inlineRan === true, directive: await violation };
  });
  expect(result.ran).toBe(false);
  expect(result.directive).toMatch(/^script-src/);
});

test('window.open and navigation away from the app are denied', async ({ electronApp, page }) => {
  const openedNothing = await page.evaluate(() => window.open('https://example.com') === null);
  expect(openedNothing).toBe(true);

  await page.evaluate(() => {
    window.location.href = 'https://example.com';
  });
  await page.waitForTimeout(500);
  expect(new URL(page.url()).protocol).toBe('app:');
  expect(electronApp.windows()).toHaveLength(1);
});
