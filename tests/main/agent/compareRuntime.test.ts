import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCompareRuntime } from '../../../src/main/agent/compareRuntime';
import type { OpenAISessionSetup } from '../../../src/main/agent/openai/openaiOrchestrator';
import type { OpenAISessionInput } from '../../../src/main/agent/openai/openaiSession';
import { IpcUserError } from '../../../src/main/ipc/errors';
import { DEFAULT_AGENT_SETTINGS, type CompareEvent } from '../../../src/shared/agent';
import { PLUGIN_DIR, scriptedQuery, sdk } from './claude/fakeSdk';
import { fakeServer, scriptedModel, type FakeResponse } from './openai/fakeOpenAI';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }));

let userData: string;
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'compare-runtime-'));
});
afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

function setup(opts: { openaiKey?: boolean; openaiScript?: FakeResponse[] } = {}) {
  const delivered: CompareEvent[] = [];
  const claude = scriptedQuery(
    [
      [sdk.assistant('m1', [{ type: 'text', text: 'Claude: West.' }]), sdk.result(0.01)],
      [sdk.assistant('m2', [{ type: 'text', text: 'Claude again.' }]), sdk.result(0.01)],
    ],
    { initFirst: sdk.init({ cwd: join(userData, 'agent-workspace') }) },
  );
  const openai = scriptedModel({
    analyst: opts.openaiScript ?? [{ text: 'GPT: West.' }, { text: 'GPT again.' }],
  });
  const server = fakeServer();
  const createOpenAISession = vi.fn((input: OpenAISessionInput) =>
    Promise.resolve<OpenAISessionSetup>({
      modelName: input.modelName,
      model: openai.model,
      server: server.server,
      skills: [],
      openaiTools: true,
      maxTurns: input.settings.maxTurns,
      maxBudgetUsd: input.settings.maxBudgetUsd,
    }),
  );
  const discoverHfTools = vi.fn(() => Promise.resolve({ ok: true as const, tools: [] }));
  const compare = createCompareRuntime({
    keyStore: {
      status: () =>
        Promise.resolve({ anthropic: true, openai: opts.openaiKey ?? true, huggingface: true }),
      getKey: (provider) =>
        Promise.resolve(
          {
            anthropic: 'sk-ant-compare-0000',
            openai: 'sk-openai-compare-0000',
            huggingface: 'hf_x',
          }[provider],
        ),
    },
    // The chat is set to Claude; compare runs both regardless.
    settings: { getAgent: () => Promise.resolve({ ...DEFAULT_AGENT_SETTINGS }) },
    paths: {
      userData,
      mainDir: 'C:/app/out/main',
      extensionDir: undefined,
      agentPluginDir: PLUGIN_DIR,
    },
    deliver: (e) => delivered.push(e),
    app: { isPackaged: false, version: '0.1.0', resourcesPath: 'C:/app/resources' },
    log: () => undefined,
    query: claude.queryFn,
    discoverHfTools,
    createOpenAISession,
  });
  const lane = (provider: CompareEvent['provider']) =>
    delivered.filter((e) => e.provider === provider).map((e) => e.event);
  const answers = (provider: CompareEvent['provider']) =>
    lane(provider).flatMap((e) => (e.kind === 'assistant_message' ? [e.text] : []));
  const completed = async (n: number) => {
    await vi.waitFor(() => {
      for (const p of ['anthropic', 'openai'] as const) {
        expect(lane(p).filter((e) => e.kind === 'turn_complete')).toHaveLength(n);
      }
    });
  };
  return {
    compare,
    delivered,
    claude,
    openai,
    server,
    createOpenAISession,
    discoverHfTools,
    lane,
    answers,
    completed,
  };
}

