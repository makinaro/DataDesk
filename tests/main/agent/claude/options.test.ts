import { describe, expect, it } from 'vitest';
import { buildAgentEnv } from '../../../../src/main/agent/claude/agentEnv';
import {
  APPROVAL_TOOLS,
  AUTO_APPROVED_TOOLS,
  buildAgentOptions,
  FORBIDDEN_BUILTINS,
  SKILL_NAMES,
} from '../../../../src/main/agent/claude/agentOptions';
import { hfDisallowedTools } from '../../../../src/main/agent/claude/hfTools';
import { checkInit } from '../../../../src/main/agent/claude/initGuard';
import { neutralizeSlashCommand } from '../../../../src/main/agent/claude/inputQueue';
import { scopeHook } from '../../../../src/main/agent/claude/scopeHook';
import { DEFAULT_AGENT_SETTINGS } from '../../../../src/shared/agent';

const KEY = 'sk-ant-test-key-0123456789';
const USER_DATA = 'C:/Users/me/AppData/Roaming/DataDesk';
const WORKSPACE = `${USER_DATA}/agent-workspace`;
const PLUGIN = 'C:/Program Files/DataDesk/resources/agent-plugin';
const expected = { cwd: WORKSPACE, pluginDir: PLUGIN, openaiTools: false, hfTools: false };

const baseInput = {
  settings: DEFAULT_AGENT_SETTINGS,
  openaiTools: false,
  hfTools: false,
  workspaceDir: WORKSPACE,
  env: { ANTHROPIC_API_KEY: KEY },
  mcpServer: { command: 'electron.exe', args: ['mcp-server.js'], env: { X: '1' } },
  canUseTool: () => Promise.resolve({ behavior: 'deny' as const, message: 'no' }),
  abortController: new AbortController(),
  pluginDir: PLUGIN,
};

function options(openaiTools = false, hfTools = false) {
  return buildAgentOptions({ ...baseInput, openaiTools, hfTools });
}

describe('buildAgentOptions (the whole capability surface of the in-app agent)', () => {
  it('loads nothing from disk and only our MCP server', () => {
    const o = options();
    expect(o.settingSources).toEqual([]);
    expect(o.strictMcpConfig).toBe(true);
    expect(Object.keys(o.mcpServers ?? {})).toEqual(['datadesk']);
    expect(o.cwd).toBe(WORKSPACE);
  });

  it('grants only Skill and the sub-agent tool, and denies the dangerous built-ins explicitly', () => {
    const o = options();
    expect(o.tools).toEqual(['Skill', 'Agent']);
    for (const t of ['Skill', 'Agent', 'Task']) expect(o.disallowedTools).not.toContain(t);
    for (const t of ['Bash', 'Read', 'Write', 'Edit', 'WebFetch', 'WebSearch', 'ToolSearch']) {
      expect(o.disallowedTools).toContain(t);
    }
  });

  it('defines exactly our three sub-agents, enforces scope with a hook, forwards their text', () => {
    const o = options();
    expect(Object.keys(o.agents ?? {}).sort()).toEqual([
      'profiler',
      'report-writer',
      'sql-analyst',
    ]);
    expect(o.hooks?.PreToolUse).toEqual([{ hooks: [scopeHook] }]);
    expect(o.forwardSubagentText).toBe(true);
  });

  it('loads only our plugin and allows only our three skills, without shell injection', () => {
    const o = options();
    expect(o.plugins).toEqual([{ type: 'local', path: PLUGIN, skipMcpDiscovery: true }]);
    expect(o.skills).toEqual([...SKILL_NAMES]);
    expect(o.settings).toEqual({ disableSkillShellExecution: true, disableBundledSkills: true });
  });

  it('auto-approves only read-only datadesk tools; register_dataset must ask', () => {
    const o = options();
    expect(o.allowedTools).toEqual([...AUTO_APPROVED_TOOLS]);
    expect(o.allowedTools).not.toContain(APPROVAL_TOOLS[0]);
    expect(o.permissionMode).toBe('default');
  });

  it('applies the budget/turn caps (slash commands stay on for skills; see InputQueue)', () => {
    const o = options();
    expect(o.extraArgs).toBeUndefined();
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
      CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1',
      CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '3',
      CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
      CLAUDE_CODE_FORK_SUBAGENT: '0',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_AUTOUPDATER: '1',
    });
  });
});

