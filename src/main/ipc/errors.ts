import type { IpcErrorCode } from '../../shared/ipc/result';

/** Throw from a handler to send a specific, user-safe error to the renderer. */
export class IpcUserError extends Error {
  constructor(
    readonly code: IpcErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IpcUserError';
  }
}
