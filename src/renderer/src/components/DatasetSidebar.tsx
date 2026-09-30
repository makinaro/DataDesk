import { ComingSoon, Panel } from './Panel';

export function DatasetSidebar() {
  return (
    <Panel title="Datasets" className="w-64 shrink-0 border-r border-slate-800">
      <ComingSoon phase={1}>
        Drop CSV, Excel, Parquet or JSON files here to register them.
      </ComingSoon>
    </Panel>
  );
}
