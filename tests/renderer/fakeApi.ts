import { vi } from 'vitest';
import type { DatadeskApi } from '../../src/shared/ipc/api';
import type { Provider, SecretsStatus } from '../../src/shared/ipc/contract';

/** In-memory stand-in for window.datadesk. Records keys only so tests can assert on calls. */
export function createFakeApi(initial: Partial<SecretsStatus> = {}) {
  const status: SecretsStatus = { anthropic: false, openai: false, huggingface: false, ...initial };
  const snapshot = () => ({ ...status });

  const api = {
    app: {
      info: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          data: {
            name: 'DataDesk',
            version: '0.0.1',
            platform: 'win32',
            versions: { electron: '44.5.1', chrome: '152', node: '24.21.0' },
          },
        }),
      ),
    },
    secrets: {
      status: vi.fn(() => Promise.resolve({ ok: true as const, data: snapshot() })),
      set: vi.fn((provider: Provider, _key: string) => {
        status[provider] = true;
        return Promise.resolve({ ok: true as const, data: snapshot() });
      }),
      clear: vi.fn((provider: Provider) => {
        status[provider] = false;
        return Promise.resolve({ ok: true as const, data: snapshot() });
      }),
    },
  } satisfies DatadeskApi;
  return api;
}
