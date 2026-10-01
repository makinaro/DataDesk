import { useEffect, useId, useRef } from 'react';
import { useAgent } from '../agent/AgentProvider';

/**
 * Shown when the agent wants to use a tool that needs the user's explicit permission.
 * Safe defaults: Deny has focus, and Escape denies.
 */
export function ApprovalDialog() {
  const { state, answerApproval } = useAgent();
  const titleId = useId();
  const denyRef = useRef<HTMLButtonElement>(null);
  const pending = state.pendingApprovals[0];
  const waiting = state.pendingApprovals.length - 1;

  useEffect(() => {
    denyRef.current?.focus();
  }, [pending?.requestId]);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') answerApproval(pending.requestId, false);
        }}
        className="w-full max-w-lg rounded-xl border border-warn bg-surface p-6 shadow-xl"
      >
        <h2 id={titleId} className="mb-2 text-lg font-semibold">
          {pending.title}
        </h2>
        <p className="mb-3 text-sm text-muted">
          The analyst wants to run <span className="font-mono">{pending.toolName}</span>. Nothing
          happens unless you allow it.
          {waiting > 0 && ` (${String(waiting)} more request${waiting > 1 ? 's' : ''} waiting)`}
        </p>
        <pre className="mb-4 max-h-60 overflow-auto rounded bg-canvas p-3 text-xs whitespace-pre-wrap">
          {pending.detail}
        </pre>
        <div className="flex justify-end gap-2">
          <button
            ref={denyRef}
            type="button"
            onClick={() => {
              answerApproval(pending.requestId, false);
            }}
            className="rounded border border-strong px-4 py-1.5 text-sm hover:bg-raised"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => {
              answerApproval(pending.requestId, true);
            }}
            className="rounded bg-accent px-4 py-1.5 text-sm text-on-accent hover:bg-accent-hover"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
