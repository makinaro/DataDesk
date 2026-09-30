import { useEffect, useState } from 'react';
import type { IpcResult } from '../../shared/ipc/result';

export interface IpcQuery<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** The last successful data for any key, e.g. to keep a list visible while it reloads. */
  stale: T | null;
}

/**
 * Loads `load(key)` whenever `key` changes (null = nothing to load).
 * The result is stored together with the key it belongs to, and staleness is derived during
 * render, so switching keys never shows the previous key's data and never needs a synchronous
 * setState inside an effect. `load` must be stable (wrap it in useCallback).
 */
export function useIpcQuery<T>(
  key: string | null,
  load: (key: string) => Promise<IpcResult<T>>,
): IpcQuery<T> {
  const [state, setState] = useState<{ key: string; result: IpcResult<T> } | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    load(key).then(
      (result) => {
        if (!cancelled) setState({ key, result });
      },
      () => {
        if (!cancelled) {
          setState({
            key,
            result: {
              ok: false,
              error: { code: 'INTERNAL', message: 'Could not reach the app backend.' },
            },
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, load]);

  const stale = state?.result.ok ? state.result.data : null;
  if (key === null) return { data: null, error: null, loading: false, stale };
  if (state?.key !== key) return { data: null, error: null, loading: true, stale };
  return state.result.ok
    ? { data: state.result.data, error: null, loading: false, stale }
    : { data: null, error: state.result.error.message, loading: false, stale };
}
