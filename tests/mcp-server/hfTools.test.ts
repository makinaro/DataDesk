import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, loadConfigAndTakeSecrets } from '../../src/mcp-server/config';
import { buildServer, HF_TOOL_NAMES, TOOL_NAMES } from '../../src/mcp-server/server';
import { createWorkspace } from './fixtures';
import { fakeHub, type FakeRoute } from './hf/fakeHub';

const URL_IRIS = 'https://huggingface.co/datasets/scikit-learn/iris/resolve/main/Iris.csv';
const CSV = 'sepal_length,species\n5.1,setosa\n6.2,virginica\n';

let ws: ReturnType<typeof createWorkspace>;
let userData: string;
beforeEach(() => {
  ws = createWorkspace();
  userData = join(ws.root, 'userData');
  mkdirSync(userData);
});
afterEach(() => {
  ws.cleanup();
});

async function connect(routes?: Record<string, FakeRoute>) {
  const hub = fakeHub(routes ?? {});
  const server = buildServer({
    db: ws.db,
    importPolicy: { denyDirs: [userData], maxFileBytes: 10_000_000 },
    artifacts: ws.artifacts,
    hf: routes
      ? {
          token: 'hf_x',
          hfDir: join(userData, 'datasets', 'hf'),
          maxBytes: 1_000_000,
          timeoutMs: 5_000,
          fetch: hub.fetch,
        }
      : undefined,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (args: Record<string, unknown>) =>
    (await client.callTool({ name: 'load_hf_dataset', arguments: args })) as CallToolResult;
  return { client, call, hub };
}

describe('load_hf_dataset is present only with a Hugging Face token', () => {
  it('is absent without HF config', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('appears with HF config, annotated as reaching outside the app and stating its cap', async () => {
    const { client } = await connect({});
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES, ...HF_TOOL_NAMES].sort());
    const tool = tools.find((t) => t.name === 'load_hf_dataset');
    expect(tool?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    expect(tool?.description).toMatch(/approval/);
    expect(tool?.description).toMatch(/1 MB/);
    expect(tool?.inputSchema.required?.sort()).toEqual(['path', 'repo_id']);
  });
});

describe('load_hf_dataset through MCP', () => {
  it('downloads, registers and returns the schema as structured content', async () => {
    const { call, client } = await connect({ [URL_IRIS]: { status: 200, body: CSV } });
    const result = await call({ repo_id: 'scikit-learn/iris', path: 'Iris.csv' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      name: 'hf_iris',
      rowCount: 2,
      repoId: 'scikit-learn/iris',
      file: 'Iris.csv',
    });
    const listed = (await client.callTool({
      name: 'list_datasets',
      arguments: {},
    })) as CallToolResult;
    expect(JSON.stringify(listed.structuredContent)).toContain('hf_iris');
  });

  it('rejects unsafe input before any request is made', async () => {
    const { call, hub } = await connect({});
    for (const args of [
      { repo_id: 'scikit-learn/iris', path: '../../catalog.json' },
      { repo_id: 'scikit-learn/iris', path: 'weights.bin' },
      { repo_id: 'not-a-repo', path: 'x.csv' },
    ]) {
      expect((await call(args)).isError).toBe(true);
    }
    expect(hub.calls).toHaveLength(0);
  });

  it('reports download failures as readable tool errors', async () => {
    const { call } = await connect({
      [URL_IRIS]: { status: 401, headers: { 'x-error-code': 'GatedRepo' } },
    });
    const result = await call({ repo_id: 'scikit-learn/iris', path: 'Iris.csv' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/gated/);
  });
});

describe('HF server config', () => {
  const base = { DATADESK_CATALOG_PATH: join('C:', 'u', 'catalog.json') };

  it('treats a missing or blank token as disabled and defaults the folder and cap', () => {
    expect(loadConfig(base).hfToken).toBeUndefined();
    expect(loadConfig({ ...base, DATADESK_HF_TOKEN: ' ' }).hfToken).toBeUndefined();
    expect(loadConfig(base).hfDir).toBe(join('C:', 'u', 'datasets', 'hf'));
    expect(loadConfig(base).hfMaxBytes).toBe(500 * 1024 ** 2);
  });

  it('removes the token from the environment once it is in the config', () => {
    const env: NodeJS.ProcessEnv = { ...base, DATADESK_HF_TOKEN: 'hf_take_me' };
    expect(loadConfigAndTakeSecrets(env).hfToken).toBe('hf_take_me');
    expect(env).not.toHaveProperty('DATADESK_HF_TOKEN');
  });
});
