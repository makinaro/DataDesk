import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentRuntime } from '../../../src/main/agent/agentRuntime';
import { IpcUserError } from '../../../src/main/ipc/errors';
import type { ToolDiscovery } from '../../../src/main/mcp/toolDiscovery';
import type { OpenAISessionSetup } from '../../../src/main/agent/openai/openaiOrchestrator';
import type { OpenAISessionInput } from '../../../src/main/agent/openai/openaiSession';
import {
  DEFAULT_AGENT_SETTINGS,
  type AgentEvent,
  type AnalystProvider,
} from '../../../src/shared/agent';
import { PLUGIN_DIR, scriptedQuery, sdk } from './claude/fakeSdk';
import { fakeServer, scriptedModel } from './openai/fakeOpenAI';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }));

const KEY = 'sk-ant-runtime-test-000000';
let userData: string;
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'agent-runtime-'));
});
afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

interface RuntimeOpts {
  hasKey?: boolean;
  openaiKey?: string;
  openaiUnreadable?: boolean;
  hfToken?: string;
  hfUnreadable?: boolean;
  /** What listing the HF server's tools returns (default: the anonymous set plus create_repo). */
  hfDiscovery?: ToolDiscovery;
  provider?: AnalystProvider;
}

function runtime(opts: RuntimeOpts = {}) {
  const hasKey = opts.hasKey ?? true;
  const delivered: AgentEvent[] = [];
  const workspace = join(userData, 'agent-workspace');
  const { queryFn, calls } = scriptedQuery([[sdk.result(0.01)]], {
    initFirst: sdk.init({
      cwd: workspace,
      // With HF attached the guard also requires the scout.
      ...(opts.hfToken !== undefined && (opts.hfDiscovery?.ok ?? true)
        ? { agents: ['profiler', 'sql-analyst', 'report-writer', 'dataset-scout'] }
        : {}),
    }),
  });
  const unreadable = () =>
    Promise.reject(new Error('Error while decrypting the ciphertext provided'));
  const keys: Record<string, () => Promise<string | undefined>> = {
    anthropic: () => Promise.resolve(hasKey ? KEY : undefined),
    openai: () => (opts.openaiUnreadable ? unreadable() : Promise.resolve(opts.openaiKey)),
    huggingface: () => (opts.hfUnreadable ? unreadable() : Promise.resolve(opts.hfToken)),
  };
  const discoverHfTools = vi.fn<(token: string) => Promise<ToolDiscovery>>(() =>
    Promise.resolve(
      opts.hfDiscovery ?? {
        ok: true,
        tools: ['hf_whoami', 'hub_repo_search', 'hub_repo_details', 'hf_fs', 'create_repo'],
      },
    ),
  );
  const settings = {
    ...DEFAULT_AGENT_SETTINGS,
    model: 'haiku',
    provider: opts.provider ?? 'anthropic',
  };
  const openai = scriptedModel({ analyst: [{ text: 'OpenAI answer' }] });
  const openaiServer = fakeServer();
  const createOpenAISession = vi.fn((input: OpenAISessionInput) =>
    Promise.resolve<OpenAISessionSetup>({
      modelName: input.modelName,
      model: openai.model,
      server: openaiServer.server,
      skills: [],
      openaiTools: true,
      maxTurns: input.settings.maxTurns,
      maxBudgetUsd: input.settings.maxBudgetUsd,
    }),
  );
  const rt = createAgentRuntime({
    keyStore: {
      status: () =>
        Promise.resolve({
          anthropic: hasKey,
          openai: opts.openaiKey !== undefined,
          huggingface: false,
        }),
      getKey: (provider: string) => keys[provider]?.() ?? Promise.resolve(undefined),
    },
    settings: { getAgent: () => Promise.resolve(settings) },
    paths: {
      userData,
      mainDir: 'C:/app/out/main',
      extensionDir: undefined,
      agentPluginDir: PLUGIN_DIR,
    },
    deliver: (e) => delivered.push(e),
    app: { isPackaged: false, version: '0.1.0', resourcesPath: 'C:/app/resources' },
    log: () => undefined,
    query: queryFn,
    discoverHfTools,
    createOpenAISession,
  });
  return {
    rt,
    delivered,
    calls,
    workspace,
    discoverHfTools,
    settings,
    createOpenAISession,
    openaiServer,
  };
}

