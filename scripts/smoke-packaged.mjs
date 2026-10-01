#!/usr/bin/env node
// Smoke test for the *packaged* app (release/win-unpacked). Run `npm run package:dir` first.
//
//   npm run smoke:packaged             datasets via the packaged MCP server (offline)
//   npm run smoke:packaged -- --agent  also starts a real Claude Code session with a DUMMY key
//                                      (makes one failing 401 request to Anthropic; manual use only)
//
// Uses a throwaway profile via Chromium's --user-data-dir and aborts if that isn't honoured,
// so it never touches the real DataDesk profile.

/* global window -- page.evaluate callbacks run inside the app's renderer. */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from '@playwright/test';

const exe = resolve('release/win-unpacked/DataDesk.exe');
const withAgent = process.argv.includes('--agent');
if (!existsSync(exe)) {
  console.error(`Missing ${exe}. Run: npm run package:dir`);
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'datadesk-smoke-'));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`] });
try {
  const userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
  if (resolve(userData).toLowerCase() !== resolve(profile).toLowerCase()) {
    throw new Error(
      `--user-data-dir not honoured (userData=${userData}); aborting to protect the real profile`,
    );
  }
  check('isolated profile', true, userData);

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  check('served from app://', new URL(page.url()).protocol === 'app:', page.url());
  check('packaged', await app.evaluate(({ app: a }) => a.isPackaged));
  check(
    'no Node in renderer',
    await page.evaluate(
      () => typeof globalThis.require === 'undefined' && typeof globalThis.process === 'undefined',
    ),
  );

  // Datasets through the packaged datadesk-mcp (Electron-as-Node + unpacked DuckDB + extension).
  for (const file of ['sales.parquet', 'sales.xlsx']) {
    const path = resolve('test-data/public', file);
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [p] });
    }, path);
    const result = await page.evaluate(() => window.datadesk.datasets.pick());
    check(
      `register ${file}`,
      result.ok && result.data !== null && (result.data.rowCount ?? 0) > 0,
      result.ok
        ? `${result.data?.name} · ${String(result.data?.rowCount)} rows`
        : result.error.message,
    );
  }
  const preview = await page.evaluate(() => window.datadesk.datasets.preview('sales', 3));
  check('query via DuckDB', preview.ok && preview.data.rowCount === 3);

  if (withAgent) {
    await page.evaluate(() => {
      window.__events = [];
      window.datadesk.agent.onEvent((e) => window.__events.push(e));
    });
    await page.evaluate(() =>
      window.datadesk.secrets.set('anthropic', 'sk-ant-dummy-smoke-key-not-real'),
    );
    await page.evaluate(() => window.datadesk.agent.send('Which datasets do I have?'));
    let events = [];
    for (let i = 0; i < 90; i++) {
      events = await page.evaluate(() => window.__events);
      if (events.some((e) => e.kind === 'turn_complete' || e.kind === 'error')) break;
      await page.waitForTimeout(1000);
    }
    const session = events.find((e) => e.kind === 'session');
    check('Claude binary spawned from app.asar.unpacked', session !== undefined);
    check(
      'agent sees exactly the 8 datadesk tools',
      session?.tools.filter((t) => t.startsWith('mcp__datadesk__')).length === 8,
      session?.tools.join(', '),
    );
    check('agent has the Skill tool', session?.tools.includes('Skill') === true);
    check(
      'agent has the sub-agent tool (reported as Task)',
      session?.tools.includes('Task') === true,
    );
    const guardError = events.find(
      (e) => e.kind === 'error' && e.message.startsWith('Stopped for safety'),
    );
    check(
      'init guard passed (our plugin, skills and exactly our 3 sub-agents)',
      session !== undefined && guardError === undefined,
      guardError?.message,
    );
    check(
      'datadesk MCP server connected for the agent',
      session?.mcpServers.some((s) => s.name === 'datadesk' && s.status === 'connected') === true,
    );
    const error = events.find((e) => e.kind === 'error');
    check(
      'dummy key rejected with a readable error',
      /401|authenticate/i.test(error?.message ?? ''),
      error?.message,
    );
  }
} catch (error) {
  check('smoke run', false, String(error));
} finally {
  await app.close().catch(() => undefined);
  rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${String(results.length - failed)}/${String(results.length)} checks passed`);
process.exit(failed === 0 ? 0 : 1);
