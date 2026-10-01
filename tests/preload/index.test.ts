import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatadeskApi } from '../../src/shared/ipc/api';

const exposeInMainWorld = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();
const invoke = vi.fn(() => Promise.resolve({ ok: true, data: null }));
// Real files resolve to a path; files constructed by page script resolve to ''.
const getPathForFile = vi.fn((file: File) =>
  file.name === 'fake.csv' ? '' : `C:/data/${file.name}`,
);

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
  webUtils: { getPathForFile },
}));

const CHART = '11111111-1111-4111-8111-111111111111';
const REPORT = '22222222-2222-4222-8222-222222222222';

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
    expect(Object.keys(api).sort()).toEqual([
      'agent',
      'app',
      'artifacts',
      'clipboard',
      'compare',
      'datasets',
      'secrets',
      'settings',
    ]);
    expect(Object.keys(api.artifacts).sort()).toEqual(['exportReport', 'getChart', 'getReport']);
    expect(Object.keys(api.agent).sort()).toEqual(['approve', 'onEvent', 'reset', 'send', 'stop']);
    expect(Object.keys(api.settings).sort()).toEqual([
      'getAgent',
      'getAppearance',
      'setAgent',
      'setAppearance',
    ]);
    expect(Object.keys(api.compare).sort()).toEqual(['onEvent', 'reset', 'run', 'stop']);
    expect(Object.keys(api.app).sort()).toEqual(['info']);
    expect(Object.keys(api.clipboard)).toEqual(['writeText']);
    expect(Object.keys(api.secrets).sort()).toEqual(['clear', 'set', 'status']);
    expect(Object.keys(api.datasets).sort()).toEqual([
      'list',
      'pick',
      'preview',
      'registerFile',
      'schema',
    ]);
  });

  it('does not expose ipcRenderer, a generic invoke/send/on, or a path-string register', () => {
    const names = [
      ...Object.keys(api),
      ...Object.values(api).flatMap((ns) => Object.keys(ns as object)),
    ];
    for (const forbidden of [
      'ipcRenderer',
      'invoke',
      'on',
      'once',
      'sendSync',
      'postMessage',
      'registerPath',
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('agent.onEvent passes only the payload (never the IPC event/sender) and can unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = api.agent.onEvent(listener);
    const [channel, handler] = on.mock.calls[0] as [string, (e: unknown, p: unknown) => void];
    expect(channel).toBe('agent:event');
    const payload = { kind: 'status', status: 'idle', seq: 0, at: 1 };
    handler({ sender: 'SHOULD-NOT-LEAK' }, payload);
    expect(listener).toHaveBeenCalledWith(payload);
    expect(JSON.stringify(listener.mock.calls)).not.toContain('SHOULD-NOT-LEAK');
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith('agent:event', handler);
  });

  it('compare.onEvent passes only the payload on compare:event and can unsubscribe', () => {
    on.mockClear();
    const listener = vi.fn();
    const unsubscribe = api.compare.onEvent(listener);
    const [channel, handler] = on.mock.calls[0] as [string, (e: unknown, p: unknown) => void];
    expect(channel).toBe('compare:event');
    const payload = {
      provider: 'openai',
      event: { kind: 'status', status: 'idle', seq: 0, at: 1 },
    };
    handler({ sender: 'SHOULD-NOT-LEAK' }, payload);
    expect(listener).toHaveBeenCalledWith(payload);
    expect(JSON.stringify(listener.mock.calls)).not.toContain('SHOULD-NOT-LEAK');
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith('compare:event', handler);
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
    await api.artifacts.getChart(CHART);
    await api.artifacts.getReport(REPORT);
    await api.artifacts.exportReport({ id: REPORT, format: 'md' });
    await api.compare.run('Which region?');
    await api.compare.stop();
    await api.compare.reset();
    await api.settings.getAppearance();
    await api.settings.setAppearance({ theme: 'light', layout: 'chat-first' });
    await api.clipboard.writeText('SELECT 1;');
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
      ['artifacts:getChart', { id: CHART }],
      ['artifacts:getReport', { id: REPORT }],
      ['artifacts:exportReport', { id: REPORT, format: 'md' }],
      ['compare:run', { text: 'Which region?' }],
      ['compare:stop', undefined],
      ['compare:reset', undefined],
      ['settings:getAppearance', undefined],
      ['settings:setAppearance', { theme: 'light', layout: 'chat-first' }],
      ['clipboard:writeText', { text: 'SELECT 1;' }],
    ]);
  });

  it('refuses Files without a real filesystem path (page-constructed Files)', async () => {
    invoke.mockClear();
    const result = await api.datasets.registerFile(new File(['x'], 'fake.csv'));
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(invoke).not.toHaveBeenCalled();
  });
});
