import { randomUUID } from 'node:crypto';
import type { EmitAgentEvent } from './orchestrator';

export interface ApprovalRequest {
  toolName: string;
  title: string;
  detail: string;
  signal?: AbortSignal;
  /** Groups requests (e.g. per agent session) so one session can't cancel another's. */
  scope?: string;
}

interface Pending {
  scope: string | undefined;
  finish: (approved: boolean) => void;
}

/**
 * Human-in-the-loop gate. The agent runtime asks; the renderer shows a dialog; the user's
 * answer comes back over IPC. Anything other than an explicit "approve" is a denial:
 * timeouts, aborts, unknown request ids, and shutting down.
 */
export class ApprovalBroker {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly emit: EmitAgentEvent,
    private readonly timeoutMs = 5 * 60_000,
  ) {}

  request({ toolName, title, detail, signal, scope }: ApprovalRequest): Promise<boolean> {
    const requestId = randomUUID();
    return new Promise<boolean>((resolve) => {
      const finish = (approved: boolean) => {
        if (!this.pending.delete(requestId)) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.emit({ kind: 'approval_resolved', requestId, approved });
        resolve(approved);
      };
      const onAbort = () => {
        finish(false);
      };
      const timer = setTimeout(() => {
        finish(false);
      }, this.timeoutMs);
      this.pending.set(requestId, { scope, finish });
      if (signal?.aborted) {
        finish(false);
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      this.emit({ kind: 'approval_request', requestId, toolName, title, detail });
    });
  }

  /** Returns false if the request is unknown or already resolved. */
  respond(requestId: string, approved: boolean): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    entry.finish(approved);
    return true;
  }

  /** Denies every pending request, or only those in `scope`. */
  denyAll(scope?: string): void {
    for (const entry of [...this.pending.values()]) {
      if (scope === undefined || entry.scope === scope) entry.finish(false);
    }
  }
}
