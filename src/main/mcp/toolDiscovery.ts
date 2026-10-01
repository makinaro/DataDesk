import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FetchLike, Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export type ToolDiscovery =
  | { ok: true; tools: string[] }
  | { ok: false; reason: 'unauthorized' | 'unreachable'; detail: string };

/** Enough for any real server; tools on later pages aren't disallowed, so the guard stops the session. */
const MAX_PAGES = 10;

/**
 * Lists a remote MCP server's tools before the agent session starts, so main can disallow every
 * tool outside our allowlist (DECISIONS D-019). Main is the MCP client here, with its own
 * connection; the agent CLI connects separately.
 */
export async function discoverTools(
  createTransport: () => Transport,
  timeoutMs = 8_000,
): Promise<ToolDiscovery> {
  const client = new Client({ name: 'datadesk-tool-discovery', version: '0.1.0' });
  try {
    await client.connect(createTransport(), { timeout: timeoutMs });
    const tools: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await client.listTools(cursor === undefined ? {} : { cursor }, {
        timeout: timeoutMs,
      });
      tools.push(...result.tools.map((t) => t.name));
      cursor = result.nextCursor;
      if (cursor === undefined) break;
    }
    return { ok: true, tools };
  } catch (error) {
    if (error instanceof StreamableHTTPError && (error.code === 401 || error.code === 403)) {
      return { ok: false, reason: 'unauthorized', detail: `HTTP ${String(error.code)}` };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: 'unreachable',
      detail: (message.split('\n')[0] ?? '').slice(0, 200),
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

/**
 * Streamable HTTP with a bearer token. No authProvider: a rejected token is an error, never the
 * start of an OAuth flow.
 */
export function bearerTransport(url: string, token: string, fetch?: FetchLike): Transport {
  return new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    ...(fetch ? { fetch } : {}),
  });
}
