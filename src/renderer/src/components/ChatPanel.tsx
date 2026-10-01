import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useAgent } from '../agent/AgentProvider';
import type { ChatMessage, ToolCallItem } from '../agent/agentState';
import { useApi } from '../api';
import { ChatMarkdown } from './ChatMarkdown';
import { CopyIcon, SendIcon, StopIcon } from './icons';
import { TurnSteps } from './TurnSteps';

const BUSY = new Set(['starting', 'running', 'stopping']);

interface ChatPanelProps {
  className?: string;
  style?: CSSProperties;
  /**
   * Docked beside the results (Results-first): tighter spacing, and each question shows its
   * tool steps inline, because the timeline drawer starts closed in that layout.
   */
  docked?: boolean;
}

export function ChatPanel({ className = '', style, docked = false }: ChatPanelProps) {
  const { state, send, stop, reset } = useAgent();
  const stepsByTurn = useMemo(() => {
    const map = new Map<string, ToolCallItem[]>();
    for (const item of state.timeline) {
      if (item.kind !== 'tool' || item.turnId === null) continue;
      const list = map.get(item.turnId);
      if (list) list.push(item);
      else map.set(item.turnId, [item]);
    }
    return map;
  }, [state.timeline]);
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
    <section
      aria-label="Chat"
      style={style}
      className={`flex min-h-0 min-w-0 flex-col ${docked ? 'bg-surface' : ''} ${className}`}
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <ol
          aria-label="Conversation"
          className={`mx-auto max-w-[760px] pb-2 ${docked ? 'px-3.5 pt-3' : 'px-6 pt-6'}`}
        >
          {state.messages.length === 0 && (
            <li className="mt-[12vh] text-center text-sm text-faint">
              Ask a question about your datasets, e.g. “Which region sold the most units?”
            </li>
          )}
          {state.messages.map((m) =>
            m.role === 'user' ? (
              <Fragment key={m.id}>
                <UserMessage message={m} />
                {docked && (
                  <TurnSteps
                    items={stepsByTurn.get(m.id) ?? []}
                    running={busy && m.id === state.turnId}
                  />
                )}
              </Fragment>
            ) : (
              <Answer key={m.id} message={m} />
            ),
          )}
        </ol>
        <div ref={endRef} />
      </div>

      <div className={docked ? 'px-3 pt-2 pb-3' : 'px-6 pt-2 pb-4'}>
        {error && (
          <p
            role="alert"
            className="mx-auto mb-2 max-w-[760px] rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        <div
          className={`mx-auto max-w-[760px] rounded-[14px] border border-line py-2 pr-2 pl-3.5 focus-within:border-faint ${
            docked ? 'bg-canvas' : 'bg-surface'
          }`}
        >
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={onKeyDown}
            placeholder="Ask about your data…"
            className="block h-11 w-full resize-none bg-transparent text-sm outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={state.messages.length === 0}
              className="rounded-md px-2 py-0.5 text-xs text-faint hover:bg-raised hover:text-fg disabled:opacity-40"
            >
              New conversation
            </button>
            <span data-testid="agent-status" className="min-w-0 flex-1 truncate text-xs text-faint">
              {state.model ? `${state.model} · ` : ''}
              {state.status}
              {state.sessionCostUsd > 0 ? ` · $${state.sessionCostUsd.toFixed(4)}` : ''}
            </span>
            {busy ? (
              <button
                type="button"
                aria-label="Stop"
                onClick={stop}
                className="grid h-8 w-8 place-items-center rounded-lg border border-danger text-danger hover:bg-danger-soft"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Send"
                onClick={() => void submit()}
                disabled={!draft.trim()}
                className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-40"
              >
                <SendIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <li className="my-4 flex justify-end">
      <div className="max-w-[80%] rounded-2xl bg-bubble px-3.5 py-2 text-sm whitespace-pre-wrap">
        <span className="sr-only">You: </span>
        {message.text}
      </div>
    </li>
  );
}

/** An analyst answer: no bubble, full width, like a document. */
function Answer({ message }: { message: ChatMessage }) {
  const api = useApi();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  async function copy() {
    try {
      const result = await api.clipboard.writeText(message.text);
      if (result.ok) setCopied(true);
    } catch {
      // No handler (e.g. a broken bridge): the button just doesn't confirm.
    }
  }

  return (
    <li className="group mb-2 text-sm">
      <span className="sr-only">Analyst: </span>
      <ChatMarkdown text={message.text} />
      {message.streaming ? (
        <span aria-hidden="true" className="caret" />
      ) : (
        <div className="-ml-1.5 flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label={copied ? 'Copied' : 'Copy answer'}
            onClick={() => void copy()}
            className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-raised hover:text-fg"
          >
            <CopyIcon />
          </button>
        </div>
      )}
    </li>
  );
}
