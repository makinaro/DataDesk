#!/usr/bin/env node
// Smoke test for the *packaged* app (release/win-unpacked). Run `npm run package:dir` first.
//
//   npm run smoke:packaged             datasets via the packaged MCP server (offline)
//   npm run smoke:packaged -- --agent  also starts a real Claude Code session with a DUMMY key
//                                      (makes one failing 401 request to Anthropic; manual use only)
//   npm run smoke:packaged -- --agent --openai
//                                      also sets a DUMMY OpenAI key: the agent's datadesk-mcp must
//                                      offer the 2 OpenAI tools (listed only, never called; D-018)
//   npm run smoke:packaged -- --agent --hf
//                                      also sets a DUMMY Hugging Face token: main's tool discovery
//                                      gets a 401 from huggingface.co/mcp, so the session must start
//                                      without the hf server and say so (D-019)
//   npm run smoke:packaged -- --openai-agent
//                                      runs the analyst on the OpenAI provider with a DUMMY key:
//                                      datadesk-mcp over the SDK's MCPServerStdio must connect, then
//                                      one request to OpenAI fails with 401 (D-021; manual use only)
//   npm run smoke:packaged -- --installer [other flags]
//                                      instead of release/win-unpacked, silently installs
//                                      release/DataDesk-Setup-<version>-x64.exe (npm run package)
//                                      into a temp folder with a space in its path, runs the same
//                                      checks against the installed app, then uninstalls it and
//                                      checks nothing is left (D-023). The per-user install
//                                      briefly adds Start-menu/desktop shortcuts and an HKCU
//                                      uninstall entry; the uninstaller removes them.
//
// Uses a throwaway profile via Chromium's --user-data-dir and aborts if that isn't honoured,
// so it never touches the real DataDesk profile.

/* global window -- page.evaluate callbacks run inside the app's renderer. */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from '@playwright/test';

const withInstaller = process.argv.includes('--installer');
const withAgent = process.argv.includes('--agent');
const withOpenAI = process.argv.includes('--openai');
const withHf = process.argv.includes('--hf');
const withOpenAIAgent = process.argv.includes('--openai-agent');
const expectedDatadeskTools = withOpenAI ? 10 : 8;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const installer = resolve(`release/DataDesk-Setup-${version}-x64.exe`);
const startMenuShortcut = join(
  process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
  'Microsoft/Windows/Start Menu/Programs/DataDesk.lnk',
);
const desktopShortcut = join(homedir(), 'Desktop', 'DataDesk.lnk');
// electron-builder's installer copies itself here; build/installer.nsh removes it (D-023).
const updaterCache = join(
  process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
  'datadesk-updater',
);

/** Whether Windows lists DataDesk as installed for this user (HKCU uninstall entry). */
function uninstallEntryExists() {
  const query = spawnSync('reg', [
    'query',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    '/s',
    '/f',
    'DataDesk',
    '/d',
  ]);
  return query.status === 0;
}

/**
 * NSIS wants `/D=<dir>` last and unquoted, so the arguments are passed verbatim (no cmd.exe:
 * characters like & or % in a path must not be interpreted).
 */
function runNsis(file, args) {
  return spawnSync(file, args, { windowsVerbatimArguments: true, timeout: 300_000 });
}

/** Installs silently and checks the layout; returns the installed exe. */
function install(installDir) {
  const started = Date.now();
  const run = runNsis(installer, ['/S', `/D=${installDir}`]);
  check(
    'installer ran silently',
    run.status === 0,
    `${String(Math.round((Date.now() - started) / 1000))} s, exit ${String(run.status)}`,
  );
  for (const [name, path] of [
    ['app', 'DataDesk.exe'],
    ['uninstaller', 'Uninstall DataDesk.exe'],
    ['skills plugin', 'resources/agent-plugin/.claude-plugin/plugin.json'],
    ['DuckDB extensions', 'resources/duckdb-extensions'],
    [
      'Claude binary (unpacked)',
      'resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
    ],
    ['DuckDB binding (unpacked)', 'resources/app.asar.unpacked/node_modules/@duckdb'],
  ]) {
    check(`installed: ${name}`, existsSync(join(installDir, path)));
  }
  check('installed: Start-menu shortcut', existsSync(startMenuShortcut));
  check('installed: uninstall entry', uninstallEntryExists());
  check('no leftover installer copy (datadesk-updater)', !existsSync(updaterCache));
  return join(installDir, 'DataDesk.exe');
}

