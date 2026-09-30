import type { DatadeskApi } from '../../shared/ipc/api';

declare global {
  interface Window {
    /** Exposed by src/preload/index.ts. The renderer's only way to reach the main process. */
    readonly datadesk: DatadeskApi;
  }
}

export {};
