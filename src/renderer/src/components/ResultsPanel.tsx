import { useCallback, useState, type CSSProperties } from 'react';
import type { Cell } from '../../../shared/datasets';
import { useAgent } from '../agent/AgentProvider';
import type { ArtifactRef } from '../agent/agentState';
import { useApi } from '../api';
import { useIpcQuery } from '../useIpcQuery';
import { ChartView } from './ChartView';
import { datasetKey, nameFromKey } from './DatasetSidebar';
import { Panel } from './Panel';
import { ReportView } from './ReportView';

const PREVIEW_ROWS = 20;
const PREVIEW = 'preview';

function renderCell(value: Cell): string {
  if (value === null) return '∅';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

interface Selection {
  choice: string;
  /** The newest artifact when the choice was made; a different newest one takes over. */
  seenNewestId: string | null;
}

/**
 * Which tab to show, derived during render (no setState in effects): an artifact newer than
 * the last choice wins; otherwise the choice, if it still exists (a reset clears artifacts).
 */
export function visibleTab(artifacts: readonly ArtifactRef[], selection: Selection): string {
  const newest = artifacts.at(-1);
  if (newest && newest.id !== selection.seenNewestId) return newest.id;
  if (selection.choice === PREVIEW || artifacts.some((a) => a.id === selection.choice)) {
    return selection.choice;
  }
  return PREVIEW;
}

/** A request from the chat to show an artifact; `n` makes repeat clicks on one chip count. */
export interface FocusRequest {
  id: string;
  n: number;
}

export function ResultsPanel({
  dataset,
  revision,
  focus = null,
  className = '',
  style,
}: {
  dataset: string | null;
  revision: number;
  focus?: FocusRequest | null;
  className?: string;
  style?: CSSProperties;
}) {
  const { state } = useAgent();
  const artifacts = state.artifacts;
  const newestId = artifacts.at(-1)?.id ?? null;
  const [selection, setSelection] = useState<Selection>({ choice: PREVIEW, seenNewestId: null });
  // Picking a dataset counts as choosing its preview ("previous props" pattern: adjust state
  // while rendering instead of in an effect). Whichever happened last, artifact or pick, wins.
  const [prevDataset, setPrevDataset] = useState(dataset);
  if (dataset !== prevDataset) {
    setPrevDataset(dataset);
    if (dataset !== null) setSelection({ choice: PREVIEW, seenNewestId: newestId });
  }
  const [prevFocus, setPrevFocus] = useState(focus);
  if (focus !== prevFocus) {
    setPrevFocus(focus);
    if (focus) setSelection({ choice: focus.id, seenNewestId: newestId });
  }
  const tab = visibleTab(artifacts, selection);
  const active = artifacts.find((a) => a.id === tab);
  const choose = (choice: string) => {
    setSelection({ choice, seenNewestId: newestId });
  };

  return (
    <Panel title="Charts & report" style={style} className={`min-w-0 ${className}`}>
      <div role="tablist" aria-label="Results" className="mb-3 flex flex-wrap gap-1 text-xs">
        <TabButton
          selected={tab === PREVIEW}
          onClick={() => {
            choose(PREVIEW);
          }}
        >
          Data preview
        </TabButton>
        {artifacts.map((a) => (
          <TabButton
            key={a.id}
            selected={tab === a.id}
            onClick={() => {
              choose(a.id);
            }}
          >
            <span className="text-faint">{a.kind === 'chart' ? 'Chart' : 'Report'} · </span>
            {a.title}
          </TabButton>
        ))}
      </div>
      <div role="tabpanel">
        {active?.kind === 'chart' && <ChartView key={active.id} id={active.id} />}
        {active?.kind === 'report' && <ReportView key={active.id} id={active.id} />}
        {!active && <DatasetPreview dataset={dataset} revision={revision} />}
      </div>
    </Panel>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`max-w-[220px] truncate rounded border px-2 py-1 ${
        selected ? 'border-fg bg-strong text-fg' : 'border-strong text-muted hover:bg-raised'
      }`}
    >
      {children}
    </button>
  );
}

function DatasetPreview({ dataset, revision }: { dataset: string | null; revision: number }) {
  const api = useApi();
  const loadPreview = useCallback(
    (key: string) => api.datasets.preview(nameFromKey(key), PREVIEW_ROWS),
    [api],
  );
  const { data: preview, error } = useIpcQuery(datasetKey(dataset, revision), loadPreview);

  if (!dataset) {
    return (
      <p className="rounded-lg border border-dashed border-strong p-4 text-sm text-faint">
        Select a dataset to preview it. Charts and reports the analyst creates appear here as tabs.
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!preview) return null;
  return (
    <figure>
      <figcaption className="mb-2 text-sm text-muted">
        Preview of <span className="font-mono text-fg">{dataset}</span> (first {preview.rowCount}{' '}
        rows)
      </figcaption>
      <div className="overflow-auto rounded border border-line">
        <table aria-label={`Preview of ${dataset}`} className="w-full text-xs">
          <thead className="bg-surface">
            <tr>
              {preview.columns.map((c) => (
                <th key={c.name} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                  {c.name}
                  <span className="ml-1 font-normal text-faint">{c.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i} className="odd:bg-canvas even:bg-surface">
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
  );
}
