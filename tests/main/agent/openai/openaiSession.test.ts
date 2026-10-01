import { join } from 'node:path';
import OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOpenAISession,
  datadeskServerOptions,
  openaiClientOptions,
  SERVER_START_TIMEOUT_S,
  sessionSkillNames,
  type StdioServerOptions,
} from '../../../../src/main/agent/openai/openaiSession';
import { DATADESK_TOOL_TIMEOUT_MS } from '../../../../src/main/agent/claude/agentOptions';
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

  it('bounds tool calls and start-up separately (the SDK has two clocks)', () => {
    const options = datadeskServerOptions(input);
    // `timeout` is per tool call (SDK default 60 s); the session timeout only covers start-up.
    expect(options.timeout).toBe(DATADESK_TOOL_TIMEOUT_MS);
    expect(options.clientSessionTimeoutSeconds).toBe(SERVER_START_TIMEOUT_S);
    expect(SERVER_START_TIMEOUT_S).toBeLessThanOrEqual(60);
  });
});

describe('openaiClientOptions', () => {
  it('pins the endpoint: OPENAI_* variables cannot redirect or re-bill the analyst', () => {
    vi.stubEnv('OPENAI_BASE_URL', 'https://evil.example/v1');
    vi.stubEnv('OPENAI_ORG_ID', 'org-someone-else');
    vi.stubEnv('OPENAI_PROJECT_ID', 'proj-someone-else');
    const client = new OpenAI(openaiClientOptions(KEY));
    expect(client.baseURL).toBe('https://api.openai.com/v1');
    expect(client.organization).toBeNull();
    expect(client.project).toBeNull();
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
