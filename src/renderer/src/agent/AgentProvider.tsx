import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { useApi } from '../api';
import { agentReducer, initialAgentState, type AgentState } from './agentState';

interface AgentContextValue {
  state: AgentState;
  /** Resolves to an error message, or null when the message was accepted. */
  send: (text: string) => Promise<string | null>;
  stop: () => void;
  reset: () => void;
  answerApproval: (requestId: string, approved: boolean) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, dispatch] = useReducer(agentReducer, initialAgentState);

  useEffect(
    () =>
      api.agent.onEvent((event) => {
        dispatch({ type: 'event', event });
      }),
    [api],
  );

  const value = useMemo<AgentContextValue>(
    () => ({
      state,
      send: async (text) => {
        const id = crypto.randomUUID();
        dispatch({ type: 'user_message', id, text });
        try {
          const result = await api.agent.send(text);
          return result.ok ? null : result.error.message;
        } catch {
          return 'Could not reach the app backend.';
        }
      },
      stop: () => {
        void api.agent.stop().catch(() => undefined);
      },
      reset: () => {
        dispatch({ type: 'reset' });
        void api.agent.reset().catch(() => undefined);
      },
      answerApproval: (requestId, approved) => {
        void api.agent.approve(requestId, approved).catch(() => undefined);
      },
    }),
    [api, state],
  );

  return <AgentContext value={value}>{children}</AgentContext>;
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used inside <AgentProvider>');
  return ctx;
}
