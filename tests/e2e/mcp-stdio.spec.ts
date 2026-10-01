import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import electronPath from 'electron';
import { expect, test } from '@playwright/test';

/**
 * Runs the *built* datadesk-mcp exactly as the app will (DECISIONS D-003): the Electron binary
 * in Node mode, speaking MCP over real stdio pipes, with an explicitly built environment.
 */
test('datadesk-mcp runs under Electron-as-Node and serves tools over stdio', async () => {
  const root = mkdtempSync(join(tmpdir(), 'datadesk-stdio-'));
  const dataDir = join(root, 'data');
  mkdirSync(dataDir);
  copyFileSync(resolve('test-data/public/sales.parquet'), join(dataDir, 'sales.parquet'));

  const stderr: string[] = [];
  const transport = new StdioClientTransport({
    command: electronPath as unknown as string,
    args: [resolve('out/main/mcp-server.js')],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      DATADESK_CATALOG_PATH: join(root, 'catalog.json'),
      DATADESK_TEMP_DIR: join(root, 'tmp'),
      DATADESK_MAX_ROWS: '50',
    },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
  const client = new Client({ name: 'e2e', version: '0.0.0' });

  try {
    await client.connect(transport);
    expect(client.getServerVersion()).toMatchObject({ name: 'datadesk' });

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(8);

    const reg = (await client.callTool({
      name: 'register_dataset',
      arguments: { path: join(dataDir, 'sales.parquet') },
    })) as CallToolResult;
    expect(reg.isError, JSON.stringify(reg.content)).toBeFalsy();

    const sql = (await client.callTool({
      name: 'run_sql',
      arguments: { sql: 'SELECT count(*) AS n, round(avg(unit_price), 2) AS avg_price FROM sales' },
    })) as CallToolResult;
    expect(sql.structuredContent).toMatchObject({ rows: [[60, expect.any(Number)]] });
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
  // Logs go to stderr (stdout is reserved for the protocol).
  expect(stderr.join('')).toContain('datadesk 0.1.0 ready');
});

test('datadesk-mcp scrubs inherited secrets at startup and logs names only', () => {
  const root = mkdtempSync(join(tmpdir(), 'datadesk-scrub-'));
  try {
    // With stdin closed immediately the server logs its startup and exits.
    const result = spawnSync(
      electronPath as unknown as string,
      [resolve('out/main/mcp-server.js')],
      {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          ANTHROPIC_API_KEY: 'sk-ant-VALUE-MUST-NOT-APPEAR',
          CLAUDE_CODE_MESSAGING_TOKEN: 'messaging-token-value',
          DATADESK_CATALOG_PATH: join(root, 'catalog.json'),
          DATADESK_TEMP_DIR: join(root, 'tmp'),
        },
        input: '',
        encoding: 'utf8',
        timeout: 20_000,
      },
    );
    expect(result.stderr).toMatch(/removed inherited secrets from env: .*ANTHROPIC_API_KEY/);
    expect(result.stderr).toMatch(/CLAUDE_CODE_MESSAGING_TOKEN/);
    expect(result.stderr).not.toContain('sk-ant-VALUE-MUST-NOT-APPEAR');
    expect(result.stderr).not.toContain('messaging-token-value');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('with DATADESK_OPENAI_API_KEY the stdio server adds the OpenAI tools (listed, never called)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'datadesk-stdio-'));
  const stderr: string[] = [];
  const transport = new StdioClientTransport({
    command: electronPath as unknown as string,
    args: [resolve('out/main/mcp-server.js')],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      DATADESK_CATALOG_PATH: join(root, 'catalog.json'),
      DATADESK_TEMP_DIR: join(root, 'tmp'),
      // A fake key: listing tools makes no OpenAI request, so nothing leaves the machine.
      DATADESK_OPENAI_API_KEY: 'sk-e2e-fake-key-not-real',
    },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
  const client = new Client({ name: 'e2e', version: '0.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['search_columns', 'second_opinion']),
    );
    expect(tools).toHaveLength(10);
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
  const log = stderr.join('');
  expect(log).toContain('OpenAI tools: on');
  expect(log).not.toContain('sk-e2e-fake-key-not-real');
});

test('with DATADESK_HF_TOKEN the stdio server adds load_hf_dataset (listed, never called)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'datadesk-stdio-'));
  const stderr: string[] = [];
  const transport = new StdioClientTransport({
    command: electronPath as unknown as string,
    args: [resolve('out/main/mcp-server.js')],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      DATADESK_CATALOG_PATH: join(root, 'catalog.json'),
      DATADESK_TEMP_DIR: join(root, 'tmp'),
      // A fake token: listing tools makes no Hugging Face request.
      DATADESK_HF_TOKEN: 'hf_e2e_fake_token_not_real',
    },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
  const client = new Client({ name: 'e2e', version: '0.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('load_hf_dataset');
    expect(tools).toHaveLength(9);
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
  const log = stderr.join('');
  expect(log).toContain('HF tools: on');
  expect(log).not.toContain('hf_e2e_fake_token_not_real');
});
