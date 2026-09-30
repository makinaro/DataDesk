import { app } from 'electron';
import { IpcChannels } from '../../../shared/ipc/channels';
import type { IpcHandle } from '../router';

export function registerAppHandlers(handle: IpcHandle): void {
  handle(IpcChannels.appInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  }));
}
