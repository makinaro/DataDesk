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
 * The OpenAI client for the analyst. Same pinning as datadesk-mcp's (D-018): OPENAI_BASE_URL,
 * OPENAI_ORG_ID and OPENAI_PROJECT_ID in the environment can't redirect or re-bill requests.
 */
export function createResponsesModel(apiKey: string, modelName: OpenAIModel): Model {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.openai.com/v1',
    organization: null,
    project: null,
    timeout: 120_000,
    maxRetries: 2,
  });
  return new OpenAIResponsesModel(client, modelName);
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
    clientSessionTimeoutSeconds: DATADESK_TOOL_TIMEOUT_MS / 1000,
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
