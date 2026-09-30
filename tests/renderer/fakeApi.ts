import { vi } from 'vitest';
import type { DatasetSummary, RegisteredDataset } from '../../src/shared/datasets';
import type { DatadeskApi } from '../../src/shared/ipc/api';
import type { Provider, SecretsStatus } from '../../src/shared/ipc/contract';
import type { IpcResult } from '../../src/shared/ipc/result';

const ok = <T>(data: T): Promise<IpcResult<T>> => Promise.resolve({ ok: true, data });

export const SALES_COLUMNS = [
  { name: 'order_id', type: 'BIGINT', nullable: true },
  { name: 'region', type: 'VARCHAR', nullable: true },
  { name: 'units', type: 'BIGINT', nullable: true },
];

export function summary(name: string, extra: Partial<DatasetSummary> = {}): DatasetSummary {
  return {
    name,
    format: 'csv',
    path: `C:/data/${name}.csv`,
    sizeBytes: 2048,
    registeredAt: '2026-10-01T00:00:00.000Z',
    rowCount: 60,
    columnCount: 3,
    ...extra,
  };
}

/** In-memory stand-in for window.datadesk. Records keys only so tests can assert on calls. */
export function createFakeApi(
  initial: Partial<SecretsStatus> = {},
  datasets: DatasetSummary[] = [],
) {
  const status: SecretsStatus = { anthropic: false, openai: false, huggingface: false, ...initial };
  const snapshot = () => ({ ...status });
  const registered = [...datasets];
  const register = (name: string): RegisteredDataset => {
    registered.push(summary(name));
    return {
      name,
      format: 'csv',
      path: `C:/data/${name}.csv`,
      rowCount: 60,
      columns: SALES_COLUMNS,
    };
  };

  const api = {
    app: {
      info: vi.fn(() =>
        ok({
          name: 'DataDesk',
          version: '0.0.1',
          platform: 'win32',
          versions: { electron: '44.5.1', chrome: '152', node: '24.21.0' },
        }),
      ),
    },
    secrets: {
      status: vi.fn(() => ok(snapshot())),
      set: vi.fn((provider: Provider, _key: string) => {
        status[provider] = true;
        return ok(snapshot());
      }),
      clear: vi.fn((provider: Provider) => {
        status[provider] = false;
        return ok(snapshot());
      }),
    },
    datasets: {
      list: vi.fn(() => ok([...registered])),
      registerFile: vi.fn((file: File, name?: string) =>
        ok(register(name ?? file.name.replace(/\.\w+$/, '').toLowerCase())),
      ),
      pick: vi.fn(() => ok<RegisteredDataset | null>(register('picked'))),
      schema: vi.fn((_name: string) => ok(SALES_COLUMNS)),
      preview: vi.fn((_name: string, _limit: number) =>
        ok({
          columns: SALES_COLUMNS.map(({ name, type }) => ({ name, type })),
          rows: [
            [1, 'South', 14],
            [2, 'East', 7],
          ],
          rowCount: 2,
          truncated: false,
        }),
      ),
    },
  } satisfies DatadeskApi;
  return api;
}
