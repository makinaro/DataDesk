import {
  Agent,
  type FunctionTool,
  type MCPServer,
  type Model,
  type ModelSettings,
  type RunStreamEvent,
} from '@openai/agents-core';
import { approvalQuestion, needsApproval } from '../approvalQuestions';
import {
  ANALYST_CORE_PROMPT,
  APPROVAL_TOOLS,
  AUTO_APPROVED_TOOLS,
  OPENAI_TOOLS_PROMPT,
} from '../claude/agentOptions';
import { datadeskTool, OPENAI_TOOLS } from '../claude/datadeskTools';
import {
  SUBAGENT_MAX_TURNS,
  SUBAGENT_PROMPTS,
  SUBAGENT_SKILLS,
  SUBAGENT_TOOLS,
  subagentNames,
  type SubagentName,
} from '../claude/subagents';
import type { LoadedSkill } from './skills';

/** A tool as datadesk-mcp lists it (the SDK's MCPTool, which its index doesn't export). */
export type MCPTool = Awaited<ReturnType<MCPServer['listTools']>>[number];

/** Who is calling a tool: the analyst, or one of its sub-agents. */
export type Caller = 'analyst' | SubagentName;

/** The analyst's skill tool; named like Claude's, so the timeline reads the same. */
export const SKILL_TOOL = 'Skill';

/** Skills the analyst can load on demand (no Hub skill: no HF on this provider, D-021). */
export const OPENAI_ANALYST_SKILLS = [
  'datadesk:eda-checklist',
  'datadesk:chart-style',
  'datadesk:report-format',
] as const;

/** Sub-agents on this provider: the Claude scope table's rows, minus the HF-only scout. */
export const OPENAI_SUBAGENTS = subagentNames({ hfTools: false });

/**
 * A sub-agent's tool name. The SDK turns agent-tool names into function names by replacing
 * '-' with '_' (observed: sql-analyst becomes sql_analyst), so we name them that way ourselves.
 */
export function subagentToolName(name: SubagentName): string {
  return name.replaceAll('-', '_');
}

/** The sub-agent behind an analyst tool name, if it is one. */
export function subagentForTool(toolName: string): SubagentName | undefined {
  return OPENAI_SUBAGENTS.find((name) => subagentToolName(name) === toolName);
}

/** The analyst's own datadesk tools (no Hub tools, no load_hf_dataset; D-021). */
export function analystDatadeskTools(openaiTools: boolean): string[] {
  return [...AUTO_APPROVED_TOOLS, ...(openaiTools ? OPENAI_TOOLS : []), ...APPROVAL_TOOLS];
}

/** A sub-agent's datadesk tools, straight from the shared scope table (D-017). */
export function subagentDatadeskTools(name: SubagentName, openaiTools: boolean): string[] {
  return SUBAGENT_TOOLS[name].filter(
    (t) => openaiTools || !(OPENAI_TOOLS as readonly string[]).includes(t),
  );
}

const OPENAI_DELEGATION_PROMPT = `Delegating (sub-agent tools profiler, sql_analyst, report_writer):
- For simple questions, answer yourself. For bigger jobs, call a sub-agent tool: profiler (explore one dataset), sql_analyst (answer one concrete question, optionally with a chart), report_writer (write the final report from findings you pass it; it cannot query data).
- Each sub-agent starts fresh: put everything it needs in its input (dataset names, the question, relevant facts, chartIds). Sub-agents cost extra time and tokens, so delegate only when it helps.
- "Analyze X and write a report" typically means: profiler, then one or more sql_analyst runs, then report_writer.
- Skill loads a checklist or style guide (EDA, charts, reports); load it before that kind of work.`;

export function openaiAnalystPrompt(openaiTools: boolean): string {
  return [
    ANALYST_CORE_PROMPT,
    OPENAI_DELEGATION_PROMPT,
    ...(openaiTools ? [OPENAI_TOOLS_PROMPT] : []),
  ].join('\n\n');
}

/** Asks the user about one approval-tool call (ApprovalBroker); resolves to their answer. */
export type AskUser = (
  toolName: string,
  question: NonNullable<ReturnType<typeof approvalQuestion>>,
  signal: AbortSignal | undefined,
) => Promise<boolean>;

export interface AnalystTreeInput {
  /** The tools datadesk-mcp listed (raw names, e.g. run_sql). */
  listed: readonly MCPTool[];
  server: Pick<MCPServer, 'callTool'>;
  model: Model;
  modelSettings: ModelSettings;
  openaiTools: boolean;
  skills: readonly LoadedSkill[];
  askUser: AskUser;
  /** Tool calls whose result is an error (the Responses API has no error flag on outputs). */
  markError: (callId: string) => void;
  /** Sub-agent run events, tagged with the analyst's call that started the sub-agent. */
  onSubagentEvent: (event: RunStreamEvent, parentCallId: string | null) => void;
  signal: AbortSignal;
}

function resultText(result: Awaited<ReturnType<MCPServer['callTool']>>): string {
  return result
    .map((c) => (c.type === 'text' && typeof c.text === 'string' ? c.text : `[${c.type}]`))
    .join('\n');
}

function parseArgs(input: string): unknown {
  try {
    return input.trim() === '' ? {} : (JSON.parse(input) as unknown);
  } catch {
    return undefined;
  }
}

/**
 * One datadesk-mcp tool as an SDK function tool, bound to one caller. Names follow the Claude
 * side (mcp__datadesk__run_sql), so events, artifacts and the timeline are provider-neutral.
 */
