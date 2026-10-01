import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { registerClipboardHandlers } from '../../../../src/main/ipc/handlers/clipboard';
import { createIpcRouter } from '../../../../src/main/ipc/router';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

function wire() {
  const listeners = new Map<string, Listener>();
  const handle = createIpcRouter({
    ipcMain: { handle: (c, l) => listeners.set(c, l) },
    isTrustedSender: () => true,
  });
  const clipboard = { writeText: vi.fn() };
  registerClipboardHandlers(handle, clipboard);
  const call = (channel: string, payload?: unknown) =>
    listeners.get(channel)?.({} as IpcMainInvokeEvent, payload);
  return { call, clipboard, channels: [...listeners.keys()] };
}

describe('clipboard IPC handlers', () => {
  it('registers only writeText', () => {
    expect(wire().channels).toEqual(['clipboard:writeText']);
  });

  it('writes plain text to the system clipboard', async () => {
    const { call, clipboard } = wire();
    await expect(call('clipboard:writeText', { text: 'SELECT 1;' })).resolves.toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(clipboard.writeText).toHaveBeenCalledWith('SELECT 1;');
  });

  it('rejects an invalid request before touching the clipboard', async () => {
    const { call, clipboard } = wire();
    await expect(call('clipboard:writeText', { text: 42 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
});
