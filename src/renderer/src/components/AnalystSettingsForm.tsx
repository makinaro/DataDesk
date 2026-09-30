import { useEffect, useId, useState, type SyntheticEvent } from 'react';
import type { AgentSettings } from '../../../shared/agent';
import { useApi } from '../api';

const MODELS = [
  { value: 'sonnet', label: 'Sonnet (balanced, default)' },
  { value: 'opus', label: 'Opus (most capable)' },
  { value: 'haiku', label: 'Haiku (fastest, cheapest)' },
];

/** Model, spend cap and turn cap for the analyst. Saving starts a new conversation. */
export function AnalystSettingsForm() {
  const api = useApi();
  const ids = { model: useId(), budget: useId(), turns: useId() };
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api.settings.getAgent().then((result) => {
      if (result.ok) setSettings(result.data);
      else setMessage(result.error.message);
    });
  }, [api]);

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    if (!settings) return;
    const result = await api.settings.setAgent(settings);
    setMessage(result.ok ? 'Saved. New conversations use these settings.' : result.error.message);
  }

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={ids.model}>Model</label>
        <select
          id={ids.model}
          value={settings.model}
          onChange={(e) => {
            setSettings({ ...settings, model: e.target.value });
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={ids.budget}>Max spend per conversation (USD)</label>
        <input
          id={ids.budget}
          type="number"
          min={0.01}
          max={100}
          step={0.01}
          value={settings.maxBudgetUsd}
          onChange={(e) => {
            setSettings({ ...settings, maxBudgetUsd: Number(e.target.value) });
          }}
          className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={ids.turns}>Max steps per message</label>
        <input
          id={ids.turns}
          type="number"
          min={1}
          max={200}
          step={1}
          value={settings.maxTurns}
          onChange={(e) => {
            setSettings({ ...settings, maxTurns: Number(e.target.value) });
          }}
          className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{message}</span>
        <button type="submit" className="rounded bg-sky-700 px-3 py-1 hover:bg-sky-600">
          Save analyst settings
        </button>
      </div>
    </form>
  );
}
