import { useCallback, useState } from 'react';
import type { Layout } from '../../shared/appearance';
import { ApprovalDialog } from './components/ApprovalDialog';
import { ChatPanel } from './components/ChatPanel';
import { CompareView } from './components/CompareView';
import { DatasetSidebar } from './components/DatasetSidebar';
import { ResultsPanel, type FocusRequest } from './components/ResultsPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { TimelineDrawer } from './components/TimelineDrawer';
import { CompareIcon, SettingsIcon, TimelineIcon } from './components/icons';
import { TitleBar, TitleBarButton } from './components/TitleBar';
import { useAppearance } from './appearance/AppearanceProvider';
import { PANEL_LIMITS, usePanelSizes, type PanelKey } from './layout/panelSizes';
import { Splitter } from './layout/Splitter';
import { ResultsFocusProvider } from './results/ResultsFocus';

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Results-first shows each turn's steps inline in the chat, so its drawer starts closed.
  const [timelineByLayout, setTimelineByLayout] = useState<Record<Layout, boolean>>({
    'chat-first': true,
    'results-first': false,
  });
  const [comparing, setComparing] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [datasetsRevision, setDatasetsRevision] = useState(0);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const { appearance } = useAppearance();
  const layout = appearance.layout;
  const timelineOpen = timelineByLayout[layout];
  const [sizes, setSize] = usePanelSizes(layout);
  const splitter = (key: PanelKey, label: string, panel: 'before' | 'after') => (
    <Splitter
      label={label}
      orientation={key === 'timeline' ? 'horizontal' : 'vertical'}
      value={sizes[key]}
      min={PANEL_LIMITS[key].min}
      max={PANEL_LIMITS[key].max}
      panel={panel}
      onChange={(px) => {
        setSize(key, px);
      }}
    />
  );
  const focusArtifact = useCallback((id: string) => {
    setFocus((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
  }, []);
  const results = (className: string, width?: number) => (
    <ResultsPanel
      dataset={selectedDataset}
      revision={datasetsRevision}
      focus={focus}
      className={className}
      style={width === undefined ? undefined : { width }}
    />
  );

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
              setTimelineByLayout((open) => ({ ...open, [layout]: !open[layout] }));
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

      <ResultsFocusProvider onFocus={focusArtifact}>
        <main className="flex min-h-0 flex-1">
          <DatasetSidebar
            selected={selectedDataset}
            onSelect={setSelectedDataset}
            revision={datasetsRevision}
            onChanged={() => {
              setDatasetsRevision((r) => r + 1);
            }}
            style={{ width: sizes.sidebar }}
          />
          {splitter('sidebar', 'Resize datasets', 'before')}
          <div className="flex min-w-0 flex-1 flex-col">
            {comparing ? (
              // The chat stays mounted state-wise (AgentProvider), so its conversation survives.
              <CompareView />
            ) : layout === 'results-first' ? (
              results('min-h-0 flex-1')
            ) : (
              <ChatPanel className="flex-1" />
            )}
            {timelineOpen && (
              <>
                {splitter('timeline', 'Resize timeline', 'after')}
                <TimelineDrawer style={{ height: sizes.timeline }} />
              </>
            )}
          </div>
          {!comparing &&
            (layout === 'results-first' ? (
              <>
                {splitter('side', 'Resize chat', 'after')}
                <ChatPanel docked className="shrink-0" style={{ width: sizes.side }} />
              </>
            ) : (
              <>
                {splitter('side', 'Resize results', 'after')}
                {results('shrink-0', sizes.side)}
              </>
            ))}
        </main>
      </ResultsFocusProvider>

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
