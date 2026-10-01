import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../api';
import { useAppearance } from '../appearance/AppearanceProvider';
import { prepareSpec } from '../charts/prepareSpec';
import { renderChart, type RenderedChart } from '../charts/vega';
import { useIpcQuery } from '../useIpcQuery';

/**
 * Loads a chart artifact by id and renders it with Vega (CSP-safe settings), in the current
 * theme. The full view adds a toolbar: reset zoom and filters, and save as PNG or SVG.
 */
export function ChartView({ id, compact = false }: { id: string; compact?: boolean }) {
  const api = useApi();
  const { resolvedTheme } = useAppearance();
  const load = useCallback((key: string) => api.artifacts.getChart(key), [api]);
  const { data: chart, error } = useIpcQuery(id, load);
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef<RenderedChart | null>(null);
  const [renderError, setRenderError] = useState<{ id: string; message: string } | null>(null);
  // Bumping this re-renders the chart from its spec, which clears zoom and legend filters.
  const [resetCount, setResetCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!chart || !host) return;
    const prepared = prepareSpec(chart.spec);
    let cancelled = false;
    let current: RenderedChart | null = null;
    if (!prepared.ok) {
      queueMicrotask(() => {
        if (!cancelled) setRenderError({ id: chart.id, message: prepared.error });
      });
      return () => {
        cancelled = true;
      };
    }
    // A fresh element per run, so a re-run (StrictMode, new data) never renders into a view
    // that is still being set up or torn down.
    const el = document.createElement('div');
    host.append(el);
    renderChart(el, prepared.spec, resolvedTheme).then(
      (result) => {
        if (cancelled) {
          result.dispose();
        } else {
          current = result;
          rendered.current = result;
        }
      },
      (e: unknown) => {
        if (!cancelled) {
          setRenderError({ id: chart.id, message: e instanceof Error ? e.message : String(e) });
        }
      },
    );
    return () => {
      cancelled = true;
      if (current && rendered.current === current) rendered.current = null;
      current?.dispose();
      el.remove();
    };
  }, [chart, resolvedTheme, resetCount]);

  useEffect(() => {
    const host = ref.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      rendered.current?.fit(host.clientWidth);
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
    };
  }, []);

  async function save(format: 'png' | 'svg') {
    if (!chart) return;
    setStatus(null);
    try {
      let result;
      if (format === 'png') {
        if (!rendered.current) return;
        const pngBase64 = await rendered.current.toPngBase64();
        result = await api.artifacts.exportChart({ id: chart.id, format, pngBase64 });
      } else {
        result = await api.artifacts.exportChart({ id: chart.id, format, theme: resolvedTheme });
      }
      if (!result.ok) setStatus(result.error.message);
      else if (result.data.saved) setStatus(`Saved to ${result.data.path ?? ''}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  const message = error ?? (renderError?.id === id ? renderError.message : null);
  const toolButton = 'rounded-md px-2 py-0.5 text-xs text-muted hover:bg-raised hover:text-fg';
  return (
    <figure aria-label={chart ? `Chart: ${chart.title}` : 'Chart'} className="space-y-1">
      {!compact && chart && (
        <div className="flex items-center gap-1">
          <figcaption className="min-w-0 flex-1 truncate text-sm font-medium">
            {chart.title}
          </figcaption>
          <div role="toolbar" aria-label="Chart actions" className="flex gap-0.5">
            <button
              type="button"
              className={toolButton}
              title="Clear zoom and legend filters"
              onClick={() => {
                setResetCount((n) => n + 1);
              }}
            >
              Reset view
            </button>
            <button type="button" className={toolButton} onClick={() => void save('png')}>
              Save PNG
            </button>
            <button type="button" className={toolButton} onClick={() => void save('svg')}>
              Save SVG
            </button>
          </div>
        </div>
      )}
      {message ? (
        <p role="alert" className="text-sm text-danger">
          Chart could not be shown: {message}
        </p>
      ) : (
        <div ref={ref} className="overflow-auto" />
      )}
      {!compact && (
        <p className="text-xs text-faint">
          {chart?.truncated && (
            <span className="text-warn">
              Showing the first {chart.rowCount} rows (chart row limit).{' '}
            </span>
          )}
          Hover for values. Where a chart can zoom, drag to pan and scroll to zoom; click a legend
          entry to focus a series (Shift-click for more).
        </p>
      )}
      {status && (
        <p role="status" className="text-xs text-muted">
          {status}
        </p>
      )}
    </figure>
  );
}
