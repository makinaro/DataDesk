/**
 * Every IPC call resolves to a Result instead of rejecting. Rejections crossing the context
 * bridge lose their type and get wrapped in "Error invoking remote method…" strings.
 */
export type IpcErrorCode =
  | 'INVALID_REQUEST'
  | 'FORBIDDEN_SENDER'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE'
  /** The operation was understood but refused (e.g. unsupported file, SQL rejected). */
  | 'REJECTED'
  | 'INTERNAL';

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };
