import { join } from 'node:path';

/**
 * OS variables the Claude Code binary needs on Windows (it must be able to locate PowerShell,
 * a temp dir and the user profile). Same allowlist the MCP SDK uses for stdio children, plus TMP.
 */
const INHERITED = [
  'APPDATA',
  'HOMEDRIVE',
  'HOMEPATH',
  'LOCALAPPDATA',
  'PATH',
  'PROCESSOR_ARCHITECTURE',
  'PROGRAMFILES',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERNAME',
  'USERPROFILE',
] as const;

/** Windows env keys are case-insensitive (`Path` vs `PATH`); look them up that way. */
function lookup(env: NodeJS.ProcessEnv, key: string): string | undefined {
  if (env[key] !== undefined) return env[key];
  const match = Object.keys(env).find((k) => k.toUpperCase() === key);
  return match === undefined ? undefined : env[match];
}

export interface AgentEnvInput {
  apiKey: string;
  userData: string;
  appVersion: string;
  parentEnv: NodeJS.ProcessEnv;
}

/**
 * The complete environment of the Claude Code process. The SDK's `env` option *replaces* the
 * child's environment, so nothing reaches it unless listed here (CLAUDE.md, Security rule 5).
 */
export function buildAgentEnv({
  apiKey,
  userData,
  appVersion,
  parentEnv,
}: AgentEnvInput): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of INHERITED) {
    const value = lookup(parentEnv, key);
    if (value !== undefined) env[key] = value;
  }
  return {
    ...env,
    ANTHROPIC_API_KEY: apiKey,
    // Isolation (DECISIONS D-004): own config dir, no auto memory, no claude.ai connectors.
    CLAUDE_CONFIG_DIR: join(userData, 'claude-config'),
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    // No built-in general-purpose sub-agent; our own sub-agents arrive in Phase 4.
    CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: '1',
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1',
    // A desktop app embedding the SDK: no telemetry, update checks or other background traffic.
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
    DISABLE_UPDATES: '1',
    // Fail fast on a bad key instead of ~10 retries.
    CLAUDE_CODE_MAX_RETRIES: '2',
    CLAUDE_AGENT_SDK_CLIENT_APP: `datadesk/${appVersion}`,
  };
}
