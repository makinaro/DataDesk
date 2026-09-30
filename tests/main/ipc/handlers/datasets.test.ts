import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import {
  registerDatasetHandlers,
  type DatasetHandlerDeps,
} from '../../../../src/main/ipc/handlers/datasets';
import { createIpcRouter } from '../../../../src/main/ipc/router';
import { McpToolError } from '../../../../src/main/mcp/uiClient';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const REGISTERED = {
  name: 'sales',
  format: 'csv' as const,
  path: 'C:/data/sales.csv',
  rowCount: 60,
  columns: [{ name: 'region', type: 'VARCHAR', nullable: true }],
};

function wire(overrides: Partial<DatasetHandlerDeps['client']> = {}, picked: string | null = null) {
  const listeners = new Map<string, Listener>();
  const client = {
    listDatasets: vi.fn(() => Promise.resolve([])),
    register: vi.fn(() => Promise.resolve(REGISTERED)),
    schema: vi.fn(() => Promise.resolve(REGISTERED.columns)),
    preview: vi.fn(() =>
      Promise.resolve({ columns: [], rows: [], rowCount: 0, truncated: false, clippedCells: 0 }),
    ),
    ...overrides,
  };
  const pickFile = vi.fn(() => Promise.resolve(picked));
  const handle = createIpcRouter({
    ipcMain: { handle: (c, l) => listeners.set(c, l) },
    isTrustedSender: () => true,
  });
  registerDatasetHandlers(handle, { client, pickFile });
  const call = (channel: string, payload?: unknown) =>
    listeners.get(channel)?.({} as IpcMainInvokeEvent, payload);
  return { call, client, pickFile };
}

describe('dataset IPC handlers', () => {
  it('registers a path and returns the validated dataset', async () => {
    const { call, client } = wire();
    await expect(
      call('datasets:register', { path: 'C:/data/sales.csv', name: 'sales' }),
    ).resolves.toEqual({ ok: true, data: REGISTERED });
    expect(client.register).toHaveBeenCalledWith('C:/data/sales.csv', 'sales');
  });

  it('maps tool refusals to REJECTED with the server message', async () => {
    const { call } = wire({
      register: () =>
        Promise.reject(new McpToolError('register_dataset', 'Unsupported file type.')),
    });
    await expect(call('datasets:register', { path: 'C:/x.exe' })).resolves.toEqual({
      ok: false,
      error: { code: 'REJECTED', message: 'Unsupported file type.' },
    });
  });

  it('pick: returns null when the dialog is cancelled, without registering', async () => {
    const { call, client } = wire({}, null);
    await expect(call('datasets:pick')).resolves.toEqual({ ok: true, data: null });
    expect(client.register).not.toHaveBeenCalled();
  });

  it('pick: registers the chosen file', async () => {
    const { call, client } = wire({}, 'C:/data/sales.csv');
    await expect(call('datasets:pick')).resolves.toEqual({ ok: true, data: REGISTERED });
    expect(client.register).toHaveBeenCalledWith('C:/data/sales.csv');
  });

  it('rejects unsafe dataset names before reaching the MCP server', async () => {
    const { call, client } = wire();
    await expect(call('datasets:schema', { name: 'x"; DROP' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(client.schema).not.toHaveBeenCalled();
  });

  it('bounds preview size', async () => {
    const { call } = wire();
    await expect(call('datasets:preview', { name: 'sales', limit: 10_000 })).resolves.toMatchObject(
      { ok: false, error: { code: 'INVALID_REQUEST' } },
    );
  });
});
