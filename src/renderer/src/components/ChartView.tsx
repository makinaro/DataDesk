import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../api';
import { prepareSpec } from '../charts/prepareSpec';
import { renderChart } from '../charts/vega';
import { useIpcQuery } from '../useIpcQuery';

/** Loads a chart artifact by id and renders it with Vega (CSP-safe settings). */
export function ChartView({ id, compact = false }: { id: string; compact?: boolean }) {
  const api = useApi();
  const load = useCallback((key: string) => api.artifacts.getChart(key), [api]);
  const { data: chart, error } = useIpcQuery(id, load);
  const ref = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!chart || !el) return;
    const prepared = prepareSpec(chart.spec);
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    if (!prepared.ok) {
      queueMicrotask(() => {
        if (!cancelled) setRenderError({ id: chart.id, message: prepared.error });
      });
      return () => {
        cancelled = true;
      };
    }
    renderChart(el, prepared.spec).then(
      (dispose) => {
        if (cancelled) dispose();
        else cleanup = dispose;
      },
      (e: unknown) => {
        if (!cancelled) {
          setRenderError({ id: chart.id, message: e instanceof Error ? e.message : String(e) });
        }
      },
    );
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [chart]);

  const message = error ?? (renderError?.id === id ? renderError.message : null);
  return (
    <figure aria-label={chart ? `Chart: ${chart.title}` : 'Chart'} className="space-y-1">
      {!compact && chart && <figcaption className="text-sm font-medium">{chart.title}</figcaption>}
      {message ? (
        <p role="alert" className="text-sm text-red-300">
          Chart could not be shown: {message}
        </p>
      ) : (
        <div ref={ref} className="chart-surface overflow-auto rounded bg-white p-2" />
      )}
      {!compact && chart?.truncated && (
        <p className="text-xs text-amber-300">
          Showing the first {chart.rowCount} rows (chart row limit).
        </p>
      )}
    </figure>
  );
}