describe('checkInit (runtime tripwire)', () => {
  const good = {
    tools: ['Task', 'Skill', ...AUTO_APPROVED_TOOLS, ...APPROVAL_TOOLS],
    skills: [...SKILL_NAMES, 'doctor'],
    plugins: [
      // The CLI reports Windows-style paths; the guard compares paths separator-insensitively.
      { name: 'datadesk', path: PLUGIN.split('/').join('\\') },
      { name: 'cc-plugin-agents-md', path: 'builtin' },
    ],
    mcp_servers: [{ name: 'datadesk', status: 'pending' }],
    agents: ['profiler', 'sql-analyst', 'report-writer'],
    permissionMode: 'default' as const,
    apiKeySource: 'ANTHROPIC_API_KEY' as const,
    cwd: WORKSPACE,
  };

  it('accepts exactly what we granted (MCP server may still be pending)', () => {
    expect(checkInit(good, expected)).toEqual([]);
    expect(checkInit({ ...good, tools: [] }, expected)).toEqual([]);
  });

  it.each([
    [{ tools: [...good.tools, 'Bash'] }, /unexpected tools: Bash/],
    [{ tools: ['mcp__other__steal'] }, /unexpected tools/],
    [
      { mcp_servers: [...good.mcp_servers, { name: 'claude_ai_Gmail', status: 'connected' }] },
      /MCP servers/,
    ],
    [
      { agents: ['profiler', 'sql-analyst', 'report-writer', 'general-purpose'] },
      /unexpected agents: general-purpose/,
    ],
    [{ agents: ['profiler', 'sql-analyst'] }, /sub-agents did not load: report-writer/],
    [{ agents: [] }, /sub-agents did not load/],
    [{ agents: undefined }, /sub-agents did not load/],
    [{ permissionMode: 'bypassPermissions' as const }, /permission mode/],
    [{ apiKeySource: '/login managed key' as const }, /credentials/],
    [{ cwd: 'C:/github_projects/data-analysis-assistant' }, /working directory/],
    [{ plugins: [...good.plugins, { name: 'evil', path: 'C:/evil' }] }, /unexpected plugins: evil/],
    [{ plugins: [{ name: 'datadesk', path: 'C:/elsewhere' }] }, /unexpected plugins: datadesk/],
    [
      { plugin_errors: [{ plugin: 'datadesk', type: 'x', message: 'bad manifest' }] },
      /plugin errors/,
    ],
    [{ skills: ['doctor'] }, /DataDesk skills did not load/],
  ])('flags %j', (override, message) => {
    expect(checkInit({ ...good, ...override }, expected).join('\n')).toMatch(message);
  });

  it('knows every built-in we forbid is outside the expected set', () => {
    for (const t of FORBIDDEN_BUILTINS) {
      expect(checkInit({ ...good, tools: [t] }, expected)).not.toEqual([]);
    }
  });
});

describe('neutralizeSlashCommand', () => {
  it('stops Claude Code from dispatching chat messages as /commands (probe: a leading space)', () => {
    expect(neutralizeSlashCommand('/cost')).toBe(' /cost');
    expect(neutralizeSlashCommand('/datadesk:eda-checklist')).toBe(' /datadesk:eda-checklist');
    expect(neutralizeSlashCommand('What does /cost mean?')).toBe('What does /cost mean?');
  });
});

describe('OpenAI tools (only with a key)', () => {
  const OPENAI = ['mcp__datadesk__search_columns', 'mcp__datadesk__second_opinion'];

  it('are auto-approved, described in the prompt, and given to the right sub-agents', () => {
    const o = options(true);
    expect(o.allowedTools).toEqual(expect.arrayContaining(OPENAI));
    expect(o.systemPrompt).toContain('second_opinion');
    expect(o.agents?.profiler?.tools).toContain('mcp__datadesk__search_columns');
    expect(o.agents?.profiler?.tools).not.toContain('mcp__datadesk__second_opinion');
    expect(o.agents?.['sql-analyst']?.tools).toEqual(expect.arrayContaining(OPENAI));
    expect(o.agents?.['report-writer']?.tools).toEqual(['mcp__datadesk__save_report']);
  });

  it('are absent everywhere without a key', () => {
    const o = options(false);
    for (const t of OPENAI) {
      expect(o.allowedTools).not.toContain(t);
      for (const def of Object.values(o.agents ?? {})) expect(def.tools).not.toContain(t);
    }
    expect(o.systemPrompt).not.toContain('second_opinion');
  });

  it('the guard expects them only when a key was set', () => {
    const init = {
      tools: ['Task', 'Skill', ...AUTO_APPROVED_TOOLS, ...APPROVAL_TOOLS, ...OPENAI],
      skills: [...SKILL_NAMES],
      plugins: [{ name: 'datadesk', path: PLUGIN }],
      mcp_servers: [{ name: 'datadesk', status: 'connected' }],
      agents: ['profiler', 'sql-analyst', 'report-writer'],
      permissionMode: 'default' as const,
      apiKeySource: 'ANTHROPIC_API_KEY' as const,
      cwd: WORKSPACE,
    };
    expect(checkInit(init, { ...expected, openaiTools: true })).toEqual([]);
    expect(checkInit(init, expected).join('\n')).toMatch(/unexpected tools: .*search_columns/);
  });
});

