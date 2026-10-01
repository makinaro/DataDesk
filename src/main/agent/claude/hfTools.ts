import { z } from 'zod';

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

export function isHfTool(name: string): boolean {
  return name.startsWith(`mcp__${HF_SERVER}__`);
}

/**
 * hf_fs takes shell-like commands. The live server's schema (2026-10-01, anonymous) allows
 * ls|cat|attach|stat|find|search, all reads; a token could change that, so we enforce our own
 * list (attach returns images, which we don't need). Strict: an unknown field is refused.
 */
const HF_FS_COMMANDS = ['ls', 'cat', 'stat', 'find', 'search'] as const;
export const HfFsInput = z
  .object({
    operations: z
      .array(
        z
          .object({ cmd: z.enum(HF_FS_COMMANDS), args: z.array(z.string().max(1_000)).max(20) })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

/** Why an HF tool call is refused whoever makes it, or null if its input is fine. */
export function hfInputViolation(toolName: string, input: unknown): string | null {
  if (toolName !== hfTool('hf_fs')) return null;
  return HfFsInput.safeParse(input).success
    ? null
    : `hf_fs: only ${HF_FS_COMMANDS.join(', ')} are allowed, as {operations: [{cmd, args}]}.`;
}
