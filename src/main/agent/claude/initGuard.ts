import type { SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk';
import { DATADESK_SERVER, EXPECTED_TOOLS, PLUGIN_NAME, SKILL_NAMES } from './agentOptions';

export type InitMessage = Pick<
  SDKSystemMessage,
  | 'tools'
  | 'mcp_servers'
  | 'apiKeySource'
  | 'permissionMode'
  | 'cwd'
  | 'agents'
  | 'skills'
  | 'plugins'
  | 'plugin_errors'
>;

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Runtime tripwire: the options *should* produce exactly what we grant, but SDK defaults change
 * between versions. If the session the CLI actually started differs, refuse to run it.
 * Returns a list of problems (empty = OK).
 *
 * `init.skills` lists every discovered skill (including a few from Claude Code's built-in
 * plugins) whether or not the `skills` allowlist lets the model invoke them, so we only require
 * that *our* skills are present, i.e. the plugin really loaded.
 */
export function checkInit(
  init: InitMessage,
  expected: { cwd: string; pluginDir: string },
): string[] {
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

  // Plugins: Claude Code's own built-ins are fine; any other plugin must be exactly ours.
  const foreign = init.plugins.filter(
    (p) =>
      p.path !== 'builtin' && !(p.name === PLUGIN_NAME && samePath(p.path, expected.pluginDir)),
  );
  if (foreign.length > 0) {
    problems.push(`unexpected plugins: ${foreign.map((p) => `${p.name} (${p.path})`).join(', ')}`);
  }
  if ((init.plugin_errors ?? []).length > 0) {
    problems.push(
      `plugin errors: ${(init.plugin_errors ?? []).map((e) => `${e.plugin}: ${e.message}`).join('; ')}`,
    );
  }
  const missingSkills = SKILL_NAMES.filter((s) => !init.skills.includes(s));
  if (missingSkills.length > 0) {
    problems.push(`DataDesk skills did not load: ${missingSkills.join(', ')}`);
  }
  return problems;
}
