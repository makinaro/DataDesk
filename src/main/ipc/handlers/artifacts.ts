import { writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { ArtifactStore } from '../../../node-shared/artifactStore';
import { IpcChannels } from '../../../shared/ipc/channels';
import {
  buildMarkdownExport,
  buildPrintDocument,
  isSafeSvg,
  safeFileStem,
} from '../../artifacts/reportExport';
import { IpcUserError } from '../errors';
import type { IpcHandle } from '../router';

export interface ArtifactHandlerDeps {
  store: Pick<ArtifactStore, 'getChart' | 'getReport'>;
  /** Main-process save dialog; resolves to a path or null if cancelled. */
  pickSavePath: (defaultName: string, format: 'md' | 'pdf') => Promise<string | null>;
  printToPdf: (html: string) => Promise<Buffer>;
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

  handle(IpcChannels.artifactsExportReport, async ({ id, format, svgs, bodyHtml }) => {
    const report = await deps.store.getReport(id);
    if (!report) throw new IpcUserError('REJECTED', 'That report no longer exists.');
    const unsafe = Object.entries(svgs).filter(([, svg]) => !isSafeSvg(svg));
    if (unsafe.length > 0) throw new IpcUserError('INVALID_REQUEST', 'A chart image was rejected.');

    const stem = safeFileStem(report.title);
    const path = await deps.pickSavePath(`${stem}.${format}`, format);
    if (path === null) return { saved: false, path: null };

    if (format === 'md') {
      const titles: Record<string, string> = {};
      for (const chartId of report.chartIds) {
        titles[chartId] = (await deps.store.getChart(chartId))?.title ?? 'Chart';
      }
      const fileStem = basename(path).replace(/\.md$/i, '');
      const out = buildMarkdownExport(report, titles, svgs, fileStem);
      await write(path, out.markdown);
      for (const f of out.files) await write(join(dirname(path), f.name), f.content);
      return { saved: true, path };
    }

    if (bodyHtml === undefined) throw new IpcUserError('INVALID_REQUEST', 'Missing report body.');
    const pdf = await deps.printToPdf(buildPrintDocument(report.title, bodyHtml));
    await write(path, pdf);
    return { saved: true, path };
  });
}
