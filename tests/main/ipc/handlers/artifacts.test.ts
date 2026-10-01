import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import {
  registerArtifactHandlers,
  type ArtifactHandlerDeps,
} from '../../../../src/main/ipc/handlers/artifacts';
import { createIpcRouter } from '../../../../src/main/ipc/router';
import type { ChartArtifact, ReportArtifact } from '../../../../src/shared/artifacts';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const CHART_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_ID = '22222222-2222-4222-8222-222222222222';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

const chart: ChartArtifact = {
  id: CHART_ID,
  kind: 'chart',
  title: 'Units',
  spec: { mark: 'bar', data: { values: [] } },
  sql: 'SELECT 1',
  rowCount: 0,
  truncated: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};
const report: ReportArtifact = {
  id: REPORT_ID,
  kind: 'report',
  title: 'Sales: Q3',
  markdown: `# Sales\n\n[[chart:${CHART_ID}]]`,
  chartIds: [CHART_ID],
  createdAt: '2026-10-01T00:00:00.000Z',
};

function wire(overrides: Partial<ArtifactHandlerDeps> = {}) {
  const listeners = new Map<string, Listener>();
  const handle = createIpcRouter({
    ipcMain: { handle: (c, l) => listeners.set(c, l) },
    isTrustedSender: () => true,
  });
  const writes: [string, string | Buffer][] = [];
  const deps: ArtifactHandlerDeps = {
    store: {
      getChart: (id) => Promise.resolve(id === CHART_ID ? chart : undefined),
      getReport: (id) => Promise.resolve(id === REPORT_ID ? report : undefined),
    },
    pickSavePath: vi.fn((name: string) => Promise.resolve(`C:\\out\\${name}`)),
    printToPdf: vi.fn(() => Promise.resolve(Buffer.from('%PDF-1.7'))),
    renderSvg: vi.fn(() => Promise.resolve<string | null>(SVG)),
    writeFile: (path, data) => {
      writes.push([path, data]);
      return Promise.resolve();
    },
    ...overrides,
  };
  registerArtifactHandlers(handle, deps);
  const call = (channel: string, payload?: unknown) =>
    listeners.get(channel)?.({} as IpcMainInvokeEvent, payload);
  return { call, deps, writes, channels: [...listeners.keys()] };
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest'),
]).toString('base64');

describe('artifacts:exportChart', () => {
  it('writes the PNG the renderer drew, named after the chart', async () => {
    const { call, deps, writes } = wire();
    await expect(
      call('artifacts:exportChart', { id: CHART_ID, format: 'png', pngBase64: PNG }),
    ).resolves.toEqual({ ok: true, data: { saved: true, path: 'C:\\out\\Units.png' } });
    expect(deps.pickSavePath).toHaveBeenCalledWith('Units.png', 'png');
    expect(writes).toEqual([['C:\\out\\Units.png', Buffer.from(PNG, 'base64')]]);
  });

  it('refuses bytes that are not a PNG', async () => {
    const { call, writes, deps } = wire();
    const notPng = Buffer.from('<svg onload="x()"/>').toString('base64');
    await expect(
      call('artifacts:exportChart', { id: CHART_ID, format: 'png', pngBase64: notPng }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(deps.pickSavePath).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('renders SVG in main, in the requested theme, and never takes markup from the page', async () => {
    const { call, deps, writes } = wire();
    await call('artifacts:exportChart', { id: CHART_ID, format: 'svg', theme: 'slate' });
    expect(deps.renderSvg).toHaveBeenCalledWith(chart, 'slate');
    expect(writes).toEqual([['C:\\out\\Units.svg', SVG]]);
    await expect(
      call('artifacts:exportChart', { id: CHART_ID, format: 'svg', theme: 'slate', svg: SVG }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  });

  it('writes nothing when the dialog is cancelled or the chart is gone', async () => {
    const { call, writes } = wire({ pickSavePath: vi.fn(() => Promise.resolve(null)) });
    await expect(
      call('artifacts:exportChart', { id: CHART_ID, format: 'svg', theme: 'dark' }),
    ).resolves.toEqual({ ok: true, data: { saved: false, path: null } });
    await expect(
      call('artifacts:exportChart', {
        id: '99999999-9999-4999-8999-999999999999',
        format: 'svg',
        theme: 'dark',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'REJECTED' } });
    expect(writes).toEqual([]);
  });
});

describe('artifact IPC handlers', () => {
  it('registers get/export channels only', () => {
    expect(wire().channels.sort()).toEqual([
      'artifacts:exportChart',
      'artifacts:exportReport',
      'artifacts:getChart',
      'artifacts:getReport',
    ]);
  });

  it('loads artifacts by id and rejects unknown or malformed ids', async () => {
    const { call } = wire();
    await expect(call('artifacts:getChart', { id: CHART_ID })).resolves.toEqual({
      ok: true,
      data: chart,
    });
    await expect(call('artifacts:getReport', { id: CHART_ID })).resolves.toMatchObject({
      ok: false,
      error: { code: 'REJECTED' },
    });
    await expect(call('artifacts:getChart', { id: '../secrets' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
  });

  it('exports Markdown entirely from stored artifacts, with SVGs rendered in main', async () => {
    const { call, writes, deps } = wire();
    const result = await call('artifacts:exportReport', { id: REPORT_ID, format: 'md' });
    expect(result).toEqual({ ok: true, data: { saved: true, path: 'C:\\out\\Sales Q3.md' } });
    expect(deps.pickSavePath).toHaveBeenCalledWith('Sales Q3.md', 'md');
    expect(deps.renderSvg).toHaveBeenCalledWith(chart);
    expect(writes.map(([p]) => p)).toEqual([
      'C:\\out\\Sales Q3.md',
      expect.stringMatching(/[\\/]Sales Q3-chart-1\.svg$/) as string,
    ]);
    expect(writes[0]?.[1]).toContain('![Units](Sales%20Q3-chart-1.svg)');
    expect(writes[1]?.[1]).toBe(SVG);
  });

  it('writes a placeholder instead of an SVG for a chart main could not render', async () => {
    const { call, writes } = wire({ renderSvg: () => Promise.resolve(null) });
    await call('artifacts:exportReport', { id: REPORT_ID, format: 'md' });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[1]).toContain('*[Units: chart not available]*');
  });

  it('prints PDFs through the locked-down print document', async () => {
    const { call, writes, deps } = wire();
    const result = await call('artifacts:exportReport', {
      id: REPORT_ID,
      format: 'pdf',
      bodyHtml: '<h1>Sales</h1>',
    });
    expect(result).toMatchObject({ ok: true, data: { saved: true } });
    const html = vi.mocked(deps.printToPdf).mock.calls[0]?.[0] ?? '';
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('<body><h1>Sales</h1></body>');
    expect(writes).toHaveLength(1);
  });

  it('writes nothing when the user cancels the save dialog', async () => {
    const { call, writes } = wire({ pickSavePath: () => Promise.resolve(null) });
    await expect(call('artifacts:exportReport', { id: REPORT_ID, format: 'md' })).resolves.toEqual({
      ok: true,
      data: { saved: false, path: null },
    });
    expect(writes).toEqual([]);
  });

  it('rejects renderer SVGs and PDF exports without a body, before opening a dialog', async () => {
    const { call, deps } = wire();
    await expect(
      call('artifacts:exportReport', { id: REPORT_ID, format: 'md', svgs: { [CHART_ID]: SVG } }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    await expect(
      call('artifacts:exportReport', { id: REPORT_ID, format: 'pdf' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(deps.pickSavePath).not.toHaveBeenCalled();
  });
});
