import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { IpcUserError } from '../../../src/main/ipc/errors';
import { createIpcRouter, type IpcMainLike } from '../../../src/main/ipc/router';
import { IpcChannels } from '../../../src/shared/ipc/channels';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

function setup(trusted = true) {
  const listeners = new Map<string, Listener>();
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => {
      listeners.set(channel, listener);
    },
  };
  const logError = vi.fn();
  const handle = createIpcRouter({ ipcMain, isTrustedSender: () => trusted, logError });
  const call = (channel: string, payload?: unknown) => {
    const listener = listeners.get(channel);
    if (!listener) throw new Error(`no handler for ${channel}`);
    return listener({} as IpcMainInvokeEvent, payload);
  };
  return { handle, call, logError };
}

const STATUS = { anthropic: true, openai: false, huggingface: false };
const SECRET = 'sk-ant-super-secret-value';

describe('createIpcRouter', () => {
  it('returns ok + validated data on success', async () => {
    const { handle, call } = setup();
    const handler = vi.fn(() => STATUS);
    handle(IpcChannels.secretsSet, handler);

    await expect(call('secrets:set', { provider: 'anthropic', key: SECRET })).resolves.toEqual({
      ok: true,
      data: STATUS,
    });
    expect(handler).toHaveBeenCalledWith({ provider: 'anthropic', key: SECRET }, {});
  });

  it('rejects untrusted senders before running the handler', async () => {
    const { handle, call } = setup(false);
    const handler = vi.fn(() => STATUS);
    handle(IpcChannels.secretsStatus, handler);

    await expect(call('secrets:status')).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects invalid requests without echoing input values', async () => {
    const { handle, call } = setup();
    const handler = vi.fn(() => STATUS);
    handle(IpcChannels.secretsSet, handler);

    const result = await call('secrets:set', { provider: 'nope', key: SECRET });
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects handler responses that break the contract (e.g. leaking a key)', async () => {
    const { handle, call, logError } = setup();
    handle(IpcChannels.secretsStatus, () => ({ ...STATUS, key: SECRET }) as typeof STATUS);

    const result = await call('secrets:status');
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(logError).toHaveBeenCalled();
  });

  it('passes IpcUserError codes and messages through', async () => {
    const { handle, call } = setup();
    handle(IpcChannels.secretsStatus, () => {
      throw new IpcUserError('UNAVAILABLE', 'Encryption is unavailable.');
    });
    await expect(call('secrets:status')).resolves.toEqual({
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'Encryption is unavailable.' },
    });
  });

  it('hides unexpected error details from the renderer', async () => {
    const { handle, call, logError } = setup();
    handle(IpcChannels.secretsStatus, () => {
      throw new Error(`disk failure while reading ${SECRET}`);
    });
    const result = await call('secrets:status');
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(logError).toHaveBeenCalled();
  });
});
