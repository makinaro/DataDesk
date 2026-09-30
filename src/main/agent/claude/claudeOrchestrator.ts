import type {
  CanUseTool,
  Options,
  PermissionResult,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { preview } from '../../../shared/agent';
import type { ApprovalBroker } from '../approvals';
import type { EmitAgentEvent, Orchestrator } from '../orchestrator';
import { APPROVAL_TOOLS } from './agentOptions';
import { checkInit } from './initGuard';
import { InputQueue } from './inputQueue';
import { createSdkMapper } from './sdkMapper';

/** The slice of the SDK's Query we use; injected so tests can script a session. */
export interface QueryLike extends AsyncIterable<SDKMessage> {
  interrupt(): Promise<unknown>;
  close(): void;
}
export type QueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: Options;
}) => QueryLike;

export interface SessionSetup {
  options: Options;
  /** The agent workspace; the init guard checks the CLI really runs there. */
  workspaceDir: string;
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
  input: InputQueue;
  query: QueryLike;
  abortController: AbortController;
  done: Promise<void>;
  ending: boolean;
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}

/** Runs the analyst on the Claude Agent SDK (one long-lived streaming-input session). */
export class ClaudeOrchestrator implements Orchestrator {
  private session: Promise<Session> | undefined;

  constructor(private readonly deps: ClaudeOrchestratorDeps) {}

  send(text: string): void {
    const starting = this.session === undefined;
    this.deps.emit({ kind: 'status', status: starting ? 'starting' : 'running' });
    this.session ??= this.start();
    const pending = this.session;
    pending.then(
      (session) => {
        session.input.push(text);
        this.deps.emit({ kind: 'status', status: 'running' });
      },
      (error: unknown) => {
        if (this.session === pending) this.session = undefined;
        this.deps.emit({
          kind: 'error',
          message: `Could not start the analyst: ${firstLine(error)}`,
        });
        this.deps.emit({ kind: 'status', status: 'error' });
      },
    );
  }

  async stop(): Promise<void> {
    const session = await this.session?.catch(() => undefined);
    if (!session) return;
    this.deps.emit({ kind: 'status', status: 'stopping' });
    this.deps.approvals.denyAll();
    await session.query.interrupt().catch((error: unknown) => {
      this.deps.log?.('interrupt failed', error);
    });
  }

  async reset(): Promise<void> {
    const pending = this.session;
    this.session = undefined;
    const session = await pending?.catch(() => undefined);
    this.deps.approvals.denyAll();
    if (session) {
      session.ending = true;
      session.input.close();
      session.abortController.abort();
      session.query.close();
      await Promise.race([session.done, new Promise((r) => setTimeout(r, 5_000))]);
    }
    this.deps.emit({ kind: 'status', status: 'idle' });
  }

  dispose(): Promise<void> {
    return this.reset();
  }

  /** Deny by default; register_dataset asks the user (DECISIONS D-010). */
  private readonly canUseTool: CanUseTool = async (toolName, input, { signal }) => {
    if (!(APPROVAL_TOOLS as readonly string[]).includes(toolName)) {
      return { behavior: 'deny', message: `${toolName} is not available in DataDesk.` };
    }
    const path = typeof input.path === 'string' ? input.path : '(no path given)';
    const name = typeof input.name === 'string' ? `\nDataset name: ${input.name}` : '';
    const approved = await this.deps.approvals.request({
      toolName,
      title: 'Add a dataset?',
      detail: preview(
        `The analyst wants to register this file so it can query it:\n${path}${name}`,
      ),
      signal,
    });
    const result: PermissionResult = approved
      ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', message: 'The user declined to add this file. Do not retry.' };
    return result;
  };

  private async start(): Promise<Session> {
    const abortController = new AbortController();
    const { options, workspaceDir } = await this.deps.createSession({
      abortController,
      canUseTool: this.canUseTool,
    });
    const input = new InputQueue();
    const query = this.deps.query({ prompt: input, options });
    const session: Session = {
      input,
      query,
      abortController,
      ending: false,
      done: Promise.resolve(),
    };
    session.done = this.consume(session, workspaceDir);
    return session;
  }

  private async consume(session: Session, workspaceDir: string): Promise<void> {
    const map = createSdkMapper();
    const { emit } = this.deps;
    try {
      for await (const message of session.query) {
        if (message.type === 'system' && message.subtype === 'init') {
          const problems = checkInit(message, { cwd: workspaceDir });
          if (problems.length > 0) {
            emit({
              kind: 'error',
              message: `Stopped for safety: the agent session had capabilities DataDesk did not grant (${problems.join('; ')}).`,
            });
            session.ending = true;
            session.abortController.abort();
            session.query.close();
            break;
          }
        }
        for (const event of map(message)) emit(event);
        if (message.type === 'result') emit({ kind: 'status', status: 'idle' });
      }
    } catch (error) {
      if (!session.ending) emit({ kind: 'error', message: firstLine(error) });
    } finally {
      this.deps.approvals.denyAll();
      session.input.close();
      // If this session ended on its own (crash, guard), the next send starts a fresh one.
      const current = await this.session?.catch(() => undefined);
      if (current === session) this.session = undefined;
      if (!session.ending || current === session) emit({ kind: 'status', status: 'idle' });
    }
  }
}
