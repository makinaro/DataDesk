import { writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { ArtifactStore } from '../../../node-shared/artifactStore';
import type { ChartArtifact } from '../../../shared/artifacts';
import { IpcChannels } from '../../../shared/ipc/channels';
import {
  buildMarkdownExport,
  buildPrintDocument,
  safeFileStem,
} from '../../artifacts/reportExport';
import { IpcUserError } from '../errors';
import type { IpcHandle } from '../router';

export interface ArtifactHandlerDeps {
  store: Pick<ArtifactStore, 'getChart' | 'getReport'>;
  /** Main-process save dialog; resolves to a path or null if cancelled. */
  pickSavePath: (defaultName: string, format: 'md' | 'pdf') => Promise<string | null>;
  printToPdf: (html: string) => Promise<Buffer>;
  /** Renders a stored chart to SVG (headless Vega in main); null if it can't be rendered. */
  renderSvg: (chart: ChartArtifact) => Promise<string | null>;
  writeFile?: (path: string, data: string | Buffer) => Promise<void>;
}

export function registerArtifactHandlers(handle: IpcHandle, deps: ArtifactHandlerDeps): void {
  const write = deps.writeFile ?? ((path, data) => writeFile(path, data));

  handle(IpcChannels.artifactsGetChart, async ({ id }) => {
    const chart = await deps.store.getChart(id);
    if (!chart) throw new IpcUserError('REJECTED', 'That chart no longer exists.');
    return chart;
  });

  handle(IpcChannels.artifactsGetReport, async ({ id }) => {
    const report = await deps.store.getReport(id);
    if (!report) throw new IpcUserError('REJECTED', 'That report no longer exists.');
    return report;
  });

  handle(IpcChannels.artifactsExportReport, async ({ id, format, bodyHtml }) => {
    const report = await deps.store.getReport(id);
    if (!report) throw new IpcUserError('REJECTED', 'That report no longer exists.');
    if (format === 'pdf' && bodyHtml === undefined) {
      throw new IpcUserError('INVALID_REQUEST', 'Missing report body.');
    }

    const stem = safeFileStem(report.title);
    const path = await deps.pickSavePath(`${stem}.${format}`, format);
    if (path === null) return { saved: false, path: null };

    if (format === 'md') {
      const titles: Record<string, string> = {};
      const svgs: Record<string, string> = {};
      for (const chartId of report.chartIds) {
        const chart = await deps.store.getChart(chartId);
        titles[chartId] = chart?.title ?? 'Chart';
        const svg = chart ? await deps.renderSvg(chart) : null;
        if (svg !== null) svgs[chartId] = svg;
      }
      const fileStem = basename(path).replace(/\.md$/i, '');
      const out = buildMarkdownExport(report, titles, svgs, fileStem);
      await write(path, out.markdown);
      for (const f of out.files) await write(join(dirname(path), f.name), f.content);
      return { saved: true, path };
    }

    // The body comes from the renderer; it is printed with JavaScript off, behind main's own
    // CSP and a request filter (see printPdf.ts), so it can't run script or load anything.
    const pdf = await deps.printToPdf(buildPrintDocument(report.title, bodyHtml ?? ''));
    await write(path, pdf);
    return { saved: true, path };
  });
}
