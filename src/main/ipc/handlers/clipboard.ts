import { IpcChannels } from '../../../shared/ipc/channels';
import type { IpcHandle } from '../router';

export function registerClipboardHandlers(
  handle: IpcHandle,
  clipboard: { writeText: (text: string) => void },
): void {
  handle(IpcChannels.clipboardWriteText, ({ text }) => {
    clipboard.writeText(text);
    return { ok: true as const };
  });
}
