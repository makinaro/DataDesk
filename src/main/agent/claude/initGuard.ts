import type { SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk';
import { DATADESK_SERVER, EXPECTED_TOOLS } from './agentOptions';

export type InitMessage = Pick<
  SDKSystemMessage,
  'tools' | 'mcp_servers' | 'apiKeySource' | 'permissionMode' | 'cwd' | 'agents'
>;

/**
 * Runtime tripwire: the options *should* produce exactly our tools, but SDK defaults change
 * between versions. If the session the CLI actually started has anything we didn't grant,
 * refuse to run it. Returns a list of problems (empty = OK).
 *
 * Note: `init.skills` lists bundled skills even when `skills: []` disables them, so it isn't
 * checked here; without the Skill tool they can't be invoked.
 */
export function checkInit(init: InitMessage, expected: { cwd: string }): string[] {
  const problems: string[] = [];
  const unexpectedTools = init.tools.filter((t) => !EXPECTED_TOOLS.has(t));
  if (unexpectedTools.length > 0) problems.push(`unexpected tools: ${unexpectedTools.join(', ')}`);

  const servers = init.mcp_servers.map((s) => s.name).filter((n) => n !== DATADESK_SERVER);
  if (servers.length > 0) problems.push(`unexpected MCP servers: ${servers.join(', ')}`);

  if ((init.agents ?? []).length > 0) {
    problems.push(`unexpected agents: ${(init.agents ?? []).join(', ')}`);
  }
  if (init.permissionMode !== 'default') {
    problems.push(`permission mode is ${init.permissionMode}, expected default`);
  }
  if (init.apiKeySource !== 'ANTHROPIC_API_KEY') {
    problems.push(`credentials came from ${init.apiKeySource}, expected the DataDesk key`);
  }
  if (init.cwd.toLowerCase() !== expected.cwd.toLowerCase()) {
    problems.push(`working directory is ${init.cwd}, expected the agent workspace`);
  }
  return problems;
}
