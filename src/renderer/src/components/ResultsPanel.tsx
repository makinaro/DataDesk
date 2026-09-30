import { ComingSoon, Panel } from './Panel';

export function ResultsPanel() {
  return (
    <Panel title="Charts & report" className="w-[420px] shrink-0 border-l border-slate-800">
      <ComingSoon phase={3}>Vega-Lite charts and exportable Markdown/PDF reports.</ComingSoon>
    </Panel>
  );
}
