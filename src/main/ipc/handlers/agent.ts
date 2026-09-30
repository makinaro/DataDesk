import { IpcChannels } from '../../../shared/ipc/channels';
import type { ApprovalBroker } from '../../agent/approvals';
import type { Orchestrator } from '../../agent/orchestrator';
import type { SettingsStore } from '../../settings/settingsStore';
import type { IpcHandle } from '../router';

export interface AgentHandlerDeps {
  /** Returns the live orchestrator, creating it on first use. Throws IpcUserError if unusable. */
  getOrchestrator: () => Promise<Orchestrator>;
  /** The current orchestrator if one exists (stop/reset shouldn't create one). */
  currentOrchestrator: () => Orchestrator | undefined;
  approvals: Pick<ApprovalBroker, 'respond'>;
  settings: Pick<SettingsStore, 'getAgent' | 'setAgent'>;
}

export function registerAgentHandlers(
  handle: IpcHandle,
  { getOrchestrator, currentOrchestrator, approvals, settings }: AgentHandlerDeps,
): void {
  handle(IpcChannels.agentSend, async ({ text }) => {
    (await getOrchestrator()).send(text);
    return { accepted: true as const };
  });

  handle(IpcChannels.agentStop, async () => {
    await currentOrchestrator()?.stop();
    return { ok: true as const };
  });

  handle(IpcChannels.agentReset, async () => {
    await currentOrchestrator()?.reset();
    return { ok: true as const };
  });

  handle(IpcChannels.agentApprove, ({ requestId, approved }) => ({
    found: approvals.respond(requestId, approved),
  }));

  handle(IpcChannels.settingsGetAgent, () => settings.getAgent());

  handle(IpcChannels.settingsSetAgent, async (next) => {
    const saved = await settings.setAgent(next);
    // Model and budget are session options, so start a fresh conversation with them.
    await currentOrchestrator()?.reset('settings');
    return saved;
  });
}
