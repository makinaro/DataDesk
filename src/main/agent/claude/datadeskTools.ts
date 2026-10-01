/** Our MCP server's name in the agent session; its tools appear as mcp__datadesk__<tool>. */
export const DATADESK_SERVER = 'datadesk';

export const datadeskTool = (name: string): string => `mcp__${DATADESK_SERVER}__${name}`;

/**
 * Tools datadesk-mcp registers only when an OpenAI key is set (DECISIONS D-018). Both send data
 * to OpenAI; setting the key in Settings is the user's opt-in.
 */
export const OPENAI_TOOLS = [
  datadeskTool('search_columns'),
  datadeskTool('second_opinion'),
] as const;
