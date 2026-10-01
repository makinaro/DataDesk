import type { AgentEventInput } from '../../shared/agent';
import { datadeskTool } from './claude/datadeskTools';

const ARTIFACT_TOOLS: Record<string, 'chart' | 'report'> = {
  [datadeskTool('create_chart')]: 'chart',
  [datadeskTool('save_report')]: 'report',
};

/**
 * datadesk-mcp's text result is a summary line followed by the structuredContent JSON
 * (src/mcp-server/server.ts `ok`). Pull the artifact id and title out of it.
 */
export function artifactFromResult(
  toolName: string | undefined,
  text: string,
): AgentEventInput | undefined {
  const artifactKind = toolName === undefined ? undefined : ARTIFACT_TOOLS[toolName];
  if (!artifactKind) return undefined;
  // JSON.stringify never emits raw newlines, so the JSON starts after the last one (a title
  // in the summary line could contain a newline).
  const json = text.slice(text.lastIndexOf('\n') + 1);
  try {
    const parsed = JSON.parse(json) as { chartId?: unknown; reportId?: unknown; title?: unknown };
    const id = artifactKind === 'chart' ? parsed.chartId : parsed.reportId;
    if (typeof id !== 'string' || typeof parsed.title !== 'string') return undefined;
    return { kind: 'artifact', artifactKind, id, title: parsed.title.slice(0, 200) };
  } catch {
    return undefined;
  }
}
