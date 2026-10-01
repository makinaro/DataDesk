/**
 * The remote Hugging Face MCP server (DECISIONS D-019). Verified 2026-10-01 against
 * huggingface.co/docs/hub/hf-mcp-server, github.com/huggingface/hf-mcp-server and a live
 * anonymous tools/list: stateless streamable HTTP, optional `Authorization: Bearer <token>`.
 */
export const HF_SERVER = 'hf';

/** `no_image_content`: tool results stay text (no images in the model's context). */
export const HF_MCP_URL = 'https://huggingface.co/mcp?no_image_content=true';

/**
 * Carries the user's HF token in the agent CLI's env. The server config holds only the
 * `${…}` placeholder, which the CLI expands (probe, D-019), because the SDK passes mcpServers to
 * the CLI on its command line. datadesk-mcp inherits it too (scrubSecrets keeps DATADESK_*).
 */
export const HF_TOKEN_ENV = 'DATADESK_HF_TOKEN';

export const hfTool = (name: string): string => `mcp__${HF_SERVER}__${name}`;

/**
 * The only HF tools the analyst may have, all read-only. A signed-in user's server also offers
 * write, compute and Gradio tools (create_repo, hf_jobs, dynamic_space, …) and hf_whoami; those
 * are discovered at session start and disallowed.
 */
export const HF_ALLOWED_TOOLS = [
  hfTool('hub_repo_search'),
  hfTool('hub_repo_details'),
  hfTool('hf_fs'),
] as const;

/**
 * The discovered HF tools to pass as `disallowedTools`: everything outside the allowlist.
 * Claude Code names a tool mcp__<server>__<tool> with other characters replaced by `_`.
 */
export function hfDisallowedTools(discovered: readonly string[]): string[] {
  const allowed: readonly string[] = HF_ALLOWED_TOOLS;
  return [
    ...new Set(discovered.map((name) => hfTool(name.replace(/[^A-Za-z0-9_-]/g, '_')))),
  ].filter((tool) => !allowed.includes(tool));
}
