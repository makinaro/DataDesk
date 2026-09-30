import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatadeskApi } from '../../src/shared/ipc/api';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn(() => Promise.resolve({ ok: true, data: null }));
// Real files resolve to a path; files constructed by page script resolve to ''.
const getPathForFile = vi.fn((file: File) =>
  file.name === 'fake.csv' ? '' : `C:/data/${file.name}`,
);

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
  webUtils: { getPathForFile },
}));

let api: DatadeskApi;

beforeAll(async () => {
  await import('../../src/preload/index');
  expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
  const [name, exposed] = exposeInMainWorld.mock.calls[0] as [string, DatadeskApi];
  expect(name).toBe('datadesk');
  api = exposed;
});

describe('preload bridge', () => {
  it('exposes exactly the whitelisted namespaces and methods', () => {
    expect(Object.keys(api).sort()).toEqual(['app', 'datasets', 'secrets']);
    expect(Object.keys(api.app).sort()).toEqual(['info']);
    expect(Object.keys(api.secrets).sort()).toEqual(['clear', 'set', 'status']);
    expect(Object.keys(api.datasets).sort()).toEqual([
      'list',
      'pick',
      'preview',
      'registerFile',
      'schema',
    ]);
  });

  it('does not expose ipcRenderer, a generic invoke/send, or a path-string register', () => {
    const flat =
      JSON.stringify(Object.keys(api)) + JSON.stringify(Object.values(api).map(Object.keys));
    expect(flat).not.toMatch(/invoke|send|ipcRenderer|on\b|registerPath/);
  });

  it('maps methods to the right channels and payloads', async () => {
    invoke.mockClear();
    await api.secrets.set('openai', 'sk-test-12345678');
    await api.secrets.clear('huggingface');
    await api.secrets.status();
    await api.app.info();
    await api.datasets.list();
    await api.datasets.pick();
    await api.datasets.schema('sales');
    await api.datasets.preview('sales', 20);
    await api.datasets.registerFile(new File(['a'], 'sales.csv'), 'sales');
    expect(invoke.mock.calls).toEqual([
      ['secrets:set', { provider: 'openai', key: 'sk-test-12345678' }],
      ['secrets:clear', { provider: 'huggingface' }],
      ['secrets:status', undefined],
      ['app:info', undefined],
      ['datasets:list', undefined],
      ['datasets:pick', undefined],
      ['datasets:schema', { name: 'sales' }],
      ['datasets:preview', { name: 'sales', limit: 20 }],
      ['datasets:register', { path: 'C:/data/sales.csv', name: 'sales' }],
    ]);
  });

  it('refuses Files without a real filesystem path (page-constructed Files)', async () => {
    invoke.mockClear();
    const result = await api.datasets.registerFile(new File(['x'], 'fake.csv'));
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(invoke).not.toHaveBeenCalled();
  });
});
