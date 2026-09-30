import { contextBridge, ipcRenderer } from 'electron';
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
};

contextBridge.exposeInMainWorld('datadesk', api);
