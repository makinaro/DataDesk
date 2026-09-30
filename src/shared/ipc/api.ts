import type { ColumnInfo, DatasetPreview, DatasetSummary, RegisteredDataset } from '../datasets';
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
  datasets: {
    list(): Promise<IpcResult<DatasetSummary[]>>;
    /**
     * Registers a file the user dropped. Takes the DOM `File`, not a path string: the preload
     * resolves its real path, so page script can't name arbitrary files.
     */
    registerFile(file: File, name?: string): Promise<IpcResult<RegisteredDataset>>;
    /** Opens the OS file picker in main; resolves to null if the user cancels. */
    pick(): Promise<IpcResult<RegisteredDataset | null>>;
    schema(name: string): Promise<IpcResult<ColumnInfo[]>>;
    preview(name: string, limit: number): Promise<IpcResult<DatasetPreview>>;
  };
}
