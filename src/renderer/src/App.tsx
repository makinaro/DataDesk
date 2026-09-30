import { useState } from 'react';
import { SettingsDialog } from './components/SettingsDialog';

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
      <h1 className="text-2xl font-semibold">DataDesk</h1>
      <button
        type="button"
        onClick={() => {
          setSettingsOpen(true);
        }}
        className="rounded border border-slate-700 px-3 py-1 hover:bg-slate-800"
      >
        Settings
      </button>
      {settingsOpen && (
        <SettingsDialog
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
    </main>
  );
}
