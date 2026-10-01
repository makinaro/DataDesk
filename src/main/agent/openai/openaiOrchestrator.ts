import { randomUUID } from 'node:crypto';
import {
  MaxTurnsExceededError,
  Runner,
  user,
  type AgentInputItem,
  type MCPServer,
  type Model,
  type ModelSettings,
} from '@openai/agents-core';
import { preview, type OpenAIModel, type ResetReason } from '../../../shared/agent';
import type { ApprovalBroker } from '../approvals';
import { datadeskTool } from '../claude/datadeskTools';
import type { EmitAgentEvent, Orchestrator } from '../orchestrator';
import {
  analystDatadeskTools,
  analystToolNames,
  buildAnalystTree,
  OPENAI_SUBAGENTS,
  subagentDatadeskTools,
} from './analystAgents';
import { explainOpenAIError } from './errors';
import { createOpenAIMapper } from './openaiMapper';
import { responseCostUsd } from './pricing';
import type { LoadedSkill } from './skills';

/** What a new OpenAI session needs: built by the runtime, faked in tests. */
export interface OpenAISessionSetup {
  modelName: OpenAIModel;
  /** The Responses API model (or a scripted fake in tests). */
  model: Model;
  /** datadesk-mcp over stdio, already connected; closed with the session. */
  server: Pick<MCPServer, 'listTools' | 'callTool' | 'close'>;
  skills: readonly LoadedSkill[];
  /** search_columns / second_opinion (always on here: the key that runs the analyst enables them). */
  openaiTools: boolean;
  maxTurns: number;
  maxBudgetUsd: number;
  notices?: string[];
}

export interface OpenAIOrchestratorDeps {
  emit: EmitAgentEvent;
  approvals: Pick<ApprovalBroker, 'request' | 'denyAll'>;
  createSession: () => Promise<OpenAISessionSetup>;
  log?: (message: string, detail?: unknown) => void;
  now?: () => number;
}

/**
 * Model settings for every agent in the tree. store: false keeps requests out of OpenAI's
 * 30-day response storage; the conversation is replayed from local history instead, and the
 * encrypted reasoning items come back so reasoning carries across tool calls (D-021).
 */
export const OPENAI_MODEL_SETTINGS: ModelSettings = {
  store: false,
  providerData: { include: ['reasoning.encrypted_content'] },
};

interface Session {
  setup: OpenAISessionSetup;
  history: AgentInputItem[];
  costUsd: number;
  /** The session event was sent (after the first 'running', like Claude's init). */
  announced: boolean;
}

interface Turn {
  abort: AbortController;
  /** Why the turn is being aborted (set before abort()). */
  reason?: 'interrupted' | 'error_max_budget_usd';
}

class SupersededError extends Error {}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}

/**
 * Runs the analyst on the OpenAI Agents SDK. Unlike the Claude CLI there is no long-lived
 * process: each user message is one `Runner.run` over the replayed history, and the session is
 * just datadesk-mcp plus that history.
 */
export class OpenAIOrchestrator implements Orchestrator {
  private generation = 0;
  private session: Promise<Session> | undefined;
  /** Turns run one after another; reset starts a new chain. */
  private chain: Promise<void> = Promise.resolve();
  private turn: Turn | undefined;

