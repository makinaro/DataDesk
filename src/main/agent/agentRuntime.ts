import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from '../../shared/agent';
import { IpcUserError } from '../ipc/errors';
import { buildServerEnv, type ServerPaths } from '../mcp/serverProcess';
import { bearerTransport, discoverTools, type ToolDiscovery } from '../mcp/toolDiscovery';
import type { KeyStore } from '../secrets/keyStore';
import type { SettingsStore } from '../settings/settingsStore';
import { ApprovalBroker } from './approvals';
import { buildAgentEnv } from './claude/agentEnv';
import { buildAgentOptions } from './claude/agentOptions';
import { ClaudeOrchestrator, type QueryFn } from './claude/claudeOrchestrator';
import { claudeExecutablePath } from './claude/executable';
import { HF_MCP_URL, hfDisallowedTools } from './claude/hfTools';
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
  /** Lists the HF MCP server's tools with the user's token. Injected in tests (no network). */
  discoverHfTools?: (token: string) => Promise<ToolDiscovery>;
}

const discoverHfTools = (token: string) => discoverTools(() => bearerTransport(HF_MCP_URL, token));

/** Shown in the chat when HF can't be attached; the conversation continues without it. */
export function hfUnavailableNotice(found: Extract<ToolDiscovery, { ok: false }>): string {
  return found.reason === 'unauthorized'
    ? 'Hugging Face rejected your token, so its tools are off for this conversation. Check the token in Settings.'
    : `Could not reach Hugging Face (${found.detail}), so its tools are off for this conversation.`;
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
        // Optional: an unreadable OpenAI key (e.g. encrypted under another Windows profile)
        // must not stop the analyst. Start without the OpenAI tools instead.
        const openaiApiKey = await deps.keyStore.getKey('openai').catch(() => {
          deps.log('OpenAI key could not be read; starting without the OpenAI tools.');
          return undefined;
        });
        const storedHfToken = await deps.keyStore.getKey('huggingface').catch(() => {
          deps.log('Hugging Face token could not be read; starting without the HF tools.');
          return undefined;
        });
        // Runtime discovery (D-019): list HF's tools ourselves, then disallow all but ours.
        const notices: string[] = [];
        let hfToken: string | undefined;
        let hfDisallowed: string[] = [];
        if (storedHfToken !== undefined) {
          const found = await (deps.discoverHfTools ?? discoverHfTools)(storedHfToken);
          if (found.ok) {
            hfToken = storedHfToken;
            hfDisallowed = hfDisallowedTools(found.tools);
          } else {
            deps.log(`Hugging Face tools unavailable: ${found.reason} (${found.detail})`);
            notices.push(hfUnavailableNotice(found));
          }
        }
        const tools = {
          openaiTools: openaiApiKey !== undefined,
          hfTools: hfToken !== undefined,
        };
        const settings = await deps.settings.getAgent();
        mkdirSync(workspaceDir, { recursive: true });
        const options = buildAgentOptions({
          settings,
          ...tools,
          hfDisallowedTools: hfDisallowed,
          workspaceDir,
          env: buildAgentEnv({
            apiKey,
            openaiApiKey,
            hfToken,
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
          pluginDir: deps.paths.agentPluginDir,
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
        return {
          options,
          workspaceDir,
          pluginDir: deps.paths.agentPluginDir,
          ...tools,
          notices,
        };
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
      await orchestrator?.reset('key');
    },
    async dispose(): Promise<void> {
      await orchestrator?.dispose();
    },
  };
}

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;
