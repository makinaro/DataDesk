import { useState } from 'react';
import { ApprovalDialog } from './components/ApprovalDialog';
import { ChatPanel } from './components/ChatPanel';
import { DatasetSidebar } from './components/DatasetSidebar';
import { ResultsPanel } from './components/ResultsPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { TimelineDrawer } from './components/TimelineDrawer';

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [datasetsRevision, setDatasetsRevision] = useState(0);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <h1 className="text-base font-semibold">DataDesk</h1>
        <nav className="flex gap-2 text-sm">
          <button
            type="button"
            aria-pressed={timelineOpen}
            onClick={() => {
              setTimelineOpen((open) => !open);
            }}
            className="rounded border border-slate-700 px-3 py-1 hover:bg-slate-800"
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true);
            }}
            className="rounded border border-slate-700 px-3 py-1 hover:bg-slate-800"
          >
            Settings
          </button>
        </nav>
      </header>

      <main className="flex min-h-0 flex-1">
        <DatasetSidebar
          selected={selectedDataset}
          onSelect={setSelectedDataset}
          revision={datasetsRevision}
          onChanged={() => {
            setDatasetsRevision((r) => r + 1);
          }}
        />
        <ChatPanel />
        <ResultsPanel dataset={selectedDataset} revision={datasetsRevision} />
      </main>

      {timelineOpen && <TimelineDrawer />}

      <ApprovalDialog />

      {settingsOpen && (
        <SettingsDialog
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
