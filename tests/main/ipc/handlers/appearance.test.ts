import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { registerAppearanceHandlers } from '../../../../src/main/ipc/handlers/appearance';
import { createIpcRouter } from '../../../../src/main/ipc/router';
import { DEFAULT_APPEARANCE, type Appearance } from '../../../../src/shared/appearance';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

function wire() {
  const listeners = new Map<string, Listener>();
  const handle = createIpcRouter({
    ipcMain: { handle: (c, l) => listeners.set(c, l) },
    isTrustedSender: () => true,
  });
  let saved: Appearance = { ...DEFAULT_APPEARANCE };
  const store = {
    get: vi.fn(() => Promise.resolve(saved)),
    set: vi.fn((next: Appearance) => {
      saved = next;
      return Promise.resolve(next);
    }),
  };
  const onChanged = vi.fn();
  registerAppearanceHandlers(handle, { store, onChanged });
  const call = (channel: string, payload?: unknown) =>
    listeners.get(channel)?.({} as IpcMainInvokeEvent, payload);
  return { call, store, onChanged, channels: [...listeners.keys()] };
}

describe('appearance IPC handlers', () => {
  it('registers exactly get and set', () => {
    expect(wire().channels.sort()).toEqual(['settings:getAppearance', 'settings:setAppearance']);
  });

  it('saves, then applies the saved appearance in main', async () => {
    const { call, onChanged } = wire();
    const next = { theme: 'light', layout: 'chat-first' };
    await expect(call('settings:setAppearance', next)).resolves.toEqual({ ok: true, data: next });
    expect(onChanged).toHaveBeenCalledWith(next);
    await expect(call('settings:getAppearance')).resolves.toEqual({ ok: true, data: next });
  });

  it('rejects an invalid appearance before it reaches the store', async () => {
    const { call, store, onChanged } = wire();
    await expect(
      call('settings:setAppearance', { theme: 'dark', layout: 'chat-first', extra: 1 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(store.set).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