/** Uninstalls silently and checks that nothing is left; always runs after an install attempt. */
async function uninstall(installDir) {
  const uninstaller = join(installDir, 'Uninstall DataDesk.exe');
  if (existsSync(uninstaller)) runNsis(uninstaller, ['/S']);
  // The per-user uninstaller copies itself to TEMP and returns early, so wait for the removal.
  const leftovers = () =>
    [
      existsSync(join(installDir, 'DataDesk.exe')) && 'app',
      existsSync(startMenuShortcut) && 'Start-menu shortcut',
      existsSync(desktopShortcut) && 'desktop shortcut',
      existsSync(updaterCache) && 'datadesk-updater',
      uninstallEntryExists() && 'uninstall entry',
    ].filter(Boolean);
  let left = leftovers();
  for (let i = 0; i < 60 && left.length > 0; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    left = leftovers();
  }
  check(
    'uninstaller removed app, shortcuts, uninstall entry and cache',
    left.length === 0,
    left.join(', '),
  );
  try {
    rmSync(join(installDir, '..'), { recursive: true, force: true });
  } catch (error) {
    console.log(`note: could not delete the temp install folder (${String(error)})`);
  }
}

const SMOKE_CHART_ID = '44444444-4444-4444-8444-444444444444';

/**
 * Phase 9 UI: a markdown answer with highlighted SQL and a chart chip, an interactive chart,
 * and every theme in both layouts, with no CSP violation from the packaged app:// origin.
 */
async function checkUi(app, page, userData) {
  const violations = [];
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  mkdirSync(join(userData, 'artifacts', 'charts'), { recursive: true });
  const chart = {
    id: SMOKE_CHART_ID,
    kind: 'chart',
    title: 'Units by day',
    sql: 'SELECT 1',
    rowCount: 6,
    truncated: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    spec: {
      mark: 'line',
      encoding: {
        x: { field: 'day', type: 'temporal' },
        y: { field: 'units', type: 'quantitative' },
        color: { field: 'region', type: 'nominal' },
      },
      data: {
        values: ['South', 'East'].flatMap((region, r) =>
          [1, 2, 3].map((d) => ({ region, day: `2026-01-0${String(d)}`, units: d * (r + 2) })),
        ),
      },
    },
  };
  writeFileSync(
    join(userData, 'artifacts', 'charts', `${SMOKE_CHART_ID}.json`),
    JSON.stringify(chart),
  );
  let seq = 100_000;
  const emit = (event) =>
    app.evaluate(
      ({ BrowserWindow }, payload) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('agent:event', payload);
      },
      { ...event, seq: seq++, at: Date.now() },
    );
  await emit({ kind: 'artifact', artifactKind: 'chart', id: SMOKE_CHART_ID, title: chart.title });
  await emit({
    kind: 'assistant_message',
    messageId: 'smoke-1',
    text: [
      '**East** leads.',
      '',
      '```sql',
      'SELECT region FROM sales;',
      '```',
      '',
      `See [[chart:${SMOKE_CHART_ID}]].`,
    ].join('\n'),
    parentToolUseId: null,
  });
  const answer = page.getByRole('list', { name: 'Conversation' });
  await answer.locator('code.hljs .hljs-keyword').first().waitFor({ timeout: 10_000 });
  check('markdown answer with highlighted SQL', true);
  check(
    'chart chip names the chart',
    (await answer.getByRole('button', { name: `Show chart: ${chart.title}` }).count()) === 1,
  );
  await page.locator('.vega-embed svg .mark-line path').first().waitFor({ timeout: 10_000 });
  check('interactive chart rendered', true);

  const themes = ['Light', 'Slate', 'System', 'Dark'];
  for (const layout of ['Chat-first', 'Results-first']) {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Appearance' }).click();
    await page.getByRole('radio', { name: new RegExp(layout) }).check({ force: true });
    for (const theme of themes) {
      await page.getByRole('radio', { name: new RegExp(`^${theme}`) }).check({ force: true });
      await page.waitForTimeout(150);
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('.vega-embed svg').first().waitFor({ timeout: 10_000 });
    check(
      `${layout} layout renders the chat and the chart`,
      await page.getByLabel('Message').isVisible(),
    );
  }
  check(
    'no CSP violations in any theme or layout',
    violations.length === 0,
    violations.join(' | '),
  );
}