describe('createCompareRuntime', () => {
  it('needs both keys and starts nothing without them', async () => {
    const t = setup({ openaiKey: false });
    const error = await t.compare.run('Which region?').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IpcUserError);
    expect((error as IpcUserError).message).toMatch(/both an Anthropic and an OpenAI API key/);
    expect(t.delivered).toEqual([]);
  });

  it('asks both providers the same question; each lane has its own events', async () => {
    const t = setup();
    await t.compare.run('Which region?');
    await t.completed(1);
    expect(t.claude.calls.prompts).toEqual(['Which region?']);
    expect(JSON.stringify(t.openai.requests[0]?.request.input)).toContain('Which region?');
    expect(t.answers('anthropic')).toEqual(['Claude: West.']);
    expect(t.answers('openai')).toEqual(['GPT: West.']);
    // Numbered per lane, so each renderer reducer de-duplicates its own stream.
    for (const p of ['anthropic', 'openai'] as const) {
      expect(t.lane(p).map((e) => e.seq)).toEqual(t.lane(p).map((_, i) => i));
    }
  });

  it('keeps lanes apart from the chat: own temp dirs, no Hugging Face', async () => {
    const t = setup();
    await t.compare.run('q');
    await t.completed(1);
    const options = t.claude.calls.options as Options;
    const server = options.mcpServers?.datadesk as { env: Record<string, string> };
    expect(server.env.DATADESK_TEMP_DIR).toMatch(/agent-compare-anthropic$/);
    expect(options.mcpServers).not.toHaveProperty('hf');
    expect(options.env).not.toHaveProperty('DATADESK_HF_TOKEN');
    expect(t.discoverHfTools).not.toHaveBeenCalled();
    expect(t.createOpenAISession).toHaveBeenCalledWith(
      expect.objectContaining({ instance: 'compare-openai', apiKey: 'sk-openai-compare-0000' }),
    );
  });

  it('declines approval tools without asking (nothing is registered from compare mode)', async () => {
    const t = setup({
      openaiScript: [
        {
          calls: [
            { callId: 'r', name: 'mcp__datadesk__register_dataset', args: { path: 'C:/a.csv' } },
          ],
        },
        { text: 'ok' },
      ],
    });
    await t.compare.run('add C:/a.csv');
    await t.completed(1);
    expect(t.delivered.some((e) => e.event.kind === 'approval_request')).toBe(false);
    expect(t.lane('openai').find((e) => e.kind === 'tool_result')).toMatchObject({ isError: true });
    expect(t.server.calls).toEqual([]);
  });

  it('every question starts fresh sessions on both sides', async () => {
    const t = setup();
    await t.compare.run('first');
    await t.completed(1);
    await t.compare.run('second');
    await t.completed(2);
    expect(t.createOpenAISession).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(t.openai.requests[1]?.request.input)).not.toContain('first');
    expect(t.claude.calls.closed).toBe(true);
    for (const p of ['anthropic', 'openai'] as const) {
      expect(t.lane(p).filter((e) => e.kind === 'conversation_reset')).toHaveLength(1);
    }
  });

  it('settings and key changes end both lanes', async () => {
    const t = setup();
    await t.compare.run('q');
    await t.completed(1);
    await t.compare.onSettingsChanged();
    expect(t.server.closed()).toBe(1);
    expect(
      t.delivered.filter(
        (e) => e.event.kind === 'conversation_reset' && e.event.reason === 'settings',
      ),
    ).toHaveLength(2);
  });

  it('the Claude lane declines approval tools without asking too', async () => {
    const t = setup();
    await t.compare.run('q');
    await t.completed(1);
    const canUseTool = (t.claude.calls.options as Options).canUseTool;
    const decision = await canUseTool?.('mcp__datadesk__register_dataset', { path: 'C:/a.csv' }, {
      signal: new AbortController().signal,
      suggestions: [],
      toolUseID: 'x',
    } as never);
    expect(decision).toMatchObject({ behavior: 'deny' });
    expect(t.delivered.some((e) => e.event.kind === 'approval_request')).toBe(false);
  });

  it('stop works while a lane is still starting (nothing is sent to the model)', async () => {
    const t = setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = t.createOpenAISession.getMockImplementation();
    t.createOpenAISession.mockImplementationOnce(async (input) => {
      await gate;
      if (!original) throw new Error('no setup');
      return original(input);
    });
    await t.compare.run('expensive question');
    await t.compare.stop();
    release();
    await vi.waitFor(() => {
      expect(t.lane('openai').at(-1)).toMatchObject({ kind: 'status', status: 'idle' });
    });
    expect(t.openai.requests).toEqual([]);
  });
});
