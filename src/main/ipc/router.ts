import type { IpcMainInvokeEvent } from 'electron';
import type { IpcChannel } from '../../shared/ipc/channels';
import { ipcContract, type IpcParsedRequest, type IpcResponse } from '../../shared/ipc/contract';
import type { IpcError, IpcErrorCode, IpcResult } from '../../shared/ipc/result';
import { IpcUserError } from './errors';

type Handler<C extends IpcChannel> = (
  request: IpcParsedRequest<C>,
  event: IpcMainInvokeEvent,
) => IpcResponse<C> | Promise<IpcResponse<C>>;

/** The slice of Electron's ipcMain we use; injected so tests can drive it without Electron. */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>,
  ): void;
}

export interface IpcRouterOptions {
  ipcMain: IpcMainLike;
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean;
  logError?: (message: string, detail?: unknown) => void;
}

function fail(code: IpcErrorCode, message: string): { ok: false; error: IpcError } {
  return { ok: false, error: { code, message } };
}

/**
 * Registers IPC handlers that (1) reject untrusted senders, (2) validate the request against
 * the shared zod contract, (3) validate the handler's response, and (4) always resolve to an
 * IpcResult. Validation messages list only paths/codes, never input values, so a key sent
 * to `secrets:set` can't be echoed back in an error.
 */
export function createIpcRouter({ ipcMain, isTrustedSender, logError }: IpcRouterOptions) {
  return function handle<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
    const { request: requestSchema, response: responseSchema } = ipcContract[channel];

    ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<IpcResponse<C>>> => {
      if (!isTrustedSender(event)) {
        logError?.(`Rejected IPC from untrusted sender on ${channel}`);
        return fail('FORBIDDEN_SENDER', 'Request rejected.');
      }

      const parsed = requestSchema.safeParse(args[0]);
      if (!parsed.success) {
        const where = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`)
          .join('; ');
        return fail('INVALID_REQUEST', `Invalid request for ${channel} (${where}).`);
      }

      let result: unknown;
      try {
        result = await handler(parsed.data as IpcParsedRequest<C>, event);
      } catch (error) {
        if (error instanceof IpcUserError) return fail(error.code, error.message);
        logError?.(`Handler for ${channel} threw`, error);
        return fail('INTERNAL', 'Something went wrong. See the app log for details.');
      }

      const checked = responseSchema.safeParse(result);
      if (!checked.success) {
        logError?.(`Handler for ${channel} returned an invalid response`, checked.error.issues);
        return fail('INVALID_RESPONSE', 'Something went wrong. See the app log for details.');
      }
      return { ok: true, data: checked.data as IpcResponse<C> };
    });
  };
}

export type IpcHandle = ReturnType<typeof createIpcRouter>;
