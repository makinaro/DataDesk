import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DatadeskApi } from '../shared/ipc/api';
import type { AgentEvent, CompareEvent } from '../shared/agent';
import { IpcChannels, IpcEvents, type IpcChannel } from '../shared/ipc/channels';
import type { IpcRequest, IpcResponse } from '../shared/ipc/contract';
import type { IpcResult } from '../shared/ipc/result';

// Type-only imports above are erased at build time, so zod is never bundled into this
// sandboxed script. All validation happens in main.
function invoke<C extends IpcChannel>(
  channel: C,
  request?: IpcRequest<C>,
): Promise<IpcResult<IpcResponse<C>>> {
  return ipcRenderer.invoke(channel, request) as Promise<IpcResult<IpcResponse<C>>>;
}

// Explicit methods only. There is deliberately no generic invoke/send exposed to the page.
const api: DatadeskApi = {
  app: {
    info: () => invoke(IpcChannels.appInfo),
  },
  secrets: {
    status: () => invoke(IpcChannels.secretsStatus),
    set: (provider, key) => invoke(IpcChannels.secretsSet, { provider, key }),
    clear: (provider) => invoke(IpcChannels.secretsClear, { provider }),
  },
  datasets: {
    list: () => invoke(IpcChannels.datasetsList),
    registerFile: (file, name) => {
      // Only a File that came from the user's file system (drag-drop / <input type=file>) has a
      // path. A File constructed by page script resolves to '', so the page can't name paths.
      let path = '';
      try {
        path = webUtils.getPathForFile(file);
      } catch {
        // Not a File object at all.
      }
      if (!path) {
        return Promise.resolve({
          ok: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Only files from your computer can be added.',
          },
        });
      }
      return invoke(IpcChannels.datasetsRegister, name === undefined ? { path } : { path, name });
    },
    pick: () => invoke(IpcChannels.datasetsPick),
    schema: (name) => invoke(IpcChannels.datasetsSchema, { name }),
    preview: (name, limit) => invoke(IpcChannels.datasetsPreview, { name, limit }),
  },
  agent: {
    send: (text) => invoke(IpcChannels.agentSend, { text }),
    stop: () => invoke(IpcChannels.agentStop),
    reset: () => invoke(IpcChannels.agentReset),
    approve: (requestId, approved) => invoke(IpcChannels.agentApprove, { requestId, approved }),
    onEvent: (listener) => {
      // Pass only the payload: the IpcRendererEvent (with its sender) never reaches the page.
      const handler = (_event: Electron.IpcRendererEvent, payload: AgentEvent) => {
        listener(payload);
      };
      ipcRenderer.on(IpcEvents.agentEvent, handler);
      return () => {
        ipcRenderer.removeListener(IpcEvents.agentEvent, handler);
      };
    },
  },
  compare: {
    run: (text) => invoke(IpcChannels.compareRun, { text }),
    stop: () => invoke(IpcChannels.compareStop),
    reset: () => invoke(IpcChannels.compareReset),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: CompareEvent) => {
        listener(payload);
      };
      ipcRenderer.on(IpcEvents.compareEvent, handler);
      return () => {
        ipcRenderer.removeListener(IpcEvents.compareEvent, handler);
      };
    },
  },
  settings: {
    getAgent: () => invoke(IpcChannels.settingsGetAgent),
    setAgent: (settings) => invoke(IpcChannels.settingsSetAgent, settings),
    getAppearance: () => invoke(IpcChannels.settingsGetAppearance),
    setAppearance: (appearance) => invoke(IpcChannels.settingsSetAppearance, appearance),
  },
  artifacts: {
    getChart: (id) => invoke(IpcChannels.artifactsGetChart, { id }),
    getReport: (id) => invoke(IpcChannels.artifactsGetReport, { id }),
    exportReport: (request) => invoke(IpcChannels.artifactsExportReport, request),
  },
};

contextBridge.exposeInMainWorld('datadesk', api);
