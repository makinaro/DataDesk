import type { IpcMainInvokeEvent } from 'electron';
import { isAppOrigin } from '../security/navigation';

/** Only the top-level frame of our own renderer origin may call IPC. */
export function createSenderCheck(rendererOrigin: string) {
  return (event: IpcMainInvokeEvent): boolean => {
    const frame = event.senderFrame;
    // A missing frame (destroyed) or a subframe is never trusted.
    if (frame?.parent !== null) return false;
    return isAppOrigin(frame.url, rendererOrigin);
  };
}
