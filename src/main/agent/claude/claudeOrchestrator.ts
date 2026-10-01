import type {
  CanUseTool,
  Options,
  PermissionResult,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { isSubagentTool, preview, type ResetReason } from '../../../shared/agent';
import { DatasetNameSchema } from '../../../shared/datasets';
import type { ApprovalBroker } from '../approvals';
import type { EmitAgentEvent, Orchestrator } from '../orchestrator';
import { APPROVAL_TOOLS, type SessionTools } from './agentOptions';
import { checkInit } from './initGuard';
import { InputQueue } from './inputQueue';
import { createSdkMapper } from './sdkMapper';
import { DelegationInput, SUBAGENT_NAMES } from './subagents';

/** The slice of the SDK's Query we use; injected so tests can script a session. */
export interface QueryLike extends AsyncIterable<SDKMessage> {
  interrupt(): Promise<unknown>;
  close(): void;
}
export type QueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: Options;
}) => QueryLike;

export interface SessionSetup extends SessionTools {
  options: Options;
  /** The agent workspace; the init guard checks the CLI really runs there. */
  workspaceDir: string;
  /** The skills plugin; the init guard checks exactly this plugin loaded. */
  pluginDir: string;
  /** Non-fatal problems to show in the chat (e.g. Hugging Face could not be attached). */
  notices?: string[];
}

export interface ClaudeOrchestratorDeps {
  emit: EmitAgentEvent;
  query: QueryFn;
  approvals: Pick<ApprovalBroker, 'request' | 'denyAll'>;
  /** Builds options for a *new* session (current settings, key, paths). */
  createSession: (ctx: {
    abortController: AbortController;
    canUseTool: CanUseTool;
  }) => Promise<SessionSetup>;
  log?: (message: string, detail?: unknown) => void;
}

interface Session {
  generation: number;
  input: InputQueue;
  query: QueryLike;
  abortController: AbortController;
  done: Promise<void>;
  /** Set synchronously when the session is being torn down: nothing more is emitted from it. */
  ending: boolean;
}

/** Thrown when a reset happened while a session was still starting. Not an error for the user. */
class SupersededError extends Error {}

const RegisterInput = z.object({
  path: z.string().min(1).max(4096),
  name: DatasetNameSchema.optional(),
  sheet: z.string().max(100).optional(),
});

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}

/** Runs the analyst on the Claude Agent SDK (one long-lived streaming-input session). */
export class ClaudeOrchestrator implements Orchestrator {
  /** Bumped on every reset; a session belongs to exactly one generation (conversation). */
  private generation = 0;
  private session: Promise<Session> | undefined;
  /** The started session, available synchronously (for reset/stop). */
  private live: Session | undefined;

  constructor(private readonly deps: ClaudeOrchestratorDeps) {}

  send(text: string): void {
    const starting = this.session === undefined;
    this.deps.emit({ kind: 'status', status: starting ? 'starting' : 'running' });
    this.session ??= this.start(this.generation);
    const pending = this.session;
    pending.then(
      (session) => {
        if (session.ending) return;
        session.input.push(text);
        this.deps.emit({ kind: 'status', status: 'running' });
      },
      (error: unknown) => {
        if (this.session === pending) this.session = undefined;
        if (error instanceof SupersededError) return;
        this.deps.emit({
          kind: 'error',
          message: preview(`Could not start the analyst: ${firstLine(error)}`, 2_000),
        });
        this.deps.emit({ kind: 'status', status: 'error' });
      },
    );
  }

  async stop(): Promise<void> {
    const session = this.live;
    if (!session || session.ending) return;
    this.deps.emit({ kind: 'status', status: 'stopping' });
    this.deps.approvals.denyAll(String(session.generation));
    await session.query.interrupt().catch((error: unknown) => {
      this.deps.log?.('interrupt failed', error);
    });
    // Don't rely on a result message arriving after an interrupt (e.g. no turn was active).
    // (Read via a function: TS would narrow `ending` to false across the await.)
    const ended = () => session.ending;
    if (!ended()) this.deps.emit({ kind: 'status', status: 'idle' });
  }

  async reset(reason: ResetReason = 'user'): Promise<void> {
    // Synchronous part: from here on the old conversation can't emit anything.
    this.generation++;
    const session = this.live;
    this.live = undefined;
    this.session = undefined;
    if (session) session.ending = true;
    this.deps.approvals.denyAll();
    this.deps.emit({ kind: 'conversation_reset', reason });
    this.deps.emit({ kind: 'status', status: 'idle' });

    // A session that is still starting needs no teardown here: start() sees the generation
    // changed and discards itself (SupersededError). Never await it: it may be slow.
    if (session) {
      session.ending = true;
      session.input.close();
      session.abortController.abort();
      session.query.close();
      await Promise.race([session.done, new Promise((r) => setTimeout(r, 5_000))]);
    }
  }

