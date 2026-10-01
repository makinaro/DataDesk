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
 * Sub-agent caps (DECISIONS D-017). The SDK has no Options fields for these, only env vars;
 * semantics verified against code.claude.com/docs/en/env-vars (2026-10-01) and by probe.
 */
export const SUBAGENT_LIMITS = {
  // Only our three agents: no general-purpose (which inherits every tool), Explore, Plan, …
  CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: '1',
  // 1 = sub-agents can't spawn sub-agents (default 3).
  CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1',
  // At most 3 at once (default 20); over the cap the Agent call returns an error result.
  CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '3',
  // Sub-agents run in the foreground, so a turn ends only after its sub-agents finish (they
  // would otherwise run in the background by default).
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
  // No "fork" sub-agents (inherit the whole conversation and run in the background). Already
  // off by default in the SDK; explicit so a CLI default change can't turn it on.
  CLAUDE_CODE_FORK_SUBAGENT: '0',
} as const;

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
    ...SUBAGENT_LIMITS,
    // A desktop app embedding the SDK: no telemetry, update checks or other background traffic.
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
    DISABLE_UPDATES: '1',
    // Fail fast on a bad key instead of ~10 retries.
    CLAUDE_CODE_MAX_RETRIES: '2',
    CLAUDE_AGENT_SDK_CLIENT_APP: `datadesk/${appVersion}`,
  };
}