export function datadeskFunctionTool(
  listedTool: MCPTool,
  caller: Caller,
  input: AnalystTreeInput,
): FunctionTool {
  const name = datadeskTool(listedTool.name);
  const fail = (callId: string | undefined, message: string) => {
    if (callId) input.markError(callId);
    return message;
  };
  return {
    type: 'function',
    name,
    description: listedTool.description ?? '',
    // Sent as the server declares it; non-strict, so optional parameters stay optional.
    parameters: listedTool.inputSchema as FunctionTool['parameters'],
    strict: false,
    needsApproval: () => Promise.resolve(false),
    isEnabled: () => Promise.resolve(true),
    invoke: async (_context, rawInput, details) => {
      const callId = details?.toolCall?.callId;
      const signal = details?.signal ?? input.signal;
      let args = parseArgs(rawInput);
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        return fail(callId, `Invalid ${name} input: expected a JSON object.`);
      }
      if (needsApproval(name)) {
        // Same rules as the Claude canUseTool gate: only the analyst may ask the user.
        if (caller !== 'analyst')
          return fail(callId, 'Only the main analyst can ask the user to add files.');
        const question = approvalQuestion(name, args);
        if (!question) return fail(callId, `Invalid ${name} input; nothing was asked.`);
        // Never open a dialog for a turn that was already stopped or reset.
        if (signal.aborted) return fail(callId, 'The turn was stopped; nothing was asked.');
        if (!(await input.askUser(name, question, signal))) {
          return fail(callId, `${question.declined} Do not retry.`);
        }
        args = question.input;
      }
      try {
        const result = await input.server.callTool(
          listedTool.name,
          args as Record<string, unknown>,
          null,
          {
            signal,
          },
        );
        const text = resultText(result);
        return result.isError === true ? fail(callId, text) : text;
      } catch (error) {
        return fail(
          callId,
          `${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}

function datadeskTools(
  names: readonly string[],
  caller: Caller,
  input: AnalystTreeInput,
): FunctionTool[] {
  return names.map((name) => {
    const listedTool = input.listed.find((t) => datadeskTool(t.name) === name);
    // The session checks every expected tool exists before building agents.
    if (!listedTool) throw new Error(`datadesk-mcp does not provide ${name}.`);
    return datadeskFunctionTool(listedTool, caller, input);
  });
}

function skillTool(skills: readonly LoadedSkill[]): FunctionTool {
  const names = skills.map((s) => s.name);
  return {
    type: 'function',
    name: SKILL_TOOL,
    description: `Loads a DataDesk skill (instructions to follow). Available:\n${skills
      .map((s) => `- ${s.name}: ${s.description}`)
      .join('\n')}`,
    parameters: {
      type: 'object',
      properties: { skill: { type: 'string', enum: names } },
      required: ['skill'],
      additionalProperties: false,
    },
    strict: true,
    needsApproval: () => Promise.resolve(false),
    isEnabled: () => Promise.resolve(true),
    invoke: (_context, rawInput) => {
      const args = parseArgs(rawInput) as { skill?: unknown } | undefined;
      const skill = skills.find((s) => s.name === args?.skill);
      return Promise.resolve(
        skill
          ? `Skill ${skill.name}:\n\n${skill.body}`
          : `Unknown skill. Use one of: ${names.join(', ')}.`,
      );
    },
  };
}

/**
 * Builds the analyst and its sub-agents for one turn (the per-turn abort signal is baked into
 * each sub-agent run). Agents-as-tools: each sub-agent is a tool of the analyst that runs a
 * fresh nested agent with only its scope-table tools and its preloaded skill (D-017, D-021).
 */
export function buildAnalystTree(input: AnalystTreeInput): Agent {
  const subagents = OPENAI_SUBAGENTS.map((name) => {
    const preloaded = input.skills.filter((s) => SUBAGENT_SKILLS[name].includes(s.name));
    const agent = new Agent({
      name,
      instructions: [
        SUBAGENT_PROMPTS[name].prompt,
        ...preloaded.map((s) => `Skill ${s.name}:\n\n${s.body}`),
      ].join('\n\n'),
      model: input.model,
      modelSettings: input.modelSettings,
      tools: datadeskTools(subagentDatadeskTools(name, input.openaiTools), name, input),
    });
    return agent.asTool({
      toolName: subagentToolName(name),
      toolDescription: SUBAGENT_PROMPTS[name].description,
      runConfig: { tracingDisabled: true, traceIncludeSensitiveData: false },
      runOptions: { maxTurns: SUBAGENT_MAX_TURNS, signal: input.signal },
      onStream: ({ event, toolCall }) => {
        input.onSubagentEvent(event, toolCall?.callId ?? null);
      },
    });
  });
  return new Agent({
    name: 'analyst',
    instructions: openaiAnalystPrompt(input.openaiTools),
    model: input.model,
    modelSettings: input.modelSettings,
    tools: [
      skillTool(
        input.skills.filter((s) => (OPENAI_ANALYST_SKILLS as readonly string[]).includes(s.name)),
      ),
      ...subagents,
      ...datadeskTools(analystDatadeskTools(input.openaiTools), 'analyst', input),
    ],
  });
}

/** Every tool name the analyst session exposes (for the session event and tests). */
export function analystToolNames(openaiTools: boolean): string[] {
  return [
    SKILL_TOOL,
    ...OPENAI_SUBAGENTS.map(subagentToolName),
    ...analystDatadeskTools(openaiTools),
  ];
}
