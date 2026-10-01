import type { AgentEvent, AgentSettings, CompareEvent } from '../agent';
import type { Appearance } from '../appearance';
import type { ChartArtifact, ReportArtifact } from '../artifacts';
import type { ColumnInfo, DatasetPreview, DatasetSummary, RegisteredDataset } from '../datasets';
import type { IpcChannels } from './channels';
import type { AppInfo, IpcRequest, IpcResponse, Provider, SecretsStatus } from './contract';
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
  agent: {
    send(text: string): Promise<IpcResult<{ accepted: true }>>;
    stop(): Promise<IpcResult<{ ok: true }>>;
    reset(): Promise<IpcResult<{ ok: true }>>;
    approve(requestId: string, approved: boolean): Promise<IpcResult<{ found: boolean }>>;
    /** Subscribes to agent events; returns an unsubscribe function. */
    onEvent(listener: (event: AgentEvent) => void): () => void;
  };
  /** Compare mode: one question on both providers side by side (Phase 7). */
  compare: {
    /** Starts fresh sessions on both providers; needs both keys. */
    run(text: string): Promise<IpcResult<{ accepted: true }>>;
    stop(): Promise<IpcResult<{ ok: true }>>;
    /** Ends both sessions (frees their processes); used when leaving compare mode. */
    reset(): Promise<IpcResult<{ ok: true }>>;
    /** Subscribes to both lanes' events; returns an unsubscribe function. */
    onEvent(listener: (event: CompareEvent) => void): () => void;
  };
  settings: {
    getAgent(): Promise<IpcResult<AgentSettings>>;
    setAgent(settings: AgentSettings): Promise<IpcResult<AgentSettings>>;
    /** Theme and layout. Saving them never restarts the conversation. */
    getAppearance(): Promise<IpcResult<Appearance>>;
    setAppearance(appearance: Appearance): Promise<IpcResult<Appearance>>;
  };
  /** Write-only: there is deliberately no way to read the clipboard. */
  clipboard: {
    writeText(text: string): Promise<IpcResult<{ ok: true }>>;
  };
  artifacts: {
    getChart(id: string): Promise<IpcResult<ChartArtifact>>;
    getReport(id: string): Promise<IpcResult<ReportArtifact>>;
    /** Opens a save dialog in main. `bodyHtml` is required for PDF. */
    exportReport(
      request: IpcRequest<typeof IpcChannels.artifactsExportReport>,
    ): Promise<IpcResult<IpcResponse<typeof IpcChannels.artifactsExportReport>>>;
    /** Opens a save dialog in main and writes the chart as PNG or SVG. */
    exportChart(
      request: IpcRequest<typeof IpcChannels.artifactsExportChart>,
    ): Promise<IpcResult<IpcResponse<typeof IpcChannels.artifactsExportChart>>>;
  };
}
