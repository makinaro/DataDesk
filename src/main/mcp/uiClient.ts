import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  ColumnInfoSchema,
  DatasetPreviewSchema,
  DatasetSummarySchema,
  RegisteredDatasetSchema,
  RemovedDatasetSchema,
  type ColumnInfo,
  type DatasetPreview,
  type DatasetSummary,
  type RegisteredDataset,
  type RemovedDataset,
} from '../../shared/datasets';

/** The server answered with isError: a message meant for the user (or model), not a crash. */
export class McpToolError extends Error {
  constructor(
    readonly tool: string,
    message: string,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export interface UiMcpClientOptions {
  /** Creates a fresh transport per connection (stdio in the app, in-memory in tests). */
  createTransport: () => Transport;
  log?: (message: string) => void;
}

/**
 * The main process's own MCP client for the UI: the sidebar lists, registers and previews
 * datasets through the same datadesk-mcp tools the agent uses. We're the MCP *client* here;
 * in Phase 2 the Agent SDK is another client of another datadesk-mcp process.
 *
 * The connection is lazy and self-healing: if the server process exits, the next call respawns it.
 */
export class UiMcpClient {
  private connection: Promise<Client> | undefined;

  constructor(private readonly options: UiMcpClientOptions) {}

  async listDatasets(): Promise<DatasetSummary[]> {
    const out = await this.call(
      'list_datasets',
      {},
      z.object({ datasets: z.array(DatasetSummarySchema) }),
    );
    return out.datasets;
  }

  register(path: string, name?: string): Promise<RegisteredDataset> {
    return this.call(
      'register_dataset',
      name === undefined ? { path } : { path, name },
      RegisteredDatasetSchema,
    );
  }

  async schema(dataset: string): Promise<ColumnInfo[]> {
    const out = await this.call(
      'get_schema',
      { dataset },
      z.object({ columns: z.array(ColumnInfoSchema) }),
    );
    return out.columns;
  }

  preview(dataset: string, limit: number): Promise<DatasetPreview> {
    return this.call('sample_rows', { dataset, limit, mode: 'head' }, DatasetPreviewSchema);
  }

  /** Only the UI's server has this tool (DATADESK_UI_TOOLS, D-029). */
  remove(dataset: string): Promise<RemovedDataset> {
    return this.call('remove_dataset', { name: dataset }, RemovedDatasetSchema);
  }

  async close(): Promise<void> {
    const pending = this.connection;
    this.connection = undefined;
    if (pending) await (await pending.catch(() => undefined))?.close();
  }

  private async call<T>(
    tool: string,
    args: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const client = await this.connect();
    const result = (await client.callTool({ name: tool, arguments: args })) as CallToolResult;
    if (result.isError) {
      const text = result.content
        .map((c) => (c.type === 'text' ? c.text : ''))
        .join(' ')
        .trim();
      throw new McpToolError(tool, text || `${tool} failed.`);
    }
    // Validate at the process boundary, even though the server is ours.
    return schema.parse(result.structuredContent);
  }

  private connect(): Promise<Client> {
    if (this.connection) return this.connection;
    const pending: Promise<Client> = (async () => {
      const transport = this.options.createTransport();
      const client = new Client({ name: 'datadesk-ui', version: '0.1.0' });
      // Only forget *this* connection: a late close event from an old client must not orphan
      // a newer one.
      const forget = () => {
        if (this.connection === pending) this.connection = undefined;
      };
      client.onclose = () => {
        this.options.log?.('datadesk-mcp connection closed; will reconnect on next call');
        forget();
      };
      try {
        await client.connect(transport);
      } catch (error) {
        forget();
        throw error;
      }
      return client;
    })();
    this.connection = pending;
    return pending;
  }
}
