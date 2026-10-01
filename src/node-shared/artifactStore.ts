import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ArtifactIdSchema,
  ChartArtifactSchema,
  ReportArtifactSchema,
  type ChartArtifact,
  type ReportArtifact,
} from '../shared/artifacts';
import { writeFileAtomic } from './atomicFile';

/**
 * Charts and reports on disk (userData/artifacts/{charts,reports}/<uuid>.json).
 * Written by datadesk-mcp, read by the main process. Ids are UUIDs validated before use, so a
 * request can never name a path outside the store.
 */
export class ArtifactStore {
  constructor(private readonly dir: string) {}

  saveChart(chart: ChartArtifact): Promise<void> {
    const valid = ChartArtifactSchema.parse(chart);
    return writeFileAtomic(this.path('charts', valid.id), JSON.stringify(valid));
  }

  saveReport(report: ReportArtifact): Promise<void> {
    const valid = ReportArtifactSchema.parse(report);
    return writeFileAtomic(this.path('reports', valid.id), JSON.stringify(valid, null, 2));
  }

  async getChart(id: string): Promise<ChartArtifact | undefined> {
    const raw = await this.read('charts', id);
    return raw === undefined ? undefined : ChartArtifactSchema.parse(raw);
  }

  async getReport(id: string): Promise<ReportArtifact | undefined> {
    const raw = await this.read('reports', id);
    return raw === undefined ? undefined : ReportArtifactSchema.parse(raw);
  }

  private path(kind: 'charts' | 'reports', id: string): string {
    return join(this.dir, kind, `${ArtifactIdSchema.parse(id)}.json`);
  }

  private async read(kind: 'charts' | 'reports', id: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(this.path(kind, id), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
}
