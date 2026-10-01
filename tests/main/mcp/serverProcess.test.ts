import { describe, expect, it, vi } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: vi.fn() }));
const { buildServerEnv } = await import('../../../src/main/mcp/serverProcess');

const paths = {
  userData: 'C:/Users/me/AppData/Roaming/DataDesk',
  mainDir: 'C:/app/out/main',
  extensionDir: 'C:/app/resources/duckdb-extensions',
  agentPluginDir: 'C:/app/resources/agent-plugin',
};

describe('buildServerEnv', () => {
  it('passes only DataDesk settings and Electron-as-Node, never the parent environment', () => {
    process.env.SOME_PARENT_SECRET = 'should-not-leak';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-should-not-leak';
    try {
      const env = buildServerEnv(paths, 'ui');
      expect(Object.keys(env).sort()).toEqual([
        'DATADESK_ARTIFACTS_DIR',
        'DATADESK_CATALOG_PATH',
        'DATADESK_DENY_DIRS',
        'DATADESK_EXTENSION_DIR',
        'DATADESK_HF_DIR',
        'DATADESK_TEMP_DIR',
        'ELECTRON_RUN_AS_NODE',
      ]);
      expect(JSON.stringify(env)).not.toContain('should-not-leak');
    } finally {
      delete process.env.SOME_PARENT_SECRET;
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('keeps the catalog in userData and deny-lists userData itself', () => {
    const env = buildServerEnv(paths, 'ui');
    expect(env.DATADESK_CATALOG_PATH).toMatch(/DataDesk[\\/]catalog\.json$/);
    expect(env.DATADESK_DENY_DIRS).toBe(paths.userData);
    expect(env.DATADESK_HF_DIR).toMatch(/DataDesk[\\/]datasets[\\/]hf$/);
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('blanks secrets the Claude Code CLI would pass down to the agent server (D-014)', () => {
    const agent = buildServerEnv(paths, 'agent');
    for (const name of [
      'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_MESSAGING_TOKEN',
      'CLAUDE_CODE_OAUTH_TOKEN',
    ]) {
      expect(agent[name]).toBe('');
    }
    expect(buildServerEnv(paths, 'ui')).not.toHaveProperty('ANTHROPIC_API_KEY');
  });

  it('uses separate temp dirs for the UI and agent servers and omits a missing extension dir', () => {
    const ui = buildServerEnv(paths, 'ui');
    const agent = buildServerEnv({ ...paths, extensionDir: undefined }, 'agent');
    expect(ui.DATADESK_TEMP_DIR).not.toBe(agent.DATADESK_TEMP_DIR);
    expect(agent).not.toHaveProperty('DATADESK_EXTENSION_DIR');
  });
});
