import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { registerSecretsHandlers } from '../../../../src/main/ipc/handlers/secrets';
import { createIpcRouter } from '../../../../src/main/ipc/router';
import { EncryptionUnavailableError, type KeyStore } from '../../../../src/main/secrets/keyStore';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

function wire(keyStore: Partial<KeyStore>) {
  const listeners = new Map<string, Listener>();
  const handle = createIpcRouter({
    ipcMain: { handle: (c, l) => listeners.set(c, l) },
    isTrustedSender: () => true,
  });
  registerSecretsHandlers(handle, keyStore as KeyStore);
  return (channel: string, payload?: unknown) =>
    listeners.get(channel)?.({} as IpcMainInvokeEvent, payload);
}

const STATUS = { anthropic: true, openai: false, huggingface: false };

describe('secrets IPC handlers', () => {
  it('registers exactly status/set/clear, with no channel that returns a key', () => {
    const channels: string[] = [];
    const handle = createIpcRouter({
      ipcMain: { handle: (c) => channels.push(c) },
      isTrustedSender: () => true,
    });
    registerSecretsHandlers(handle, {} as KeyStore);
    expect(channels.sort()).toEqual(['secrets:clear', 'secrets:set', 'secrets:status']);
  });

  it('maps EncryptionUnavailableError to an UNAVAILABLE result', async () => {
    const call = wire({
      set: () => Promise.reject(new EncryptionUnavailableError()),
    });
    await expect(
      call('secrets:set', { provider: 'openai', key: 'sk-12345678' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
  });

  it('returns status booleans on success', async () => {
    const call = wire({ status: () => Promise.resolve(STATUS) });
    await expect(call('secrets:status')).resolves.toEqual({ ok: true, data: STATUS });
  });
});
