import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from '../../shared/agent';
import { IpcUserError } from '../ipc/errors';
import { buildServerEnv, type ServerPaths } from '../mcp/serverProcess';
import type { KeyStore } from '../secrets/keyStore';
import type { SettingsStore } from '../settings/settingsStore';
import { ApprovalBroker } from './approvals';
import { buildAgentEnv } from './claude/agentEnv';
import { buildAgentOptions } from './claude/agentOptions';
import { ClaudeOrchestrator, type QueryFn } from './claude/claudeOrchestrator';
import { claudeExecutablePath } from './claude/executable';
import { createEventBus } from './eventBus';

export interface AgentRuntimeDeps {
  keyStore: Pick<KeyStore, 'status' | 'getKey'>;
  settings: Pick<SettingsStore, 'getAgent'>;
  paths: ServerPaths;
  deliver: (event: AgentEvent) => void;
  app: { isPackaged: boolean; version: string; resourcesPath: string };
  log: (message: string, detail?: unknown) => void;
  /** Injected in tests; defaults to the real SDK. */
  query?: QueryFn;
}

/** Wires settings, keys, paths, approvals and the event bus into an orchestrator. */
export function createAgentRuntime(deps: AgentRuntimeDeps) {
  const emit = createEventBus(deps.deliver, deps.log);
  const approvals = new ApprovalBroker(emit);
  let orchestrator: ClaudeOrchestrator | undefined;

  const workspaceDir = join(deps.paths.userData, 'agent-workspace');

  const createOrchestrator = () =>
    new ClaudeOrchestrator({
      emit,
      approvals,
      log: deps.log,
      query: deps.query ?? query,
      createSession: async ({ abortController, canUseTool }) => {
        const apiKey = await deps.keyStore.getKey('anthropic');
        if (!apiKey) throw new Error('Add your Anthropic API key in Settings.');
        const settings = await deps.settings.getAgent();
        mkdirSync(workspaceDir, { recursive: true });
        const options = buildAgentOptions({
          settings,
          workspaceDir,
          env: buildAgentEnv({
            apiKey,
            userData: deps.paths.userData,
            appVersion: deps.app.version,
            parentEnv: process.env,
          }),
          mcpServer: {
            command: process.execPath,
            args: [join(deps.paths.mainDir, 'mcp-server.js')],
            env: buildServerEnv(deps.paths, 'agent'),
          },
          canUseTool,
          abortController,
          pathToClaudeCodeExecutable: claudeExecutablePath({
            isPackaged: deps.app.isPackaged,
            resourcesPath: deps.app.resourcesPath,
            platform: process.platform,
            arch: process.arch,
          }),
          ...(deps.app.isPackaged
            ? {}
            : {
                stderr: (data: string) => {
                  deps.log(`[claude] ${data.trimEnd()}`);
                },
              }),
        });
        return { options, workspaceDir };
      },
    });

  return {
    approvals,
    current: () => orchestrator,
    /** The orchestrator, created on first use. Refuses clearly if no Anthropic key is set. */
    async get(): Promise<ClaudeOrchestrator> {
      if (!(await deps.keyStore.status()).anthropic) {
        throw new IpcUserError(
          'UNAVAILABLE',
          'Add your Anthropic API key in Settings to start the analyst.',
        );
      }
      orchestrator ??= createOrchestrator();
      return orchestrator;
    },
    /** A changed or removed key must not keep an old session alive. */
    async onKeyChanged(): Promise<void> {
      await orchestrator?.reset();
    },
    async dispose(): Promise<void> {
      await orchestrator?.dispose();
    },
  };
}

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;
