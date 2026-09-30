import { useEffect, useId, useState, type SyntheticEvent } from 'react';
import type { Provider, SecretsStatus } from '../../../shared/ipc/contract';
import { useApi } from '../api';

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: 'anthropic', label: 'Anthropic', hint: 'Runs the analyst agent.' },
  { id: 'openai', label: 'OpenAI', hint: 'Column search and second-opinion tools.' },
  { id: 'huggingface', label: 'Hugging Face', hint: 'Dataset discovery and downloads.' },
];

interface Props {
  onClose: () => void;
}

/**
 * Keys go in and never come back out: the renderer only ever sees set/not-set booleans.
 * Inputs are cleared as soon as a key is submitted.
 */
export function SettingsDialog({ onClose }: Props) {
  const api = useApi();
  const titleId = useId();
  const [status, setStatus] = useState<SecretsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.secrets.status().then((result) => {
      if (result.ok) setStatus(result.data);
      else setError(result.error.message);
    });
  }, [api]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold">
            API keys
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            Close
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Keys are encrypted by your operating system and stay in the app&apos;s main process. They
          can be replaced or removed, but never displayed.
        </p>
        {error && (
          <p role="alert" className="mb-4 rounded bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <ul className="space-y-4">
          {PROVIDERS.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p.id}
              label={p.label}
              hint={p.hint}
              isSet={status?.[p.id] ?? false}
              onStatus={setStatus}
              onError={setError}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

interface RowProps {
  provider: Provider;
  label: string;
  hint: string;
  isSet: boolean;
  onStatus: (status: SecretsStatus) => void;
  onError: (message: string | null) => void;
}

function ProviderRow({ provider, label, hint, isSet, onStatus, onError }: RowProps) {
  const api = useApi();
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    const key = draft;
    setDraft('');
    setBusy(true);
    const result = await api.secrets.set(provider, key);
    setBusy(false);
    if (result.ok) {
      onStatus(result.data);
      onError(null);
    } else {
      onError(result.error.message);
    }
  }

  async function clear() {
    setBusy(true);
    const result = await api.secrets.clear(provider);
    setBusy(false);
    if (result.ok) onStatus(result.data);
    else onError(result.error.message);
  }

  return (
    <li className="rounded-lg border border-slate-800 p-3">
      <form onSubmit={(e) => void save(e)} className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="font-medium">
            {label}
          </label>
          <span
            data-testid={`status-${provider}`}
            className={`rounded-full px-2 py-0.5 text-xs ${
              isSet ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {isSet ? 'Set' : 'Not set'}
          </span>
        </div>
        <p className="text-xs text-slate-500">{hint}</p>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            placeholder={isSet ? 'Replace key…' : 'Paste key…'}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            aria-label={`Save ${label} key`}
            disabled={busy || draft.trim().length === 0}
            className="rounded bg-sky-700 px-3 py-1 text-sm hover:bg-sky-600 disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            aria-label={`Clear ${label} key`}
            onClick={() => void clear()}
            disabled={busy || !isSet}
            className="rounded border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </form>
    </li>
  );
}
