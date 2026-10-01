import {
  useCallback,
  useRef,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';
import type { Cell } from '../../../shared/datasets';
import { useAgent } from '../agent/AgentProvider';
import { useApi } from '../api';
import { closeTab, openTab, PREVIEW_TAB, type TabsState } from '../results/resultTabs';
import { useIpcQuery } from '../useIpcQuery';
import { ChartView } from './ChartView';
import { datasetKey, nameFromKey } from './DatasetSidebar';
import { CloseIcon } from './icons';
import { Panel } from './Panel';
import { ReportView } from './ReportView';

const PREVIEW_ROWS = 20;

function renderCell(value: Cell): string {
  if (value === null) return '∅';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function ResultsPanel({
  dataset,
  revision,
  tabs,
  setTabs,
  className = '',
  style,
}: {
  dataset: string | null;
  revision: number;
  /** Owned by App (useResultTabs), so closed tabs stay closed across layout and compare. */
  tabs: TabsState;
  setTabs: Dispatch<SetStateAction<TabsState>>;
  className?: string;
  style?: CSSProperties;
}) {
  const { state } = useAgent();
  const artifacts = state.artifacts;
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const label = (id: string) => {
    const a = artifacts.find((x) => x.id === id);
    return a ? a.title : 'Data preview';
  };
  const active = artifacts.find((a) => a.id === tabs.active);

  function close(id: string) {
    const next = closeTab(tabs, id);
    setTabs(next);
    // Keep keyboard focus in the strip: on the tab that took over, if any.
    if (next.active) queueMicrotask(() => tabRefs.current.get(next.active ?? '')?.focus());
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const index = tabs.open.indexOf(id);
    const go = (to: number) => {
      event.preventDefault();
      const target = tabs.open[(to + tabs.open.length) % tabs.open.length];
      if (target === undefined) return;
      setTabs((t) => openTab(t, target));
      tabRefs.current.get(target)?.focus();
    };
    if (event.key === 'ArrowRight') go(index + 1);
    else if (event.key === 'ArrowLeft') go(index - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(tabs.open.length - 1);
    else if (event.key === 'Delete') {
      event.preventDefault();
      close(id);
    }
  }

  return (
    <Panel title="Charts & report" style={style} className={`min-w-0 ${className}`}>
      {tabs.open.length > 0 && (
        <div
          role="tablist"
          aria-label="Results"
          className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex overflow-x-auto border-b border-line bg-canvas px-2 text-xs"
        >
          {tabs.open.map((id) => {
            const artifact = artifacts.find((a) => a.id === id);
            const selected = tabs.active === id;
            return (
              <div
                key={id}
                className={`group -mb-px flex shrink-0 items-center border-b-2 ${
                  selected ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg'
                }`}
                onMouseDown={(event) => {
                  // Without this, Chromium starts middle-button autoscroll and no auxclick fires.
                  if (event.button === 1) event.preventDefault();
                }}
                onAuxClick={(event) => {
                  // Middle-click closes, as in browsers and VS Code.
                  if (event.button === 1) close(id);
                }}
              >
                <button
                  ref={(el) => {
                    if (el) tabRefs.current.set(id, el);
                    else tabRefs.current.delete(id);
                  }}
                  type="button"
                  role="tab"
                  id={`results-tab-${id}`}
                  aria-selected={selected}
                  aria-controls="results-tabpanel"
                  aria-keyshortcuts="Delete"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    setTabs((t) => openTab(t, id));
                  }}
                  onKeyDown={(event) => {
                    onTabKeyDown(event, id);
                  }}
                  className="max-w-[220px] truncate py-2 pl-2.5"
                >
                  {artifact && (
                    <span className="text-faint">
                      {artifact.kind === 'chart' ? 'Chart' : 'Report'} ·{' '}
                    </span>
                  )}
                  {label(id)}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${label(id)}`}
                  tabIndex={-1}
                  onClick={() => {
                    close(id);
                  }}
                  className={`mx-1 grid h-5 w-5 place-items-center rounded text-faint hover:bg-raised hover:text-fg ${
                    selected ? '' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <CloseIcon />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div
        role="tabpanel"
        id="results-tabpanel"
        aria-labelledby={tabs.active ? `results-tab-${tabs.active}` : undefined}
      >
        {active?.kind === 'chart' && <ChartView key={active.id} id={active.id} />}
        {active?.kind === 'report' && <ReportView key={active.id} id={active.id} />}
        {tabs.active === PREVIEW_TAB && <DatasetPreview dataset={dataset} revision={revision} />}
        {tabs.active === null && (
          <p className="rounded-lg border border-dashed border-strong p-4 text-sm text-faint">
            Nothing open. Pick a dataset to preview it, or click a chart in the chat.
          </p>
        )}
      </div>
    </Panel>
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
