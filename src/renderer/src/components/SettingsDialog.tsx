import { useEffect, useId, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import type { Provider, SecretsStatus } from '../../../shared/ipc/contract';
import type { IpcResult } from '../../../shared/ipc/result';
import { useApi } from '../api';
import { AnalystSettingsForm } from './AnalystSettingsForm';
import { AppearanceSettings } from './AppearanceSettings';

const TABS = ['API keys', 'Analyst', 'Appearance'] as const;
type Tab = (typeof TABS)[number];

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: 'anthropic', label: 'Anthropic', hint: 'Runs the analyst agent.' },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'Enables column search and second-opinion tools. When the analyst uses them, OpenAI receives column names and types, a few sample values, the search wording, and for second opinions the question, the SQL, a preview of up to 50 result rows and the draft answer. If you also choose OpenAI as the analyst’s provider (below), OpenAI receives the whole conversation: your messages, the analyst’s instructions, and every tool call and result, including schemas, sample rows and query results. Requests are sent with storage off and tracing disabled; OpenAI’s API data policy still applies. Changing this key starts a new conversation.',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    hint: 'Lets the analyst search the Hugging Face Hub and download datasets. Hugging Face receives the search words the analyst writes, the dataset ids and files it looks at, and your token. DataDesk never uploads your files. The token also lets it see and download any private or gated datasets your account can access; use a read-only token. Every download asks you first and is capped at 500 MB; files are kept in DataDesk’s data folder. Changing this token starts a new conversation.',
  },
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
  const [tab, setTab] = useState<Tab>('API keys');
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  const panelId = useId();

  // WAI-ARIA tabs: arrow keys move between tabs and select them.
  function onTabKeyDown(event: KeyboardEvent) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length] ?? tab;
    setTab(next);
    tabRefs.current.get(next)?.focus();
  }

  useEffect(() => {
    void api.secrets.status().then((result) => {
      if (result.ok) setStatus(result.data);
      else setError(result.error.message);
    });
  }, [api]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 id={titleId} className="text-lg font-semibold">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-muted hover:bg-raised hover:text-fg"
          >
            Close
          </button>
        </div>
        <div
          role="tablist"
          aria-label="Settings sections"
          onKeyDown={onTabKeyDown}
          className="mt-3 flex gap-1 border-b border-line px-6"
        >
          {TABS.map((t) => (
            <button
              key={t}
              ref={(el) => {
                if (el) tabRefs.current.set(t, el);
                else tabRefs.current.delete(t);
              }}
              type="button"
              role="tab"
              aria-selected={tab === t}
              aria-controls={panelId}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => {
                setTab(t);
              }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === t ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div id={panelId} role="tabpanel" aria-label={tab} className="overflow-auto px-6 py-5">
          {tab === 'API keys' && (
            <>
              <p className="mb-4 text-sm text-muted">
                Keys are encrypted by your operating system and stay in the app&apos;s main process.
                They can be replaced or removed, but never displayed.
              </p>
              {error && (
                <p
                  role="alert"
                  className="mb-4 rounded bg-danger-soft px-3 py-2 text-sm text-danger"
                >
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
            </>
          )}
          {tab === 'Analyst' && <AnalystSettingsForm />}
          {tab === 'Appearance' && <AppearanceSettings />}
        </div>
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

  /** Runs an IPC call, always clearing `busy`, even if the bridge itself rejects. */
  async function run(call: () => Promise<IpcResult<SecretsStatus>>) {
    setBusy(true);
    try {
      const result = await call();
      if (result.ok) {
        onStatus(result.data);
        onError(null);
      } else {
        onError(result.error.message);
      }
    } catch {
      onError('Could not reach the app backend. Try restarting DataDesk.');
    } finally {
      setBusy(false);
    }
  }

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    const key = draft;
    setDraft('');
    await run(() => api.secrets.set(provider, key));
  }

  async function clear() {
    await run(() => api.secrets.clear(provider));
  }

  return (
    <li className="rounded-lg border border-line p-3">
      <form onSubmit={(e) => void save(e)} className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="font-medium">
            {label}
          </label>
          <span
            data-testid={`status-${provider}`}
            className={`rounded-full px-2 py-0.5 text-xs ${
              isSet ? 'bg-raised text-ok' : 'bg-raised text-muted'
            }`}
          >
            {isSet ? 'Set' : 'Not set'}
          </span>
        </div>
        <p className="text-xs text-faint">{hint}</p>
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
            className="min-w-0 flex-1 rounded border border-strong bg-canvas px-2 py-1 text-sm"
          />
          <button
            type="submit"
            aria-label={`Save ${label} key`}
            disabled={busy || draft.trim().length === 0}
            className="rounded bg-accent px-3 py-1 text-sm text-on-accent hover:bg-accent-hover disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            aria-label={`Clear ${label} key`}
            onClick={() => void clear()}
            disabled={busy || !isSet}
            className="rounded border border-strong px-3 py-1 text-sm hover:bg-raised disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </form>
    </li>
  );
}
