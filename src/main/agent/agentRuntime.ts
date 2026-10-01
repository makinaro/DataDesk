import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, AnalystProvider } from '../../shared/agent';
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
import { OpenAIOrchestrator, type OpenAISessionSetup } from './openai/openaiOrchestrator';
import { createOpenAISession, type OpenAISessionInput } from './openai/openaiSession';
import type { Orchestrator } from './orchestrator';

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
  /** Starts an OpenAI session (datadesk-mcp + model). Injected in tests (no process, no network). */
  createOpenAISession?: (input: OpenAISessionInput) => Promise<OpenAISessionSetup>;
}

/** Shown when the selected provider has no key. */
const MISSING_KEY: Record<AnalystProvider, string> = {
  anthropic: 'Add your Anthropic API key in Settings to start the analyst.',
  openai:
    'Add your OpenAI API key in Settings to run the analyst on OpenAI (or switch the provider back to Claude).',
};

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
  /** The orchestrator for the selected provider, created on first use. */
  let live: { provider: AnalystProvider; orchestrator: Orchestrator } | undefined;

  const workspaceDir = join(deps.paths.userData, 'agent-workspace');

  const createOpenAI = () =>
    new OpenAIOrchestrator({
      emit,
      approvals,
      log: deps.log,
      createSession: async () => {
        const apiKey = await deps.keyStore.getKey('openai');
        if (!apiKey) throw new Error('Add your OpenAI API key in Settings.');
        const settings = await deps.settings.getAgent();
        mkdirSync(workspaceDir, { recursive: true });
        return (deps.createOpenAISession ?? createOpenAISession)({
          apiKey,
          modelName: settings.openaiModel,
          settings,
          paths: deps.paths,
          workspaceDir,
          instance: 'openai',
        });
      },
    });

  const createClaude = () =>
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
    current: (): Orchestrator | undefined => live?.orchestrator,
    /**
     * The orchestrator for the selected provider, created on first use. Refuses clearly if that
     * provider has no key.
     */
    async get(): Promise<Orchestrator> {
      const { provider } = await deps.settings.getAgent();
      if (!(await deps.keyStore.status())[provider]) {
        throw new IpcUserError('UNAVAILABLE', MISSING_KEY[provider]);
      }
      if (live?.provider !== provider) {
        // Normally swapped in onSettingsChanged; this covers a provider change from elsewhere.
        await live?.orchestrator.reset('settings');
        live = {
          provider,
          orchestrator: provider === 'openai' ? createOpenAI() : createClaude(),
        };
      }
      return live.orchestrator;
    },
    /**
     * Model, budget and provider are session options: end the conversation, and drop an
     * orchestrator of the wrong provider (reset already released its process and server).
     */
    async onSettingsChanged(): Promise<void> {
      const previous = live;
      await previous?.orchestrator.reset('settings');
      const { provider } = await deps.settings.getAgent();
      if (previous && previous.provider !== provider && live === previous) live = undefined;
    },
    /** A changed or removed key must not keep an old session alive. */
    async onKeyChanged(): Promise<void> {
      await live?.orchestrator.reset('key');
    },
    async dispose(): Promise<void> {
      await live?.orchestrator.dispose();
    },
  };
}

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;
