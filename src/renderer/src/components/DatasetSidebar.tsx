import { useCallback, useState, type DragEvent } from 'react';
import { useApi } from '../api';
import { useIpcQuery } from '../useIpcQuery';
import { Panel } from './Panel';

interface Props {
  selected: string | null;
  onSelect: (name: string | null) => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function DatasetSidebar({ selected, onSelect }: Props) {
  const api = useApi();
  // Bumping the version re-runs the list query (after a registration).
  const [listVersion, setListVersion] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const loadList = useCallback(() => api.datasets.list(), [api]);
  const loadSchema = useCallback((name: string) => api.datasets.schema(name), [api]);
  const list = useIpcQuery(`v${String(listVersion)}`, loadList);
  const schemaQuery = useIpcQuery(selected, loadSchema);

  const datasets = list.data ?? list.stale ?? [];
  const schema = schemaQuery.data;
  const error = actionError ?? list.error ?? schemaQuery.error;

  async function addFiles(files: File[]) {
    setBusy(true);
    setActionError(null);
    let last: string | null = null;
    try {
      for (const file of files) {
        const result = await api.datasets.registerFile(file);
        if (result.ok) last = result.data.name;
        else setActionError(`${file.name}: ${result.error.message}`);
      }
      setListVersion((v) => v + 1);
      if (last) onSelect(last);
    } finally {
      setBusy(false);
    }
  }

  async function pick() {
    setBusy(true);
    setActionError(null);
    try {
      const result = await api.datasets.pick();
      if (!result.ok) setActionError(result.error.message);
      else if (result.data) {
        setListVersion((v) => v + 1);
        onSelect(result.data.name);
      }
    } finally {
      setBusy(false);
    }
  }

  function onDragOver(event: DragEvent) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void addFiles(files);
  }

  return (
    <Panel title="Datasets" className="w-72 shrink-0 border-r border-slate-800">
      <div
        data-testid="dataset-dropzone"
        onDragOver={onDragOver}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
        className={`flex min-h-full flex-col gap-3 rounded-lg ${
          dragging ? 'outline-2 outline-sky-500 outline-dashed' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => void pick()}
          disabled={busy}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
        >
          {busy ? 'Adding…' : 'Add file…'}
        </button>
        <p className="text-xs text-slate-500">
          Or drop CSV, Excel, Parquet or JSON files anywhere in this panel.
        </p>

        {error && (
          <p role="alert" className="rounded bg-red-950 px-2 py-1.5 text-xs text-red-300">
            {error}
          </p>
        )}

        {datasets.length === 0 ? (
          <p className="text-sm text-slate-500">No datasets yet.</p>
        ) : (
          <ul aria-label="Registered datasets" className="space-y-1">
            {datasets.map((d) => (
              <li key={d.name}>
                <button
                  type="button"
                  aria-current={selected === d.name}
                  onClick={() => {
                    onSelect(selected === d.name ? null : d.name);
                  }}
                  className={`w-full rounded px-2 py-1.5 text-left hover:bg-slate-800 ${
                    selected === d.name ? 'bg-slate-800' : ''
                  }`}
                >
                  <span className="block font-mono text-sm">{d.name}</span>
                  <span className="block text-xs text-slate-500">
                    {d.error
                      ? `⚠ ${d.error}`
                      : `${d.format.toUpperCase()} · ${String(d.rowCount ?? '?')} rows · ${String(
                          d.columnCount ?? '?',
                        )} cols · ${formatBytes(d.sizeBytes)}`}
                  </span>
                </button>
                {selected === d.name && schema && (
                  <ul
                    aria-label={`Columns of ${d.name}`}
                    className="mt-1 ml-3 space-y-0.5 border-l border-slate-800 pl-2"
                  >
                    {schema.map((c) => (
                      <li key={c.name} className="flex justify-between gap-2 text-xs">
                        <span className="truncate font-mono">{c.name}</span>
                        <span className="shrink-0 text-slate-500">{c.type}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
