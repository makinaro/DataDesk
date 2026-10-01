import { join } from 'node:path';
import OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { explainOpenAIError } from '../../../../src/main/agent/openai/errors';
import {
  createOpenAISession,
  datadeskServerOptions,
  sessionSkillNames,
  type StdioServerOptions,
} from '../../../../src/main/agent/openai/openaiSession';
import { scriptedModel } from './fakeOpenAI';

const KEY = 'sk-test-openai-0123456789';
const paths = {
  userData: 'C:/Users/me/AppData/Roaming/DataDesk',
  mainDir: 'C:/app/out/main',
  extensionDir: undefined,
  agentPluginDir: join(process.cwd(), 'resources', 'agent-plugin'),
};
const input = {
  apiKey: KEY,
  paths,
  workspaceDir: `${paths.userData}/agent-workspace`,
  instance: 'openai',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('datadeskServerOptions (the OpenAI analyst’s datadesk-mcp)', () => {
  it('spawns our server with an explicit env: the OpenAI key in the env, never in args', () => {
    vi.stubEnv('SOME_PARENT_SECRET', 'leak-me');
    const options = datadeskServerOptions(input) as StdioServerOptions & {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
    expect(options.command).toBe(process.execPath);
    expect(options.args).toEqual([join(paths.mainDir, 'mcp-server.js')]);
    expect(JSON.stringify(options.args)).not.toContain(KEY);
    expect(options.env.DATADESK_OPENAI_API_KEY).toBe(KEY);
    expect(options.env).not.toHaveProperty('SOME_PARENT_SECRET');
    expect(options.env).not.toHaveProperty('DATADESK_HF_TOKEN');
    expect(options.env.ANTHROPIC_API_KEY).toBe('');
    expect(options.env.DATADESK_TEMP_DIR).toMatch(/agent-openai$/);
    expect(options.cwd).toBe(input.workspaceDir);
    expect(options.name).toBe('datadesk');
  });
});

describe('createOpenAISession', () => {
  it('connects datadesk-mcp, loads the skills and sets the session limits', async () => {
    const connect = vi.fn(() => Promise.resolve());
    const createServer = vi.fn((_options: StdioServerOptions) => ({
      connect,
      listTools: () => Promise.resolve([]),
      callTool: () => Promise.reject(new Error('unused')),
      close: () => Promise.resolve(),
    }));
    const createModel = vi.fn(() => scriptedModel({}).model);
    const setup = await createOpenAISession({
      ...input,
      modelName: 'gpt-5.4',
      settings: { maxTurns: 7, maxBudgetUsd: 1.5 },
      createServer,
      createModel,
    });
    expect(connect).toHaveBeenCalledOnce();
    expect(createModel).toHaveBeenCalledWith(KEY, 'gpt-5.4');
    expect(setup).toMatchObject({
      modelName: 'gpt-5.4',
      maxTurns: 7,
      maxBudgetUsd: 1.5,
      openaiTools: true,
    });
    expect(setup.skills.map((s) => s.name).sort()).toEqual(sessionSkillNames().sort());
    expect(sessionSkillNames()).not.toContain('datadesk:evaluating-datasets');
  });
});

describe('explainOpenAIError', () => {
  it('never repeats the raw API message (it can echo a masked key)', () => {
    const raw = new OpenAI.AuthenticationError(
      401,
      { message: 'Incorrect API key provided: sk-test-****6789' },
      'Incorrect API key provided: sk-test-****6789',
      new Headers(),
    );
    expect(explainOpenAIError(raw)).toBe(
      'OpenAI rejected the API key (401). Check it in Settings.',
    );
    expect(explainOpenAIError(new Error('wrapped', { cause: raw }))).toMatch(/401/);
    expect(
      explainOpenAIError(new OpenAI.RateLimitError(429, undefined, 'quota', new Headers())),
    ).toMatch(/429/);
    expect(explainOpenAIError(new Error('first line\nsecond'))).toBe('first line');
  });
});
