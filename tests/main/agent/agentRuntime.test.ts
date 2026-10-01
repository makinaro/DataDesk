import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentRuntime } from '../../../src/main/agent/agentRuntime';
import { IpcUserError } from '../../../src/main/ipc/errors';
import { DEFAULT_AGENT_SETTINGS, type AgentEvent } from '../../../src/shared/agent';
import { PLUGIN_DIR, scriptedQuery, sdk } from './claude/fakeSdk';

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
}

function runtime(opts: RuntimeOpts = {}) {
  const hasKey = opts.hasKey ?? true;
  const delivered: AgentEvent[] = [];
  const workspace = join(userData, 'agent-workspace');
  const { queryFn, calls } = scriptedQuery([[sdk.result(0.01)]], {
    initFirst: sdk.init({ cwd: workspace }),
  });
  const unreadable = () =>
    Promise.reject(new Error('Error while decrypting the ciphertext provided'));
  const keys: Record<string, () => Promise<string | undefined>> = {
    anthropic: () => Promise.resolve(hasKey ? KEY : undefined),
    openai: () => (opts.openaiUnreadable ? unreadable() : Promise.resolve(opts.openaiKey)),
    huggingface: () => (opts.hfUnreadable ? unreadable() : Promise.resolve(opts.hfToken)),
  };
  const rt = createAgentRuntime({
    keyStore: {
      status: () => Promise.resolve({ anthropic: hasKey, openai: false, huggingface: false }),
      getKey: (provider: string) => keys[provider]?.() ?? Promise.resolve(undefined),
    },
    settings: { getAgent: () => Promise.resolve({ ...DEFAULT_AGENT_SETTINGS, model: 'haiku' }) },
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
  });
  return { rt, delivered, calls, workspace };
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
    const { rt, calls, delivered } = runtime({ hfToken });
    (await rt.get()).send('hello');
    await vi.waitFor(() => {
      expect(delivered.some((e) => e.kind === 'turn_complete')).toBe(true);
    });
    const options = calls.options as Options;
    expect(options.env?.DATADESK_HF_TOKEN).toBe(hfToken);
    // mcpServers becomes the CLI's --mcp-config argument: the token must not be in it.
    expect(JSON.stringify(options.mcpServers)).not.toContain(hfToken);
    expect(options.mcpServers?.hf).toMatchObject({
      type: 'http',
      headers: { Authorization: 'Bearer ${DATADESK_HF_TOKEN}' },
    });
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
});
