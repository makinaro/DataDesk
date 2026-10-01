/** Our MCP server's name in the agent session; its tools appear as mcp__datadesk__<tool>. */
export const DATADESK_SERVER = 'datadesk';

export const datadeskTool = (name: string): string => `mcp__${DATADESK_SERVER}__${name}`;