  constructor(private readonly deps: OpenAIOrchestratorDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  send(text: string): void {
    const generation = this.generation;
    this.deps.emit({ kind: 'status', status: this.session === undefined ? 'starting' : 'running' });
    this.chain = this.chain.then(() => this.runTurn(text, generation));
  }

  async stop(): Promise<void> {
    const turn = this.turn;
    if (!turn) return;
    this.deps.emit({ kind: 'status', status: 'stopping' });
    this.deps.approvals.denyAll(this.scope(this.generation));
    turn.reason ??= 'interrupted';
    turn.abort.abort();
    await Promise.resolve();
  }

  async reset(reason: ResetReason = 'user'): Promise<void> {
    // Synchronous part: nothing from the old conversation is emitted after the marker.
    const oldGeneration = this.generation++;
    const session = this.session;
    this.session = undefined;
    this.chain = Promise.resolve();
    this.turn?.abort.abort();
    this.turn = undefined;
    this.deps.approvals.denyAll(this.scope(oldGeneration));
    this.deps.emit({ kind: 'conversation_reset', reason });
    this.deps.emit({ kind: 'status', status: 'idle' });
    // A session still starting closes itself (SupersededError) when it sees the new generation.
    const started = await session?.catch(() => undefined);
    await started?.setup.server.close().catch((error: unknown) => {
      this.deps.log?.('closing datadesk-mcp failed', error);
    });
  }

  dispose(): Promise<void> {
    return this.reset();
  }

  private scope(generation: number): string {
    return `openai-${String(generation)}`;
  }

  private async start(generation: number): Promise<Session> {
    const setup = await this.deps.createSession();
    if (generation !== this.generation) {
      await setup.server.close().catch(() => undefined);
      throw new SupersededError();
    }
    const live = (event: Parameters<EmitAgentEvent>[0]) => {
      if (generation === this.generation) this.deps.emit(event);
    };
    try {
      // Our own allowlist: only these tools are ever given to an agent, so a tool datadesk-mcp
      // adds later can't reach the model. Missing ones fail the session (like the init guard).
      const listed = new Set((await setup.server.listTools()).map((t) => datadeskTool(t.name)));
      const expected = new Set([
        ...analystDatadeskTools(setup.openaiTools),
        ...OPENAI_SUBAGENTS.flatMap((name) => subagentDatadeskTools(name, setup.openaiTools)),
      ]);
      const missing = [...expected].filter((t) => !listed.has(t));
      if (missing.length > 0)
        throw new Error(`datadesk-mcp is missing tools: ${missing.join(', ')}`);
    } catch (error) {
      await setup.server.close().catch(() => undefined);
      throw error;
    }
    for (const message of setup.notices ?? [])
      live({ kind: 'error', message: preview(message, 2_000) });
    return { setup, history: [], costUsd: 0, announced: false };
  }

  private async runTurn(text: string, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    const emit: EmitAgentEvent = (event) => {
      if (generation === this.generation) this.deps.emit(event);
    };
    const pending = (this.session ??= this.start(generation));
    let session: Session;
    try {
      session = await pending;
    } catch (error) {
      if (this.session === pending) this.session = undefined;
      if (error instanceof SupersededError) return;
      emit({
        kind: 'error',
        message: preview(`Could not start the analyst: ${firstLine(error)}`, 2_000),
      });
      emit({ kind: 'status', status: 'error' });
      return;
    }
    if (generation !== this.generation) return;
    emit({ kind: 'status', status: 'running' });
    const { setup } = session;
    if (!session.announced) {
      session.announced = true;
      emit({
        kind: 'session',
        sessionId: randomUUID(),
        model: setup.modelName,
        tools: analystToolNames(setup.openaiTools),
        mcpServers: [{ name: 'datadesk', status: 'connected' }],
      });
    }

    const startedAt = this.now();
    const costBefore = session.costUsd;
    const turn: Turn = { abort: new AbortController() };
    this.turn = turn;
    let numTurns = 0;
    const errors = new Set<string>();
    const map = createOpenAIMapper({
      isError: (callId) => errors.has(callId),
      onUsage: (usage, parent) => {
        if (parent === null) numTurns++;
        session.costUsd += responseCostUsd(setup.modelName, usage);
        if (session.costUsd >= setup.maxBudgetUsd && !turn.abort.signal.aborted) {
          turn.reason = 'error_max_budget_usd';
          turn.abort.abort();
        }
      },
    });

    const finish = (ok: boolean, reason: string, message?: string) => {
      if (message !== undefined) emit({ kind: 'error', message: preview(message, 2_000) });
      emit({
        kind: 'turn_complete',
        ok,
        reason,
        costUsd: Math.max(0, session.costUsd - costBefore),
        sessionCostUsd: session.costUsd,
        durationMs: Math.max(0, this.now() - startedAt),
        numTurns,
      });
      emit({ kind: 'status', status: 'idle' });
    };

    if (session.costUsd >= setup.maxBudgetUsd) {
      if (this.turn === turn) this.turn = undefined;
      finish(
        false,
        'error_max_budget_usd',
        'This conversation reached its spend limit. Start a new conversation.',
      );
      return;
    }

    const agent = buildAnalystTree({
      listed: await setup.server.listTools(),
      server: setup.server,
      model: setup.model,
      modelSettings: OPENAI_MODEL_SETTINGS,
      openaiTools: setup.openaiTools,
      skills: setup.skills,
      signal: turn.abort.signal,
      markError: (callId) => errors.add(callId),
      askUser: (toolName, question, signal) =>
        this.deps.approvals.request({
          toolName,
          title: question.title,
          detail: preview(question.lines.join('\n')),
          signal,
          scope: this.scope(generation),
        }),
      onSubagentEvent: (event, parent) => {
        for (const e of map(event, parent)) emit(e);
      },
    });
    const runner = new Runner({
      tracingDisabled: true,
      traceIncludeSensitiveData: false,
      workflowName: 'DataDesk analyst',
      toolNotFoundBehavior: 'return_error_to_model',
    });

    // Each outcome becomes one turn_complete; an abort is reported by why we aborted.
    const conclude = (failure: unknown) => {
      if (turn.reason === 'error_max_budget_usd') {
        finish(false, turn.reason, 'Stopped: the spend limit for this conversation was reached.');
      } else if (turn.reason) {
        finish(false, turn.reason);
      } else if (failure instanceof MaxTurnsExceededError) {
        finish(
          false,
          'error_max_turns',
          'Stopped: the analyst used its maximum number of steps for this message.',
        );
      } else {
        this.deps.log?.('OpenAI run failed', failure);
        finish(false, 'error', explainOpenAIError(failure));
      }
    };

    try {
      const result = await runner.run(agent, [...session.history, user(text)], {
        stream: true,
        maxTurns: setup.maxTurns,
        signal: turn.abort.signal,
      });
      for await (const event of result) {
        for (const e of map(event, null)) emit(e);
      }
      await result.completed;
      const failure: unknown = result.error;
      if (failure !== undefined && failure !== null) {
        conclude(failure);
      } else if (turn.reason) {
        conclude(undefined);
      } else {
        // Only a completed turn joins the history; a stopped one is dropped (D-021).
        session.history = result.history;
        finish(true, 'success');
      }
    } catch (error) {
      conclude(error);
    } finally {
      this.deps.approvals.denyAll(this.scope(generation));
      if (this.turn === turn) this.turn = undefined;
    }
  }
}
