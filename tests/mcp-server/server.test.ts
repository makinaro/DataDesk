import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer, TOOL_NAMES, UI_TOOL_NAMES } from '../../src/mcp-server/server';
import { createWorkspace, SECRET, sqlPath } from './fixtures';

let ws: ReturnType<typeof createWorkspace>;
let client: Client;

beforeEach(async () => {
  ws = createWorkspace();
  const server = buildServer({
    db: ws.db,
    importPolicy: { denyDirs: [join(ws.root, 'userData')], maxFileBytes: 10_000_000 },
    artifacts: ws.artifacts,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});
afterEach(async () => {
  await client.close();
  ws.cleanup();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}
function text(result: CallToolResult): string {
  return result.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
}
const register = () => call('register_dataset', { path: join(ws.dataDir, 'sales.csv') });

describe('tools/list', () => {
  it('exposes exactly the six Phase 1 tools with input and output schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.outputSchema, tool.name).toBeDefined();
    }
  });

  it('marks query tools read-only; registering and artifact tools write; all closed-world', async () => {
    const writers = new Set(['register_dataset', 'create_chart', 'save_report']);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(!writers.has(tool.name));
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
    }
  });

  it('publishes the run_sql row cap in its description', async () => {
    const { tools } = await client.listTools();
    const runSql = tools.find((t) => t.name === 'run_sql');
    expect(runSql?.description).toContain(`At most ${String(ws.dbOptions.maxRows)} rows`);
  });
});

describe('happy path', () => {
  it('register → list → schema → sample → profile → run_sql', async () => {
    const reg = await register();
    expect(reg.isError).toBeFalsy();
    expect(reg.structuredContent).toMatchObject({ name: 'sales', rowCount: 60 });

    const list = await call('list_datasets');
    expect(list.structuredContent).toMatchObject({
      datasets: [{ name: 'sales', rowCount: 60, columnCount: 7 }],
    });

    const schema = await call('get_schema', { dataset: 'sales' });
    expect((schema.structuredContent as { columns: unknown[] }).columns).toHaveLength(7);

    const sample = await call('sample_rows', { dataset: 'sales', limit: 3 });
    expect(sample.structuredContent).toMatchObject({ rowCount: 3, truncated: false });

    const profile = await call('profile_column', { dataset: 'sales', column: 'region' });
    expect(profile.structuredContent).toMatchObject({ distinctCount: 4, nullCount: 0 });

    const sql = await call('run_sql', {
      sql: 'SELECT region, sum(units) AS units FROM sales GROUP BY region ORDER BY region',
    });
    expect(sql.isError).toBeFalsy();
    expect(sql.structuredContent).toMatchObject({
      columns: [
        { name: 'region', type: 'VARCHAR' },
        { name: 'units', type: 'HUGEINT' },
      ],
      rowCount: 4,
      truncated: false,
    });
    // Text content mirrors the structured result for clients that only read `content`.
    expect(text(sql)).toContain('"region"');
  });

  it('applies defaults from the input schema (sample_rows limit 10)', async () => {
    await register();
    const sample = await call('sample_rows', { dataset: 'sales' });
    expect(sample.structuredContent).toMatchObject({ rowCount: 10 });
  });
});

describe('errors come back as tool results the model can act on', () => {
  it('rejects writes with an explanation', async () => {
    await register();
    const r = await call('run_sql', { sql: 'CREATE TABLE x AS SELECT 1' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Only SELECT queries are allowed \(got CREATE\)/);
  });

  it('reports SQL mistakes with DuckDB’s first error line only', async () => {
    await register();
    const r = await call('run_sql', { sql: 'SELECT no_such_column FROM sales' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Binder Error/);
    expect(text(r).split('\n')).toHaveLength(1);
  });

  it('rejects invalid input via the schema (bad dataset name, too many rows)', async () => {
    const bad = await call('get_schema', { dataset: 'Robert"); DROP' });
    expect(bad.isError).toBe(true);
    const tooMany = await call('run_sql', { sql: 'SELECT 1', max_rows: 1_000_000 });
    expect(tooMany.isError).toBe(true);
  });

  it('refuses to register files outside policy, and never leaks their content', async () => {
    const r = await call('register_dataset', { path: ws.secretPath });
    expect(r.isError).toBe(true);
    expect(text(r)).not.toContain(SECRET);
  });

  it('cannot read unregistered files through run_sql', async () => {
    await register();
    const r = await call('run_sql', {
      sql: `SELECT content FROM read_text('${sqlPath(ws.secretPath)}')`,
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Permission Error/);
    expect(text(r)).not.toContain(SECRET);
  });

  it('truncates large results and says so', async () => {
    const r = await call('run_sql', { sql: 'SELECT * FROM range(100000)' });
    expect(r.structuredContent).toMatchObject({ rowCount: ws.dbOptions.maxRows, truncated: true });
    expect(text(r)).toMatch(/truncated/);
  });
});

describe('artifact titles', () => {
  it('rejects multi-line titles at the tool boundary', async () => {
    await register();
    const r = await call('create_chart', {
      title: 'Sales\nby region',
      sql: 'SELECT region, units FROM sales',
      spec: { mark: 'bar', encoding: { x: { field: 'region', type: 'nominal' } } },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/single line/);
    const report = await call('save_report', { title: 'A\u0007B', markdown: '# x' });
    expect(report.isError).toBe(true);
  });
});

describe('remove_dataset (UI server only)', () => {
  it('does not exist without the UI flag, so an agent server can never call it', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain('remove_dataset');
    const result = await call('remove_dataset', { name: 'sales' });
    expect(result.isError).toBe(true);
  });

  it('exists on the UI server, is marked destructive, and removes a dataset', async () => {
    const server = buildServer({
      db: ws.db,
      importPolicy: { denyDirs: [join(ws.root, 'userData')], maxFileBytes: 10_000_000 },
      artifacts: ws.artifacts,
      ui: { ownedDir: join(ws.root, 'userData', 'datasets', 'hf') },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const ui = new Client({ name: 'ui', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), ui.connect(clientTransport)]);
    try {
      const { tools } = await ui.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES, ...UI_TOOL_NAMES].sort());
      expect(tools.find((t) => t.name === 'remove_dataset')?.annotations?.destructiveHint).toBe(
        true,
      );

      await register();
      const removed = (await ui.callTool({
        name: 'remove_dataset',
        arguments: { name: 'sales' },
      })) as CallToolResult;
      expect(removed.structuredContent).toEqual({ removed: true, deletedFile: false });
      const bad = (await ui.callTool({
        name: 'remove_dataset',
        arguments: { name: '../catalog' },
      })) as CallToolResult;
      expect(bad.isError).toBe(true);
    } finally {
      await ui.close();
    }
  });
});