describe('Hugging Face server (only with a token)', () => {
  const HF = ['mcp__hf__hub_repo_search', 'mcp__hf__hub_repo_details', 'mcp__hf__hf_fs'];
  const init = {
    tools: ['Task', 'Skill', ...AUTO_APPROVED_TOOLS, ...APPROVAL_TOOLS, ...HF],
    skills: [...SKILL_NAMES],
    plugins: [{ name: 'datadesk', path: PLUGIN }],
    mcp_servers: [
      { name: 'datadesk', status: 'connected' },
      { name: 'hf', status: 'connected' },
    ],
    agents: ['profiler', 'sql-analyst', 'report-writer'],
    permissionMode: 'default' as const,
    apiKeySource: 'ANTHROPIC_API_KEY' as const,
    cwd: WORKSPACE,
  };
  const withHf = { ...expected, hfTools: true };

  it('is a remote http server whose header is only an env placeholder, connected before init', () => {
    const hf = options(false, true).mcpServers?.hf;
    expect(hf).toEqual({
      type: 'http',
      url: 'https://huggingface.co/mcp?no_image_content=true',
      headers: { Authorization: 'Bearer ${DATADESK_HF_TOKEN}' },
      alwaysLoad: true,
    });
    // ?login would start HF's OAuth flow.
    expect(JSON.stringify(hf)).not.toContain('login');
  });

  it('auto-approves only the three read-only tools and explains the Hub is untrusted', () => {
    const o = options(false, true);
    expect(o.allowedTools?.filter((t) => t.startsWith('mcp__hf__'))).toEqual(HF);
    expect(o.systemPrompt).toMatch(/untrusted/);
  });

  it('hides every discovered tool outside the allowlist, named as Claude Code names them', () => {
    expect(
      hfDisallowedTools([
        'hub_repo_search',
        'hf_fs',
        'create_repo',
        'gr1.image gen',
        'create_repo',
      ]),
    ).toEqual(['mcp__hf__create_repo', 'mcp__hf__gr1_image_gen']);
    const o = buildAgentOptions({
      ...baseInput,
      hfTools: true,
      hfDisallowedTools: ['mcp__hf__create_repo'],
    });
    expect(o.disallowedTools).toContain('mcp__hf__create_repo');
    // Without HF the list has no effect.
    expect(
      buildAgentOptions({ ...baseInput, hfDisallowedTools: ['mcp__hf__x'] }).disallowedTools,
    ).not.toContain('mcp__hf__x');
  });

  it('is absent without a token', () => {
    const o = options();
    expect(Object.keys(o.mcpServers ?? {})).toEqual(['datadesk']);
    expect(o.allowedTools?.some((t) => t.startsWith('mcp__hf__'))).toBe(false);
    expect(o.systemPrompt).not.toContain('hub_repo_search');
  });

  it('the guard accepts the hf server and its allowlisted tools only when a token was set', () => {
    expect(checkInit(init, withHf)).toEqual([]);
    // A failed hf server (bad token, offline) just means no HF tools.
    const failed = { ...init, tools: init.tools.filter((t) => !HF.includes(t)) };
    expect(checkInit({ ...failed, mcp_servers: [...init.mcp_servers] }, withHf)).toEqual([]);
    const problems = checkInit(init, expected).join('\n');
    expect(problems).toMatch(/unexpected tools: .*hub_repo_search/);
    expect(problems).toMatch(/unexpected MCP servers: hf/);
  });

  it.each([
    'mcp__hf__create_repo',
    'mcp__hf__hf_jobs',
    'mcp__hf__dynamic_space',
    'mcp__hf__hf_whoami',
  ])('the guard refuses a session that offers %s', (tool) => {
    expect(checkInit({ ...init, tools: [...init.tools, tool] }, withHf).join('\n')).toMatch(
      `unexpected tools: ${tool}`,
    );
  });
});
