import { createContext, useContext, type ReactNode } from 'react';
import type { DatadeskApi } from '../../shared/ipc/api';

const ApiContext = createContext<DatadeskApi | null>(null);

/** Provides the preload bridge (or a fake in tests) to components. */
export function ApiProvider({ api, children }: { api: DatadeskApi; children: ReactNode }) {
  return <ApiContext value={api}>{children}</ApiContext>;
}

export function useApi(): DatadeskApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
