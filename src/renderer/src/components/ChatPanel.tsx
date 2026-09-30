import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useAgent } from '../agent/AgentProvider';
import { Panel } from './Panel';

const BUSY = new Set(['starting', 'running', 'stopping']);

export function ChatPanel() {
  const { state, send, stop, reset } = useAgent();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = BUSY.has(state.status);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [state.messages]);

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setError(await send(text));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <Panel title="Chat" className="min-w-0 flex-1">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span data-testid="agent-status">
            {state.model ? `${state.model} · ` : ''}
            {state.status}
            {state.sessionCostUsd > 0 ? ` · $${state.sessionCostUsd.toFixed(4)}` : ''}
          </span>
          <button
            type="button"
            onClick={reset}
            disabled={state.messages.length === 0}
            className="rounded px-2 py-0.5 hover:bg-slate-800 disabled:opacity-40"
          >
            New conversation
          </button>
        </div>

        <ol aria-label="Conversation" className="flex-1 space-y-3 overflow-auto">
          {state.messages.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">
              Ask a question about your datasets, e.g. “Which region sold the most units?”
            </li>
          )}
          {state.messages.map((m) => (
            <li
              key={m.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user' ? 'ml-auto bg-sky-900/60' : 'bg-slate-900'
              }`}
            >
              <span className="sr-only">{m.role === 'user' ? 'You: ' : 'Analyst: '}</span>
              {m.text}
              {m.streaming && <span className="ml-1 animate-pulse text-slate-500">▍</span>}
            </li>
          ))}
          <div ref={endRef} />
        </ol>

        {error && (
          <p role="alert" className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={onKeyDown}
            placeholder="Ask about your data… (Enter to send, Shift+Enter for a new line)"
            className="h-20 flex-1 resize-none rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-red-800 px-4 text-sm text-red-300 hover:bg-red-950"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!draft.trim()}
              className="rounded-lg bg-sky-700 px-4 text-sm hover:bg-sky-600 disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