  dispose(): Promise<void> {
    return this.reset();
  }

  /**
   * Deny by default. Delegations are validated and stripped to what we allow (D-017);
   * register_dataset asks the user (D-010), and only for the main analyst. Scoped per session.
   */
  private canUseToolFor(generation: number): CanUseTool {
    return async (toolName, input, { signal, agentID }) => {
      if (isSubagentTool(toolName)) {
        if (agentID !== undefined) {
          return { behavior: 'deny', message: 'Sub-agents cannot start other sub-agents.' };
        }
        const delegation = DelegationInput.safeParse(input);
        if (!delegation.success) {
          return {
            behavior: 'deny',
            message: `Delegate with subagent_type ${SUBAGENT_NAMES.join(', ')} plus a description and a self-contained prompt.`,
          };
        }
        return { behavior: 'allow', updatedInput: delegation.data };
      }
      if (!(APPROVAL_TOOLS as readonly string[]).includes(toolName)) {
        return { behavior: 'deny', message: `${toolName} is not available in DataDesk.` };
      }
      if (agentID !== undefined) {
        return {
          behavior: 'deny',
          message: 'Only the main analyst can ask the user to add files.',
        };
      }
      // Validate before asking: never show the user (or pass on) input the tool would reject.
      const parsed = RegisterInput.safeParse(input);
      if (!parsed.success) {
        return { behavior: 'deny', message: 'Invalid register_dataset input; nothing was asked.' };
      }
      const { path, name, sheet } = parsed.data;
      const lines = [
        'The analyst wants to register this file so it can query it:',
        '',
        `File:  ${path}`,
        ...(name ? [`Name:  ${name} (replaces any dataset with this name)`] : []),
        ...(sheet ? [`Sheet: ${sheet}`] : []),
      ];
      const approved = await this.deps.approvals.request({
        toolName,
        title: 'Add a dataset?',
        detail: preview(lines.join('\n')),
        signal,
        scope: String(generation),
      });
      const result: PermissionResult = approved
        ? { behavior: 'allow', updatedInput: parsed.data }
        : { behavior: 'deny', message: 'The user declined to add this file. Do not retry.' };
      return result;
    };
  }

  private async start(generation: number): Promise<Session> {
    const abortController = new AbortController();
    const { options, workspaceDir, pluginDir, openaiTools, hfTools, notices } =
      await this.deps.createSession({
        abortController,
        canUseTool: this.canUseToolFor(generation),
      });
    if (generation !== this.generation) throw new SupersededError();
    for (const message of notices ?? []) {
      this.deps.emit({ kind: 'error', message: preview(message, 2_000) });
    }
    const input = new InputQueue();
    const query = this.deps.query({ prompt: input, options });
    const session: Session = {
      generation,
      input,
      query,
      abortController,
      ending: false,
      done: Promise.resolve(),
    };
    this.live = session;
    session.done = this.consume(session, { cwd: workspaceDir, pluginDir, openaiTools, hfTools });
    return session;
  }

  private async consume(
    session: Session,
    expected: { cwd: string; pluginDir: string } & SessionTools,
  ): Promise<void> {
    const map = createSdkMapper();
    // Only this session's events, and only until it starts ending.
    const emit: EmitAgentEvent = (event) => {
      if (!session.ending) this.deps.emit(event);
    };
    const abort = (message: string) => {
      emit({ kind: 'error', message: preview(message, 2_000) });
      session.ending = true;
      session.abortController.abort();
      session.query.close();
    };
    let validated = false;
    try {
      for await (const message of session.query) {
        if (session.ending) break;
        if (message.type === 'system' && message.subtype === 'init') {
          const problems = checkInit(message, expected);
          if (problems.length > 0) {
            abort(
              `Stopped for safety: the agent session had capabilities DataDesk did not grant (${problems.join('; ')}).`,
            );
            break;
          }
          validated = true;
        } else if (!validated && ['assistant', 'stream_event', 'user'].includes(message.type)) {
          // Fail closed: model output before we could check what the session can do.
          abort('Stopped for safety: the agent produced output before its session was verified.');
          break;
        }
        for (const event of map(message)) emit(event);
        if (message.type === 'result') emit({ kind: 'status', status: 'idle' });
      }
    } catch (error) {
      emit({ kind: 'error', message: preview(firstLine(error), 2_000) });
    } finally {
      this.deps.approvals.denyAll(String(session.generation));
      session.input.close();
      const stoppedBySafety = session.ending;
      if (this.live === session) {
        // Ended on its own (crash, guard): the next send starts a fresh session.
        this.live = undefined;
        this.session = undefined;
        session.ending = true;
        this.deps.emit({ kind: 'status', status: stoppedBySafety ? 'error' : 'idle' });
      }
    }
  }
}
