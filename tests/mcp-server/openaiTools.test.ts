import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/mcp-server/config';
import { OpenAIUnavailableError } from '../../src/mcp-server/openai/client';
import { EmbeddingCache } from '../../src/mcp-server/openai/embeddingCache';
import { buildServer, OPENAI_TOOL_NAMES, TOOL_NAMES } from '../../src/mcp-server/server';
import { createWorkspace } from './fixtures';
import { createFakeOpenAI } from './openai/fakeOpenAI';

let ws: ReturnType<typeof createWorkspace>;
beforeEach(async () => {
  ws = createWorkspace();
  await ws.db.register(ws.entry('sales', 'sales.csv', 'csv'));
});
afterEach(() => {
  ws.cleanup();
});

async function connect(openai?: ReturnType<typeof createFakeOpenAI>) {
  const server = buildServer({
    db: ws.db,
    importPolicy: { denyDirs: [], maxFileBytes: 10_000_000 },
    artifacts: ws.artifacts,
    openai: openai ? { client: openai, cache: new EmbeddingCache(undefined) } : undefined,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { client, call };
}

describe('OpenAI tools are present only with a key', () => {
  it('without an OpenAI client, tools/list has exactly the base tools', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('with a client, both tools appear, honestly annotated as reaching outside the app', async () => {
    const { client } = await connect(createFakeOpenAI());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES, ...OPENAI_TOOL_NAMES].sort());
    for (const name of OPENAI_TOOL_NAMES) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
      expect(tool?.description).toMatch(/OpenAI/);
      expect(tool?.outputSchema).toBeDefined();
    }
  });
});

describe('OpenAI tools through MCP', () => {
  it('search_columns returns ranked matches as structured content', async () => {
    const { call } = await connect(createFakeOpenAI());
    const r = await call('search_columns', { query: 'product', limit: 2 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({
      matches: [{ dataset: 'sales', column: 'product' }, expect.anything()],
      columnsSearched: 7,
    });
  });

  it('second_opinion returns the critique; invalid SQL never reaches OpenAI', async () => {
    const openai = createFakeOpenAI();
    const { call } = await connect(openai);
    const r = await call('second_opinion', {
      question: 'Revenue by region?',
      sql: 'SELECT region, SUM(units) FROM sales GROUP BY 1',
    });
    expect(r.structuredContent).toMatchObject({ verdict: 'questionable', rowsReviewed: 4 });
    const bad = await call('second_opinion', { question: 'q', sql: 'COPY sales TO "x.csv"' });
    expect(bad.isError).toBe(true);
    expect(openai.critique).toHaveBeenCalledTimes(1);
  });

  it('reports OpenAI failures as readable tool errors', async () => {
    const openai = createFakeOpenAI();
    openai.embed.mockRejectedValueOnce(
      new OpenAIUnavailableError('OpenAI rejected the API key (401). Check it in Settings.'),
    );
    const { call } = await connect(openai);
    const r = await call('search_columns', { query: 'x' });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain('OpenAI rejected the API key (401)');
  });
});

describe('server config', () => {
  const base = { DATADESK_CATALOG_PATH: join('C:', 'u', 'catalog.json') };

  it('treats a missing or blank key as disabled', () => {
    expect(loadConfig(base).openaiApiKey).toBeUndefined();
    expect(loadConfig({ ...base, DATADESK_OPENAI_API_KEY: '' }).openaiApiKey).toBeUndefined();
    expect(loadConfig({ ...base, DATADESK_OPENAI_API_KEY: '  ' }).openaiApiKey).toBeUndefined();
    expect(loadConfig({ ...base, DATADESK_OPENAI_API_KEY: 'sk-x' }).openaiApiKey).toBe('sk-x');
  });

  it('keeps the embedding cache next to the catalog by default', () => {
    expect(loadConfig(base).cacheDir).toBe(join('C:', 'u', 'cache'));
  });
});
