import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DatadeskApi } from '../shared/ipc/api';
import { IpcChannels, type IpcChannel } from '../shared/ipc/channels';
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
};

contextBridge.exposeInMainWorld('datadesk', api);
