import { join } from 'node:path';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpToolError, UiMcpClient } from '../../../src/main/mcp/uiClient';
import { buildServer } from '../../../src/mcp-server/server';
import { createWorkspace } from '../../mcp-server/fixtures';

let ws: ReturnType<typeof createWorkspace>;
let client: UiMcpClient;
let connections: number;
let serverSide: InMemoryTransport | undefined;

beforeEach(() => {
  ws = createWorkspace();
  connections = 0;
  client = new UiMcpClient({
    createTransport: () => {
      connections++;
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      serverSide = serverTransport;
      const server = buildServer({
        db: ws.db,
        importPolicy: { denyDirs: [join(ws.root, 'userData')], maxFileBytes: 10_000_000 },
        artifacts: ws.artifacts,
      });
      void server.connect(serverTransport);
      return clientTransport;
    },
  });
});
afterEach(async () => {
  await client.close();
  ws.cleanup();
});

describe('UiMcpClient', () => {
  it('registers, lists, describes and previews through MCP tools', async () => {
    const reg = await client.register(join(ws.dataDir, 'sales.csv'));
    expect(reg).toMatchObject({ name: 'sales', format: 'csv', rowCount: 60 });

    const list = await client.listDatasets();
    expect(list).toEqual([expect.objectContaining({ name: 'sales', columnCount: 7 })]);

    const cols = await client.schema('sales');
    expect(cols.map((c) => c.name)).toContain('unit_price');

    const preview = await client.preview('sales', 3);
    expect(preview).toMatchObject({ rowCount: 3, truncated: false });
    expect(preview.rows[0]).toHaveLength(7);
  });

  it('turns isError tool results into McpToolError with the server message', async () => {
    const error = await client.register(ws.secretPath).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpToolError);
    expect((error as McpToolError).message).toMatch(/Unsupported file type/);
  });

  it('connects lazily once and reconnects after the server goes away', async () => {
    expect(connections).toBe(0);
    await client.listDatasets();
    await client.listDatasets();
    expect(connections).toBe(1);

    await serverSide?.close();
    await client.listDatasets();
    expect(connections).toBe(2);
  });
});
