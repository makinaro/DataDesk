import { describe, expect, it } from 'vitest';
import { buildAgentEnv } from '../../../../src/main/agent/claude/agentEnv';
import {
  APPROVAL_TOOLS,
  AUTO_APPROVED_TOOLS,
  buildAgentOptions,
  FORBIDDEN_BUILTINS,
} from '../../../../src/main/agent/claude/agentOptions';
import { checkInit } from '../../../../src/main/agent/claude/initGuard';
import { DEFAULT_AGENT_SETTINGS } from '../../../../src/shared/agent';

const KEY = 'sk-ant-test-key-0123456789';
const USER_DATA = 'C:/Users/me/AppData/Roaming/DataDesk';
const WORKSPACE = `${USER_DATA}/agent-workspace`;

function options() {
  return buildAgentOptions({
    settings: DEFAULT_AGENT_SETTINGS,
    workspaceDir: WORKSPACE,
    env: { ANTHROPIC_API_KEY: KEY },
    mcpServer: { command: 'electron.exe', args: ['mcp-server.js'], env: { X: '1' } },
    canUseTool: () => Promise.resolve({ behavior: 'deny', message: 'no' }),
    abortController: new AbortController(),
  });
}

describe('buildAgentOptions (the whole capability surface of the in-app agent)', () => {
  it('loads nothing from disk and only our MCP server', () => {
    const o = options();
    expect(o.settingSources).toEqual([]);
    expect(o.strictMcpConfig).toBe(true);
    expect(Object.keys(o.mcpServers ?? {})).toEqual(['datadesk']);
    expect(o.cwd).toBe(WORKSPACE);
  });

  it('grants no built-in tools and denies the dangerous ones explicitly', () => {
    const o = options();
    expect(o.tools).toEqual([]);
    expect(o.skills).toEqual([]);
    for (const t of ['Bash', 'Read', 'Write', 'Edit', 'WebFetch', 'WebSearch', 'Agent', 'Skill']) {
      expect(o.disallowedTools).toContain(t);
    }
  });

  it('auto-approves only read-only datadesk tools; register_dataset must ask', () => {
    const o = options();
    expect(o.allowedTools).toEqual([...AUTO_APPROVED_TOOLS]);
    expect(o.allowedTools).not.toContain(APPROVAL_TOOLS[0]);
    expect(o.permissionMode).toBe('default');
  });

  it('disables slash-command dispatch and applies the budget/turn caps', () => {
    const o = options();
    expect(o.extraArgs).toEqual({ 'disable-slash-commands': null });
    expect(o.maxBudgetUsd).toBe(DEFAULT_AGENT_SETTINGS.maxBudgetUsd);
    expect(o.maxTurns).toBe(DEFAULT_AGENT_SETTINGS.maxTurns);
    expect(o.persistSession).toBe(false);
  });
});

describe('buildAgentEnv', () => {
  const parentEnv = {
    Path: 'C:/Windows/system32',
    SystemRoot: 'C:/Windows',
    TEMP: 'C:/Temp',
    USERPROFILE: 'C:/Users/me',
    OPENAI_API_KEY: 'sk-openai-should-not-leak',
    AWS_SECRET_ACCESS_KEY: 'aws-should-not-leak',
    NODE_OPTIONS: '--inspect',
  };

  it('keeps only the OS allowlist (case-insensitively) plus DataDesk settings', () => {
    const env = buildAgentEnv({ apiKey: KEY, userData: USER_DATA, appVersion: '0.1.0', parentEnv });
    expect(env.PATH).toBe('C:/Windows/system32');
    expect(env.SYSTEMROOT).toBe('C:/Windows');
    expect(JSON.stringify(env)).not.toMatch(/should-not-leak|--inspect/);
    expect(env).not.toHaveProperty('Path');
  });

  it('isolates config, memory and connectors, and passes the key only as ANTHROPIC_API_KEY', () => {
    const env = buildAgentEnv({ apiKey: KEY, userData: USER_DATA, appVersion: '0.1.0', parentEnv });
    expect(env.ANTHROPIC_API_KEY).toBe(KEY);
    expect(Object.values(env).filter((v) => v === KEY)).toHaveLength(1);
    expect(env.CLAUDE_CONFIG_DIR).toMatch(/DataDesk[\\/]claude-config$/);
    expect(env).toMatchObject({
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
      CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_AUTOUPDATER: '1',
    });
  });
});

describe('checkInit (runtime tripwire)', () => {
  const good = {
    tools: [...AUTO_APPROVED_TOOLS, ...APPROVAL_TOOLS],
    mcp_servers: [{ name: 'datadesk', status: 'pending' }],
    agents: [],
    permissionMode: 'default' as const,
    apiKeySource: 'ANTHROPIC_API_KEY' as const,
    cwd: WORKSPACE,
  };

  it('accepts exactly what we granted (MCP server may still be pending)', () => {
    expect(checkInit(good, { cwd: WORKSPACE })).toEqual([]);
    expect(checkInit({ ...good, tools: [] }, { cwd: WORKSPACE })).toEqual([]);
  });

  it.each([
    [{ tools: [...good.tools, 'Bash'] }, /unexpected tools: Bash/],
    [{ tools: ['mcp__other__steal'] }, /unexpected tools/],
    [
      { mcp_servers: [...good.mcp_servers, { name: 'claude_ai_Gmail', status: 'connected' }] },
      /MCP servers/,
    ],
    [{ agents: ['general-purpose'] }, /agents/],
    [{ permissionMode: 'bypassPermissions' as const }, /permission mode/],
    [{ apiKeySource: '/login managed key' as const }, /credentials/],
    [{ cwd: 'C:/github_projects/data-analysis-assistant' }, /working directory/],
  ])('flags %j', (override, message) => {
    expect(checkInit({ ...good, ...override }, { cwd: WORKSPACE }).join('\n')).toMatch(message);
  });

  it('knows every built-in we forbid is outside the expected set', () => {
    for (const t of FORBIDDEN_BUILTINS) {
      expect(checkInit({ ...good, tools: [t] }, { cwd: WORKSPACE })).not.toEqual([]);
    }
  });
});
