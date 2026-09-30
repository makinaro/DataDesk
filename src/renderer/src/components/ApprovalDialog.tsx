import { useId } from 'react';
import { useAgent } from '../agent/AgentProvider';

/** Shown when the agent wants to use a tool that needs the user's explicit permission. */
export function ApprovalDialog() {
  const { state, answerApproval } = useAgent();
  const titleId = useId();
  const pending = state.pendingApproval;
  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-amber-700 bg-slate-900 p-6 shadow-xl"
      >
        <h2 id={titleId} className="mb-2 text-lg font-semibold">
          {pending.title}
        </h2>
        <p className="mb-3 text-sm text-slate-400">
          The analyst wants to run <span className="font-mono">{pending.toolName}</span>. Nothing
          happens unless you allow it.
        </p>
        <pre className="mb-4 max-h-60 overflow-auto rounded bg-slate-950 p-3 text-xs whitespace-pre-wrap">
          {pending.detail}
        </pre>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              answerApproval(pending.requestId, false);
            }}
            className="rounded border border-slate-700 px-4 py-1.5 text-sm hover:bg-slate-800"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => {
              answerApproval(pending.requestId, true);
            }}
            className="rounded bg-amber-700 px-4 py-1.5 text-sm hover:bg-amber-600"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
