import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { IpcUserError } from '../../../../src/main/ipc/errors';
import { registerCompareHandlers } from '../../../../src/main/ipc/handlers/compare';
import { createIpcRouter } from '../../../../src/main/ipc/router';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

function wire() {
  const listeners = new Map<string, Listener>();
  const compare = {
    run: vi.fn((_text: string) => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    reset: vi.fn(() => Promise.resolve()),
  };
  const handle = createIpcRouter({
    ipcMain: { handle: (c, l) => listeners.set(c, l) },
    isTrustedSender: () => true,
  });
  registerCompareHandlers(handle, compare);
  const call = (channel: string, payload?: unknown) =>
    listeners.get(channel)?.({} as IpcMainInvokeEvent, payload);
  return { call, compare };
}

describe('compare IPC handlers', () => {
  it('runs a validated, trimmed question', async () => {
    const { call, compare } = wire();
    await expect(call('compare:run', { text: '  Which region?  ' })).resolves.toEqual({
      ok: true,
      data: { accepted: true },
    });
    expect(compare.run).toHaveBeenCalledWith('Which region?');
    await expect(call('compare:run', { text: '' })).resolves.toMatchObject({ ok: false });
    expect(compare.run).toHaveBeenCalledOnce();
  });

  it('surfaces missing keys as UNAVAILABLE', async () => {
    const { call, compare } = wire();
    compare.run.mockRejectedValueOnce(
      new IpcUserError('UNAVAILABLE', 'Compare mode needs both keys.'),
    );
    await expect(call('compare:run', { text: 'q' })).resolves.toEqual({
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'Compare mode needs both keys.' },
    });
  });

  it('stop and reset reach the compare runtime', async () => {
    const { call, compare } = wire();
    await call('compare:stop');
    await call('compare:reset');
    expect(compare.stop).toHaveBeenCalledOnce();
    expect(compare.reset).toHaveBeenCalledOnce();
  });
});
