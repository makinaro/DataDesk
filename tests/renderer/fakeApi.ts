import { vi } from 'vitest';
import {
  DEFAULT_AGENT_SETTINGS,
  type AgentEvent,
  type AgentEventInput,
  type AgentSettings,
  type CompareEvent,
} from '../../src/shared/agent';
import { DEFAULT_APPEARANCE, type Appearance } from '../../src/shared/appearance';
import type { ChartArtifact, ReportArtifact } from '../../src/shared/artifacts';
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

export const CHART_ID = '11111111-1111-4111-8111-111111111111';
export const REPORT_ID = '22222222-2222-4222-8222-222222222222';

export const CHART: ChartArtifact = {
  id: CHART_ID,
  kind: 'chart',
  title: 'Units by region',
  spec: {
    mark: 'bar',
    encoding: {
      x: { field: 'region', type: 'nominal' },
      y: { field: 'units', type: 'quantitative' },
    },
    data: {
      values: [
        { region: 'South', units: 14 },
        { region: 'East', units: 7 },
      ],
    },
  },
  sql: 'SELECT region, units FROM sales',
  rowCount: 2,
  truncated: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

export const REPORT: ReportArtifact = {
  id: REPORT_ID,
  kind: 'report',
  title: 'Sales summary',
  markdown: `# Sales summary\n\nSouth leads.\n\n[[chart:${CHART_ID}]]\n\n## Notes\n\n- small sample`,
  chartIds: [CHART_ID],
  createdAt: '2026-10-01T00:00:00.000Z',
};

const notFound = <T>(message: string): Promise<IpcResult<T>> =>
  Promise.resolve({ ok: false, error: { code: 'REJECTED', message } });

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
  const listeners = new Set<(event: AgentEvent) => void>();
  const compareListeners = new Set<(event: CompareEvent) => void>();
  let agentSettings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS };
  let appearance: Appearance = { ...DEFAULT_APPEARANCE };
  const register = (name: string): RegisteredDataset => {
    // Like the real catalog: re-registering a name replaces it.
    const existing = registered.findIndex((d) => d.name === name);
    if (existing >= 0) registered.splice(existing, 1);
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
          clippedCells: 0,
        }),
      ),
    },
    agent: {
      send: vi.fn((_text: string) => ok({ accepted: true as const })),
      stop: vi.fn(() => ok({ ok: true as const })),
      reset: vi.fn(() => ok({ ok: true as const })),
      approve: vi.fn((_requestId: string, _approved: boolean) => ok({ found: true })),
      onEvent: vi.fn((listener: (event: AgentEvent) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
    },
    compare: {
      run: vi.fn((_text: string) => ok({ accepted: true as const })),
      stop: vi.fn(() => ok({ ok: true as const })),
      reset: vi.fn(() => ok({ ok: true as const })),
      onEvent: vi.fn((listener: (event: CompareEvent) => void) => {
        compareListeners.add(listener);
        return () => {
          compareListeners.delete(listener);
        };
      }),
    },
    settings: {
      getAgent: vi.fn(() => ok({ ...agentSettings })),
      setAgent: vi.fn((next: AgentSettings) => {
        agentSettings = next;
        return ok({ ...next });
      }),
      getAppearance: vi.fn(() => ok({ ...appearance })),
      setAppearance: vi.fn((next: Appearance) => {
        appearance = next;
        return ok({ ...next });
      }),
    },
    clipboard: {
      writeText: vi.fn((_text: string) => ok({ ok: true as const })),
    },
    artifacts: {
      getChart: vi.fn((id: string) =>
        id === CHART_ID ? ok(CHART) : notFound<ChartArtifact>('That chart no longer exists.'),
      ),
      getReport: vi.fn((id: string) =>
        id === REPORT_ID ? ok(REPORT) : notFound<ReportArtifact>('That report no longer exists.'),
      ),
      exportReport: vi.fn((_request: { id: string; format: 'md' | 'pdf'; bodyHtml?: string }) =>
        ok<{ saved: boolean; path: string | null }>({ saved: true, path: 'C:/out/report' }),
      ),
    },
  } satisfies DatadeskApi;

  /** Pushes an agent event to subscribers, the way main does over IPC. */
  let seq = 0;
  const emit = (event: AgentEventInput) => {
    const full = { ...event, seq: seq++, at: Date.now() };
    for (const l of [...listeners]) l(full);
  };
  /** Pushes a compare-lane event; each lane numbers its own events, as in main. */
  const compareSeq = { anthropic: 0, openai: 0 };
  const emitCompare = (provider: CompareEvent['provider'], event: AgentEventInput) => {
    const full = { provider, event: { ...event, seq: compareSeq[provider]++, at: Date.now() } };
    for (const l of [...compareListeners]) l(full);
  };
  return Object.assign(api, { emit, emitCompare });
}
