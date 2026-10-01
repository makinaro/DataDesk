import { useEffect, useReducer, useState, type KeyboardEvent } from 'react';
import type { AnalystProvider } from '../../../shared/agent';
import { agentReducer, initialAgentState } from '../agent/agentState';
import { useApi } from '../api';
import { summarizeLane, type LaneSummary } from '../compare/laneSummary';
import { Panel } from './Panel';

const LANES: { provider: AnalystProvider; title: string }[] = [
  { provider: 'anthropic', title: 'Claude Agent SDK' },
  { provider: 'openai', title: 'OpenAI Agents SDK' },
];

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

function Lane({
  title,
  lane,
  startedAt,
}: {
  title: string;
  lane: LaneSummary;
  startedAt: number | null;
}) {
  const wall =
    lane.finishedAt !== null && startedAt !== null ? seconds(lane.finishedAt - startedAt) : '–';
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-slate-800 p-3"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-slate-500">
          {lane.model ?? ''}
          {lane.busy ? ' · working…' : lane.outcome ? ` · ${lane.outcome.reason}` : ''}
        </span>
      </header>

      <dl aria-label={`${title} stats`} className="grid grid-cols-4 gap-2 text-xs">
        <Stat label="Cost" value={`$${lane.costUsd.toFixed(4)}`} />
        <Stat label="Time to answer" value={wall} />
        <Stat label="Turn (SDK)" value={lane.turnMs === null ? '–' : seconds(lane.turnMs)} />
        <Stat label="Tool calls" value={String(lane.tools.length)} />
      </dl>

      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-400 uppercase">Answer</h4>
        <p
          className="min-h-12 rounded bg-slate-900 p-2 text-sm whitespace-pre-wrap"
          data-testid="compare-answer"
        >
          {lane.answer || (lane.busy ? '…' : '')}
        </p>
      </div>

      {lane.errors.length > 0 && (
        <ul className="space-y-1">
          {lane.errors.map((message, i) => (
            <li key={i} className="rounded bg-red-950 px-2 py-1 text-xs text-red-300">
              {message}
            </li>
          ))}
        </ul>
      )}

      <div className="min-h-0">
        <h4 className="mb-1 text-xs font-semibold text-slate-400 uppercase">
          Tool calls{lane.steps !== null ? ` · ${String(lane.steps)} model step(s)` : ''}
        </h4>
        <ol aria-label={`${title} tool calls`} className="space-y-1 text-xs">
          {lane.tools.map((tool) => (
            <li key={tool.id} className={`font-mono ${tool.nested ? 'ml-4 text-slate-400' : ''}`}>
              <span aria-hidden="true">{tool.ms === null ? '⏳' : tool.isError ? '✗' : '✓'}</span>{' '}
              {tool.label}
              <span className="text-slate-500">
                {tool.ms === null ? '' : ` ${String(tool.ms)} ms`}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * Compare mode: one question, both providers, side by side. Each lane is fed into the chat's
 * own reducer, so the comparison uses exactly the events the chat would show. Leaving the view
 * ends both sessions.
 */
export function CompareView() {
  const api = useApi();
  const [anthropic, dispatchAnthropic] = useReducer(agentReducer, initialAgentState);
  const [openai, dispatchOpenAI] = useReducer(agentReducer, initialAgentState);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Until the lanes report 'starting', only this stops a double Enter from running twice.
  const [submitting, setSubmitting] = useState(false);
  const lanes = { anthropic: summarizeLane(anthropic), openai: summarizeLane(openai) };
  const busy = submitting || lanes.anthropic.busy || lanes.openai.busy;

  useEffect(() => {
    const unsubscribe = api.compare.onEvent(({ provider, event }) => {
      (provider === 'openai' ? dispatchOpenAI : dispatchAnthropic)({ type: 'event', event });
    });
    return () => {
      unsubscribe();
      void api.compare.reset().catch(() => undefined);
    };
  }, [api]);

  async function run() {
    const text = draft.trim();
    if (!text || busy) return;
    dispatchAnthropic({ type: 'reset' });
    dispatchOpenAI({ type: 'reset' });
    setError(null);
    setStartedAt(Date.now());
    setSubmitting(true);
    try {
      const result = await api.compare.run(text);
      if (!result.ok) setError(result.error.message);
    } catch {
      setError('Could not reach the app backend.');
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void run();
    }
  }

  return (
    <Panel title="Compare providers" className="min-w-0 flex-[2]">
      <div className="flex h-full flex-col gap-3">
        <p className="text-xs text-slate-500">
          Asks both analysts the same question in fresh sessions, with the models from Settings.
          Nothing is added or downloaded here: tools that need your approval are declined.
        </p>
        <div className="flex gap-2">
          <textarea
            aria-label="Question to compare"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={onKeyDown}
            placeholder="Ask both analysts… (Enter to run)"
            className="h-16 flex-1 resize-none rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => void api.compare.stop().catch(() => undefined)}
              className="rounded-lg border border-red-800 px-4 text-sm text-red-300 hover:bg-red-950"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run()}
              disabled={!draft.trim()}
              className="rounded-lg bg-sky-700 px-4 text-sm hover:bg-sky-600 disabled:opacity-40"
            >
              Compare
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="flex min-h-0 flex-1 gap-3 overflow-auto">
          {LANES.map(({ provider, title }) => (
            <Lane key={provider} title={title} lane={lanes[provider]} startedAt={startedAt} />
          ))}
        </div>
      </div>
    </Panel>
  );
}
