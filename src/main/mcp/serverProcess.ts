import { join } from 'node:path';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface ServerPaths {
  /** Electron's userData directory. */
  userData: string;
  /** Directory containing the built mcp-server.js (out/main). */
  mainDir: string;
  /** Pre-fetched DuckDB extensions, if present. */
  extensionDir: string | undefined;
  /** The analyst's skills plugin (resources/agent-plugin). */
  agentPluginDir: string;
}

/**
 * Inherited variables the agent's datadesk-mcp must not receive. When the Claude Code CLI
 * spawns a stdio MCP server it passes down its *own* environment (ANTHROPIC_API_KEY included;
 * verified by probe, D-014) and then applies the server's `env`, so blanking them here wins.
 * The server also scrubs secret-looking variables at startup (src/mcp-server/scrubEnv.ts).
 */
export const BLANKED_FOR_AGENT_SERVER = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_MESSAGING_SOCKET',
] as const;

/**
 * The environment datadesk-mcp gets, built explicitly (CLAUDE.md, Security rule 5).
 * - UI server: spawned by us via StdioClientTransport, which adds only a short OS allowlist.
 * - Agent server: spawned by the Claude Code CLI, which merges in its own env; see above.
 */
export function buildServerEnv(
  paths: ServerPaths,
  purpose: 'ui' | 'agent',
): Record<string, string> {
  const env: Record<string, string> = {
    ELECTRON_RUN_AS_NODE: '1',
    DATADESK_CATALOG_PATH: join(paths.userData, 'catalog.json'),
    DATADESK_ARTIFACTS_DIR: join(paths.userData, 'artifacts'),
    // Nothing inside DataDesk's own profile (secrets, catalog, logs) may be registered as data.
    DATADESK_DENY_DIRS: paths.userData,
    DATADESK_TEMP_DIR: join(paths.userData, 'duckdb-tmp', purpose),
  };
  if (paths.extensionDir) env.DATADESK_EXTENSION_DIR = paths.extensionDir;
  if (purpose === 'agent') {
    for (const name of BLANKED_FOR_AGENT_SERVER) env[name] = '';
  }
  return env;
}

/** Spawns datadesk-mcp with the Electron binary in Node mode (DECISIONS D-003). */
export function createStdioTransport(
  paths: ServerPaths,
  onStderr: (line: string) => void,
): StdioClientTransport {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(paths.mainDir, 'mcp-server.js')],
    env: buildServerEnv(paths, 'ui'),
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) if (line.trim()) onStderr(line.trim());
  });
  return transport;
}
