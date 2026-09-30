import { ComingSoon, Panel } from './Panel';

export function ChatPanel() {
  return (
    <Panel title="Chat" className="min-w-0 flex-1">
      <div className="flex h-full flex-col gap-4">
        <div className="flex-1">
          <ComingSoon phase={2}>Ask questions about your data in plain English.</ComingSoon>
        </div>
        <textarea
          disabled
          aria-label="Message"
          placeholder="Ask about your data…"
          className="h-20 w-full resize-none rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm disabled:opacity-50"
        />
      </div>
    </Panel>
  );
}
