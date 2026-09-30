import { ComingSoon, Panel } from './Panel';

export function TimelineDrawer() {
  return (
    <Panel title="Agent timeline" className="h-56 shrink-0 border-t border-slate-800">
      <ComingSoon phase={2}>
        Every tool call and sub-agent, live: inputs, results, timing and cost.
      </ComingSoon>
    </Panel>
  );
}
