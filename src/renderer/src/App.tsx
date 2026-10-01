import { useState } from 'react';
import { ApprovalDialog } from './components/ApprovalDialog';
import { ChatPanel } from './components/ChatPanel';
import { CompareView } from './components/CompareView';
import { DatasetSidebar } from './components/DatasetSidebar';
import { ResultsPanel } from './components/ResultsPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { TimelineDrawer } from './components/TimelineDrawer';
import { CompareIcon, SettingsIcon, TimelineIcon } from './components/icons';
import { TitleBar, TitleBarButton } from './components/TitleBar';

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [datasetsRevision, setDatasetsRevision] = useState(0);

  return (
    <div className="flex h-screen flex-col text-fg">
      <TitleBar>
        <span className="flex-1" />
        <nav aria-label="App" className="flex items-center gap-1">
          <TitleBarButton
            label="Compare"
            icon={<CompareIcon />}
            pressed={comparing}
            onClick={() => {
              setComparing((on) => !on);
            }}
          />
          <TitleBarButton
            label="Timeline"
            icon={<TimelineIcon />}
            pressed={timelineOpen}
            onClick={() => {
              setTimelineOpen((open) => !open);
            }}
          />
          <TitleBarButton
            label="Settings"
            icon={<SettingsIcon />}
            onClick={() => {
              setSettingsOpen(true);
            }}
          />
        </nav>
      </TitleBar>

      <main className="flex min-h-0 flex-1">
        <DatasetSidebar
          selected={selectedDataset}
          onSelect={setSelectedDataset}
          revision={datasetsRevision}
          onChanged={() => {
            setDatasetsRevision((r) => r + 1);
          }}
        />
        {comparing ? (
          // The chat stays mounted state-wise (AgentProvider), so its conversation survives.
          <CompareView />
        ) : (
          <>
            <ChatPanel />
            <ResultsPanel dataset={selectedDataset} revision={datasetsRevision} />
          </>
        )}
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
