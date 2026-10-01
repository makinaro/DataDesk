import { join } from 'node:path';
import { MCPServerStdio, type Model } from '@openai/agents-core';
import { OpenAIResponsesModel } from '@openai/agents-openai';
import OpenAI from 'openai';
import type { AgentSettings, OpenAIModel } from '../../../shared/agent';
import { buildServerEnv, type ServerPaths } from '../../mcp/serverProcess';
import { DATADESK_TOOL_TIMEOUT_MS } from '../claude/agentOptions';
import { DATADESK_SERVER } from '../claude/datadeskTools';
import { SUBAGENT_SKILLS } from '../claude/subagents';
import { OPENAI_ANALYST_SKILLS, OPENAI_SUBAGENTS } from './analystAgents';
import type { OpenAISessionSetup } from './openaiOrchestrator';
import { loadSkills } from './skills';

/** How long datadesk-mcp may take to start and list its tools. */
export const SERVER_START_TIMEOUT_S = 60;

export type StdioServerOptions = ConstructorParameters<typeof MCPServerStdio>[0];
type ConnectableServer = OpenAISessionSetup['server'] & { connect(): Promise<void> };

export interface OpenAISessionInput {
  apiKey: string;
  modelName: OpenAIModel;
  settings: Pick<AgentSettings, 'maxTurns' | 'maxBudgetUsd'>;
  paths: ServerPaths;
  workspaceDir: string;
  /** Keys this datadesk-mcp's temp dir (servers can run side by side, e.g. in compare mode). */
  instance: string;
  /** Injected in tests: no process is spawned and no client is created. */
  createServer?: (options: StdioServerOptions) => ConnectableServer;
  createModel?: (apiKey: string, modelName: OpenAIModel) => Model;
}

/**
 * The analyst's OpenAI client options. Same pinning as datadesk-mcp's (D-018): OPENAI_BASE_URL,
 * OPENAI_ORG_ID and OPENAI_PROJECT_ID in the environment can't redirect or re-bill requests
 * that carry the key and the whole conversation.
 */
export function openaiClientOptions(apiKey: string): ConstructorParameters<typeof OpenAI>[0] {
  return {
    apiKey,
    baseURL: 'https://api.openai.com/v1',
    organization: null,
    project: null,
    timeout: 120_000,
    maxRetries: 2,
  };
}

export function createResponsesModel(apiKey: string, modelName: OpenAIModel): Model {
  return new OpenAIResponsesModel(new OpenAI(openaiClientOptions(apiKey)), modelName);
}

/**
 * The options datadesk-mcp is spawned with for the OpenAI analyst. The SDK's stdio transport
 * adds only a short OS allowlist (PATH, SYSTEMROOT, TEMP, …) to this env, never all of
 * process.env (CLAUDE.md, Security rule 5). The key goes to the child's environment, not its
 * command line (D-018).
 */
export function datadeskServerOptions(
  input: Pick<OpenAISessionInput, 'apiKey' | 'paths' | 'workspaceDir' | 'instance'>,
): StdioServerOptions {
  return {
    name: DATADESK_SERVER,
    command: process.execPath,
    args: [join(input.paths.mainDir, 'mcp-server.js')],
    cwd: input.workspaceDir,
    env: {
      ...buildServerEnv(input.paths, 'agent', input.instance),
      DATADESK_OPENAI_API_KEY: input.apiKey,
    },
    cacheToolsList: true,
    // Two different clocks in the SDK: `timeout` bounds each tool call (default 60 s, too short
    // for profiling a large file; the tools have their own readable limits), while
    // clientSessionTimeoutSeconds bounds start-up and tool listing (Electron-as-Node + DuckDB).
    timeout: DATADESK_TOOL_TIMEOUT_MS,
    clientSessionTimeoutSeconds: SERVER_START_TIMEOUT_S,
  };
}

/** Skills the session serves: the analyst's on-demand ones plus the sub-agents' preloaded ones. */
export function sessionSkillNames(): string[] {
  return [
    ...new Set([...OPENAI_ANALYST_SKILLS, ...OPENAI_SUBAGENTS.flatMap((n) => SUBAGENT_SKILLS[n])]),
  ];
}

/** Starts datadesk-mcp and builds everything a new OpenAI analyst session needs. */
export async function createOpenAISession(input: OpenAISessionInput): Promise<OpenAISessionSetup> {
  const skills = await loadSkills(input.paths.agentPluginDir, sessionSkillNames());
  const server = (input.createServer ?? ((o) => new MCPServerStdio(o)))(
    datadeskServerOptions(input),
  );
  await server.connect();
  return {
    modelName: input.modelName,
    model: (input.createModel ?? createResponsesModel)(input.apiKey, input.modelName),
    server,
    skills,
    // The key that runs the analyst also enables search_columns / second_opinion: the data
    // they send goes to the same provider the user chose (D-021).
    openaiTools: true,
    maxTurns: input.settings.maxTurns,
    maxBudgetUsd: input.settings.maxBudgetUsd,
  };
}
