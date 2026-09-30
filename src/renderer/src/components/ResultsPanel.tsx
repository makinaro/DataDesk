import { useCallback } from 'react';
import type { Cell } from '../../../shared/datasets';
import { useApi } from '../api';
import { useIpcQuery } from '../useIpcQuery';
import { datasetKey, nameFromKey } from './DatasetSidebar';
import { ComingSoon, Panel } from './Panel';

const PREVIEW_ROWS = 20;

function renderCell(value: Cell): string {
  if (value === null) return '∅';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function ResultsPanel({ dataset, revision }: { dataset: string | null; revision: number }) {
  const api = useApi();
  const loadPreview = useCallback(
    (key: string) => api.datasets.preview(nameFromKey(key), PREVIEW_ROWS),
    [api],
  );
  const { data: preview, error } = useIpcQuery(datasetKey(dataset, revision), loadPreview);

  return (
    <Panel title="Charts & report" className="w-[480px] shrink-0 border-l border-slate-800">
      {!dataset && (
        <ComingSoon phase={3}>
          Vega-Lite charts and exportable Markdown/PDF reports. Select a dataset to preview it.
        </ComingSoon>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {dataset && preview && (
        <figure>
          <figcaption className="mb-2 text-sm text-slate-400">
            Preview of <span className="font-mono text-slate-200">{dataset}</span> (first{' '}
            {preview.rowCount} rows)
          </figcaption>
          <div className="overflow-auto rounded border border-slate-800">
            <table aria-label={`Preview of ${dataset}`} className="w-full text-xs">
              <thead className="bg-slate-900">
                <tr>
                  {preview.columns.map((c) => (
                    <th key={c.name} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                      {c.name}
                      <span className="ml-1 font-normal text-slate-500">{c.type}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="odd:bg-slate-950 even:bg-slate-900/50">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 font-mono whitespace-nowrap">
                        {renderCell(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      )}
    </Panel>
  );
}
