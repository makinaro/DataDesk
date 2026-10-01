import {
  CompareEventSchema,
  type AnalystProvider,
  type CompareEvent,
  type ResetReason,
} from '../../shared/agent';
import { IpcUserError } from '../ipc/errors';
import { createAgentRuntime, type AgentRuntime, type AgentRuntimeDeps } from './agentRuntime';

const PROVIDERS = ['anthropic', 'openai'] as const satisfies readonly AnalystProvider[];

export interface CompareRuntimeDeps extends Omit<AgentRuntimeDeps, 'deliver' | 'lane'> {
  deliver: (event: CompareEvent) => void;
}

/**
 * Compare mode (D-022): one agent runtime per provider, each a "lane" with its own event
 * numbering, temp dir and fresh session per question. The lanes share nothing with the chat.
 */
export function createCompareRuntime(deps: CompareRuntimeDeps) {
  const lanes = Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      createAgentRuntime({
        ...deps,
        deliver: (event) => {
          // The lane's bus already validated the event; this checks the envelope too.
          deps.deliver(CompareEventSchema.parse({ provider, event }));
        },
        lane: { provider, instance: `compare-${provider}` },
      }),
    ]),
  ) as Record<AnalystProvider, AgentRuntime>;
  const all = () => PROVIDERS.map((p) => lanes[p]);

  const resetAll = async (reason: ResetReason) => {
    await Promise.all(all().map((lane) => lane.current()?.reset(reason) ?? Promise.resolve()));
  };

  return {
    /** Asks both providers the same question, each in a fresh session. Needs both keys. */
    async run(text: string): Promise<void> {
      const status = await deps.keyStore.status();
      if (!status.anthropic || !status.openai) {
        throw new IpcUserError(
          'UNAVAILABLE',
          'Compare mode needs both an Anthropic and an OpenAI API key. Add them in Settings.',
        );
      }
      // One-shot: a previous comparison's context must not influence this one.
      await resetAll('user');
      const orchestrators = await Promise.all(all().map((lane) => lane.get()));
      for (const orchestrator of orchestrators) orchestrator.send(text);
    },
    async stop(): Promise<void> {
      await Promise.all(all().map((lane) => lane.current()?.stop() ?? Promise.resolve()));
    },
    /** Ends both sessions (their CLI process and datadesk-mcp servers exit). */
    reset: () => resetAll('user'),
    onSettingsChanged: () => resetAll('settings'),
    onKeyChanged: () => resetAll('key'),
    async dispose(): Promise<void> {
      await Promise.all(all().map((lane) => lane.dispose()));
    },
  };
}

export type CompareRuntime = ReturnType<typeof createCompareRuntime>;