/** The app, dataset and agent checks, against whichever exe was built or installed. */
async function checkApp(exe) {
  const profile = mkdtempSync(join(tmpdir(), 'datadesk-smoke-'));
  let app;
  try {
    app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`] });
    await checkLaunchedApp(app, profile);
  } catch (error) {
    check('smoke run', false, String(error));
  } finally {
    await app?.close().catch(() => undefined);
    rmSync(profile, { recursive: true, force: true });
  }
}

async function checkLaunchedApp(app, profile) {
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

  await checkUi(app, page, userData);

  if (withAgent) {
    await page.evaluate(() => {
      window.__events = [];
      window.datadesk.agent.onEvent((e) => window.__events.push(e));
    });
    await page.evaluate(() =>
      window.datadesk.secrets.set('anthropic', 'sk-ant-dummy-smoke-key-not-real'),
    );
    if (withOpenAI) {
      await page.evaluate(() =>
        window.datadesk.secrets.set('openai', 'sk-openai-dummy-smoke-key-not-real'),
      );
    }
    if (withHf) {
      await page.evaluate(() =>
        window.datadesk.secrets.set('huggingface', 'hf_dummy_smoke_token_not_real'),
      );
    }
    await page.evaluate(() => window.datadesk.agent.send('Which datasets do I have?'));
    let events = [];
    for (let i = 0; i < 90; i++) {
      events = await page.evaluate(() => window.__events);
      // The HF notice is an error event that comes before the session; keep waiting past it.
      const done = (e) =>
        e.kind === 'turn_complete' || (e.kind === 'error' && !e.message.includes('Hugging Face'));
      if (events.some(done)) break;
      await page.waitForTimeout(1000);
    }
    const session = events.find((e) => e.kind === 'session');
    check('Claude binary spawned from app.asar.unpacked', session !== undefined);
    check(
      `agent sees exactly the ${String(expectedDatadeskTools)} datadesk tools`,
      session?.tools.filter((t) => t.startsWith('mcp__datadesk__')).length ===
        expectedDatadeskTools,
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
    if (withHf) {
      const notice = events.find(
        (e) => e.kind === 'error' && e.message.includes('Hugging Face rejected your token'),
      );
      check('HF discovery rejected the dummy token and told the user', notice !== undefined);
      check(
        'session started without the hf server or its tools',
        session !== undefined &&
          session.mcpServers.every((s) => s.name !== 'hf') &&
          !session.tools.some((t) => t.startsWith('mcp__hf__')),
        session?.mcpServers.map((s) => s.name).join(', '),
      );
    }
    const error = events.find((e) => e.kind === 'error' && !e.message.includes('Hugging Face'));
    check(
      'dummy key rejected with a readable error',
      /401|authenticate/i.test(error?.message ?? ''),
      error?.message,
    );
  }

  if (withOpenAIAgent) {
    await page.evaluate(() => {
      window.__events = [];
      window.datadesk.agent.onEvent((e) => window.__events.push(e));
    });
    await page.evaluate(() =>
      window.datadesk.secrets.set('openai', 'sk-openai-dummy-smoke-key-not-real'),
    );
    const saved = await page.evaluate(async () => {
      const current = await window.datadesk.settings.getAgent();
      return current.ok
        ? window.datadesk.settings.setAgent({ ...current.data, provider: 'openai' })
        : current;
    });
    check('provider switched to OpenAI', saved.ok && saved.data.provider === 'openai');
    await page.evaluate(() => window.datadesk.agent.send('Which datasets do I have?'));
    let events = [];
    for (let i = 0; i < 60; i++) {
      events = await page.evaluate(() => window.__events);
      if (events.some((e) => e.kind === 'turn_complete' || e.kind === 'error')) break;
      await page.waitForTimeout(1000);
    }
    const session = events.find((e) => e.kind === 'session');
    check(
      'OpenAI session started (datadesk-mcp via MCPServerStdio from the package)',
      session !== undefined,
      session?.model,
    );
    check(
      'OpenAI analyst has the 10 datadesk tools, Skill and the 3 sub-agent tools',
      session !== undefined &&
        session.tools.filter((t) => t.startsWith('mcp__datadesk__')).length === 10 &&
        ['Skill', 'profiler', 'sql_analyst', 'report_writer'].every((t) =>
          session.tools.includes(t),
        ),
      session?.tools.join(', '),
    );
    const error = events.find((e) => e.kind === 'error');
    check(
      'dummy OpenAI key rejected with a readable, key-free error',
      /OpenAI rejected the API key \(401\)/.test(error?.message ?? '') &&
        !(error?.message ?? '').includes('sk-'),
      error?.message,
    );
  }
}

if (withInstaller) {
  if (!existsSync(installer)) {
    console.error(`Missing ${installer}. Run: npm run package`);
    process.exit(1);
  }
  // The installer replaces an existing installation of the same app, so never run where DataDesk
  // is really installed.
  if (uninstallEntryExists()) {
    console.error('DataDesk is installed on this machine; --installer would replace it. Aborting.');
    process.exit(1);
  }
  // A space in the path: every child-process path (claude.exe, mcp-server.js) must cope with it.
  const installDir = join(mkdtempSync(join(tmpdir(), 'datadesk-install-')), 'Data Desk');
  try {
    const exe = install(installDir);
    if (existsSync(exe)) await checkApp(exe);
  } finally {
    await uninstall(installDir);
  }
} else {
  const exe = resolve('release/win-unpacked/DataDesk.exe');
  if (!existsSync(exe)) {
    console.error(`Missing ${exe}. Run: npm run package:dir`);
    process.exit(1);
  }
  await checkApp(exe);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${String(results.length - failed)}/${String(results.length)} checks passed`);
process.exit(failed === 0 ? 0 : 1);