describe('createAgentRuntime', () => {
  it('refuses to start without an Anthropic key (clear, user-facing error)', async () => {
    const { rt } = runtime({ hasKey: false });
    const error = await rt.get().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IpcUserError);
    expect((error as IpcUserError).code).toBe('UNAVAILABLE');
  });

  it('starts a session with the isolated workspace, env, key and MCP server', async () => {
    const { rt, calls, delivered, workspace } = runtime();
    (await rt.get()).send('hello');
    await vi.waitFor(() => {
      expect(delivered.some((e) => e.kind === 'turn_complete')).toBe(true);
    });
    const options = calls.options as Options;
    expect(options.cwd).toBe(workspace);
    expect(existsSync(workspace)).toBe(true);
    expect(options.model).toBe('haiku');
    expect(options.env?.ANTHROPIC_API_KEY).toBe(KEY);
    expect(options.env?.CLAUDE_CONFIG_DIR).toBe(join(userData, 'claude-config'));
    const server = options.mcpServers?.datadesk as {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
    expect(server.command).toBe(process.execPath);
    expect(server.args[0]).toMatch(/mcp-server\.js$/);
    expect(server.env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(JSON.stringify(server.env)).not.toContain(KEY);
    // The CLI merges its own env into MCP servers; ours must override the key with a blank.
    expect(server.env.ANTHROPIC_API_KEY).toBe('');
    // Every delivered event was validated and stamped.
    expect(delivered.every((e, i) => e.seq === i)).toBe(true);
  });

  it('resets the session when the key changes', async () => {
    const { rt, calls } = runtime();
    (await rt.get()).send('hello');
    await vi.waitFor(() => {
      expect(calls.prompts).toHaveLength(1);
    });
    await rt.onKeyChanged();
    expect(calls.closed).toBe(true);
  });

  it('passes the OpenAI key via the CLI env, never in the MCP server config (command line)', async () => {
    const openaiKey = 'sk-openai-test-0123456789';
    const { rt, calls, delivered } = runtime({ openaiKey });
    (await rt.get()).send('hello');
    await vi.waitFor(() => {
      expect(delivered.some((e) => e.kind === 'turn_complete')).toBe(true);
    });
    const options = calls.options as Options;
    expect(options.env?.DATADESK_OPENAI_API_KEY).toBe(openaiKey);
    // mcpServers becomes the CLI's --mcp-config argument: the key must not be in it.
    expect(JSON.stringify(options.mcpServers)).not.toContain(openaiKey);
    expect(options.allowedTools).toEqual(
      expect.arrayContaining(['mcp__datadesk__search_columns', 'mcp__datadesk__second_opinion']),
    );
  });

  it('without an OpenAI key the session has no OpenAI tools and no key variable', async () => {
    const { rt, calls, delivered } = runtime();
    (await rt.get()).send('hello');
    await vi.waitFor(() => {
      expect(delivered.some((e) => e.kind === 'turn_complete')).toBe(true);
    });
    const options = calls.options as Options;
    expect(options.env).not.toHaveProperty('DATADESK_OPENAI_API_KEY');
    expect(options.allowedTools).not.toContain('mcp__datadesk__search_columns');
  });

  it('starts without the OpenAI tools when the OpenAI key cannot be read', async () => {
    const { rt, calls, delivered } = runtime({ openaiUnreadable: true });
    (await rt.get()).send('hello');
    await vi.waitFor(() => {
      expect(delivered.some((e) => e.kind === 'turn_complete')).toBe(true);
    });
    const options = calls.options as Options;
    expect(options.env).not.toHaveProperty('DATADESK_OPENAI_API_KEY');
    expect(options.allowedTools).not.toContain('mcp__datadesk__search_columns');
  });

  it('attaches the HF server with a ${…} placeholder; the token only in the CLI env', async () => {
    const hfToken = 'hf_test_token_0123456789';
    const { rt, calls, delivered, discoverHfTools } = runtime({ hfToken });
    (await rt.get()).send('hello');
    await vi.waitFor(() => {
      expect(delivered.some((e) => e.kind === 'turn_complete')).toBe(true);
    });
    const options = calls.options as Options;
    expect(options.env?.DATADESK_HF_TOKEN).toBe(hfToken);
    // mcpServers becomes the CLI's --mcp-config argument: the token must not be in it. Nothing
    // else in the options may carry it either; only the CLI's env.
    expect(JSON.stringify(options.mcpServers)).not.toContain(hfToken);
    expect(JSON.stringify({ ...options, env: undefined })).not.toContain(hfToken);
    expect(options.mcpServers?.hf).toMatchObject({
      type: 'http',
      headers: { Authorization: 'Bearer ${DATADESK_HF_TOKEN}' },
    });
    // Discovered first, with the token; everything outside the allowlist is hidden.
    expect(discoverHfTools).toHaveBeenCalledWith(hfToken);
    expect(options.disallowedTools).toEqual(
      expect.arrayContaining(['mcp__hf__hf_whoami', 'mcp__hf__create_repo']),
    );
    expect(options.disallowedTools).not.toContain('mcp__hf__hub_repo_search');
  });

  it.each([
    [{ ok: false, reason: 'unauthorized', detail: 'HTTP 401' } as const, /rejected your token/],
    [{ ok: false, reason: 'unreachable', detail: 'fetch failed' } as const, /Could not reach/],
  ])('starts without HF and tells the user when discovery fails (%j)', async (found, notice) => {
    const { rt, calls, delivered } = runtime({ hfToken: 'hf_bad', hfDiscovery: found });
    (await rt.get()).send('hello');
    await vi.waitFor(() => {
      expect(delivered.some((e) => e.kind === 'turn_complete')).toBe(true);
    });
    const options = calls.options as Options;
    expect(Object.keys(options.mcpServers ?? {})).toEqual(['datadesk']);
    expect(options.env).not.toHaveProperty('DATADESK_HF_TOKEN');
    const errors = delivered.filter((e) => e.kind === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind === 'error' && errors[0].message).toMatch(notice);
  });

  it.each([{}, { hfUnreadable: true }])('has no HF server or token variable with %j', async (o) => {
    const { rt, calls, delivered } = runtime(o);
    (await rt.get()).send('hello');
    await vi.waitFor(() => {
      expect(delivered.some((e) => e.kind === 'turn_complete')).toBe(true);
    });
    const options = calls.options as Options;
    expect(options.env).not.toHaveProperty('DATADESK_HF_TOKEN');
    expect(Object.keys(options.mcpServers ?? {})).toEqual(['datadesk']);
  });

  describe('provider switch (Phase 7)', () => {
    it('runs the analyst on OpenAI when selected, with the OpenAI key and model', async () => {
      const { rt, delivered, calls, createOpenAISession, workspace } = runtime({
        provider: 'openai',
        openaiKey: 'sk-openai-runtime-000000',
      });
      (await rt.get()).send('hello');
      await vi.waitFor(() => {
        expect(delivered.some((e) => e.kind === 'turn_complete')).toBe(true);
      });
      expect(createOpenAISession).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-openai-runtime-000000',
          modelName: 'gpt-5.4-mini',
          workspaceDir: workspace,
          instance: 'openai',
        }),
      );
      expect(calls.prompts).toEqual([]); // Claude never started
      expect(delivered.find((e) => e.kind === 'session')).toMatchObject({ model: 'gpt-5.4-mini' });
      expect(delivered.flatMap((e) => (e.kind === 'assistant_message' ? [e.text] : []))).toEqual([
        'OpenAI answer',
      ]);
    });

    it('refuses OpenAI without an OpenAI key, even with an Anthropic key', async () => {
      const { rt } = runtime({ provider: 'openai' });
      const error = await rt.get().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(IpcUserError);
      expect((error as IpcUserError).message).toMatch(/OpenAI API key/);
    });

    it('switching provider ends the conversation once and swaps the orchestrator', async () => {
      const { rt, delivered, calls, settings, openaiServer } = runtime({
        openaiKey: 'sk-openai-runtime-000000',
      });
      const claude = await rt.get();
      claude.send('hello');
      await vi.waitFor(() => {
        expect(calls.prompts).toHaveLength(1);
      });
      settings.provider = 'openai';
      await rt.onSettingsChanged();
      expect(calls.closed).toBe(true);
      const openai = await rt.get();
      expect(openai).not.toBe(claude);
      openai.send('hello again');
      await vi.waitFor(() => {
        expect(delivered.filter((e) => e.kind === 'turn_complete')).toHaveLength(2);
      });
      // Exactly one boundary: a second one would clear the message the user just sent.
      expect(delivered.filter((e) => e.kind === 'conversation_reset')).toEqual([
        expect.objectContaining({ reason: 'settings' }),
      ]);
      await rt.onKeyChanged();
      expect(openaiServer.closed()).toBe(1);
    });

    it('a settings change on the same provider keeps the orchestrator', async () => {
      const { rt } = runtime();
      const before = await rt.get();
      await rt.onSettingsChanged();
      expect(await rt.get()).toBe(before);
    });
  });
});
