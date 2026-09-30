/**
 * datadesk-mcp parses untrusted files and runs model-written SQL, so it must not hold secrets it
 * doesn't need. When the Claude Code CLI spawns it for the agent, the CLI passes its *own*
 * environment down (including ANTHROPIC_API_KEY and its messaging token; verified by probe,
 * DECISIONS D-014). This runs first thing at startup and deletes anything secret-looking.
 *
 * Secrets the server legitimately needs (Phase 5+) arrive under DATADESK_* names and are read
 * explicitly by config.ts.
 */
const SECRET_NAME = /(API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|MESSAGING_SOCKET)/i;

export function scrubSecrets(env: NodeJS.ProcessEnv): string[] {
  const removed: string[] = [];
  for (const name of Object.keys(env)) {
    if (name.toUpperCase().startsWith('DATADESK_')) continue;
    if (SECRET_NAME.test(name)) {
      Reflect.deleteProperty(env, name);
      removed.push(name);
    }
  }
  return removed.sort();
}
