import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatadeskApi } from '../../src/shared/ipc/api';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn(() => Promise.resolve({ ok: true, data: null }));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
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
    expect(Object.keys(api).sort()).toEqual(['app', 'secrets']);
    expect(Object.keys(api.app).sort()).toEqual(['info']);
    expect(Object.keys(api.secrets).sort()).toEqual(['clear', 'set', 'status']);
  });

  it('does not expose ipcRenderer or a generic invoke/send', () => {
    const flat =
      JSON.stringify(Object.keys(api)) + JSON.stringify(Object.values(api).map(Object.keys));
    expect(flat).not.toMatch(/invoke|send|ipcRenderer|on\b/);
  });

  it('maps methods to the right channels and payloads', async () => {
    invoke.mockClear();
    await api.secrets.set('openai', 'sk-test-12345678');
    await api.secrets.clear('huggingface');
    await api.secrets.status();
    await api.app.info();
    expect(invoke.mock.calls).toEqual([
      ['secrets:set', { provider: 'openai', key: 'sk-test-12345678' }],
      ['secrets:clear', { provider: 'huggingface' }],
      ['secrets:status', undefined],
      ['app:info', undefined],
    ]);
  });
});
