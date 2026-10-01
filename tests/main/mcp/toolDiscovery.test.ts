import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { bearerTransport, discoverTools } from '../../../src/main/mcp/toolDiscovery';

const URL = 'https://huggingface.co/mcp?no_image_content=true';
const TOKEN = 'hf_discovery_test_token_0123';

function fakeServer(names: string[]) {
  const server = new McpServer({ name: 'fake-hf', version: '0.0.1' });
  for (const name of names) {
    server.registerTool(name, { description: name, inputSchema: { q: z.string() } }, () => ({
      content: [{ type: 'text', text: 'x' }],
    }));
  }
  return () => {
    const [client, serverSide] = InMemoryTransport.createLinkedPair();
    void server.connect(serverSide);
    return client;
  };
}

describe('discoverTools', () => {
  it('lists every tool the server offers', async () => {
    const tools = ['hub_repo_search', 'hub_repo_details', 'hf_fs', 'create_repo', 'hf_jobs'];
    await expect(discoverTools(fakeServer(tools))).resolves.toEqual({ ok: true, tools });
  });

  it('sends the token as a bearer header and reports a rejected token as unauthorized', async () => {
    const fetch = vi.fn<FetchLike>(() =>
      Promise.resolve(new Response('Invalid credentials', { status: 401 })),
    );
    const result = await discoverTools(() => bearerTransport(URL, TOKEN, fetch));
    expect(result).toEqual({ ok: false, reason: 'unauthorized', detail: 'HTTP 401' });
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    // No OAuth discovery: the only request went to the server URL itself.
    expect(fetch.mock.calls.map(([u]) => String(u))).toEqual([URL]);
  });

  it('reports an offline server as unreachable, without echoing the token', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.reject(new TypeError('fetch failed')));
    const result = await discoverTools(() => bearerTransport(URL, TOKEN, fetch));
    expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('gives up after the timeout', async () => {
    const fetch = vi.fn<FetchLike>(() => new Promise<Response>(() => undefined));
    const result = await discoverTools(() => bearerTransport(URL, TOKEN, fetch), 50);
    expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
  });
});
