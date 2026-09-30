import type { AppInfo, Provider, SecretsStatus } from './contract';
import type { IpcResult } from './result';

/**
 * The complete surface exposed to the renderer as `window.datadesk`.
 * Adding a method here without a contract entry and a main handler is a type error.
 */
export interface DatadeskApi {
  app: {
    info(): Promise<IpcResult<AppInfo>>;
  };
  secrets: {
    status(): Promise<IpcResult<SecretsStatus>>;
    set(provider: Provider, key: string): Promise<IpcResult<SecretsStatus>>;
    clear(provider: Provider): Promise<IpcResult<SecretsStatus>>;
  };
}
