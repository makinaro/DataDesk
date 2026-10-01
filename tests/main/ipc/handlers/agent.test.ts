import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { IpcUserError } from '../../../../src/main/ipc/errors';
import { registerAgentHandlers } from '../../../../src/main/ipc/handlers/agent';
import { createIpcRouter } from '../../../../src/main/ipc/router';
import { DEFAULT_AGENT_SETTINGS } from '../../../../src/shared/agent';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

function wire(opts: { noKey?: boolean } = {}) {
  const listeners = new Map<string, Listener>();
  const orchestrator = {
    send: vi.fn(),
    stop: vi.fn(() => Promise.resolve()),
    reset: vi.fn(() => Promise.resolve()),
    dispose: vi.fn(() => Promise.resolve()),
  };
  const approvals = { respond: vi.fn(() => true) };
  const onSettingsChanged = vi.fn(() => Promise.resolve());
  const settings = {
    getAgent: vi.fn(() => Promise.resolve(DEFAULT_AGENT_SETTINGS)),
    setAgent: vi.fn((s: typeof DEFAULT_AGENT_SETTINGS) => Promise.resolve(s)),
  };
  const handle = createIpcRouter({
    ipcMain: { handle: (c, l) => listeners.set(c, l) },
    isTrustedSender: () => true,
  });
  registerAgentHandlers(handle, {
    getOrchestrator: () =>
      opts.noKey
        ? Promise.reject(new IpcUserError('UNAVAILABLE', 'Add your Anthropic API key.'))
        : Promise.resolve(orchestrator),
    currentOrchestrator: () => orchestrator,
    approvals,
    settings,
    onSettingsChanged,
  });
  const call = (channel: string, payload?: unknown) =>
    listeners.get(channel)?.({} as IpcMainInvokeEvent, payload);
  return { call, orchestrator, approvals, settings, onSettingsChanged };
}

describe('agent IPC handlers', () => {
  it('sends validated text to the orchestrator', async () => {
    const { call, orchestrator } = wire();
    await expect(call('agent:send', { text: '  Which region?  ' })).resolves.toEqual({
      ok: true,
      data: { accepted: true },
    });
    expect(orchestrator.send).toHaveBeenCalledWith('Which region?');
  });

  it('rejects empty or oversized messages', async () => {
    const { call, orchestrator } = wire();
    await expect(call('agent:send', { text: '   ' })).resolves.toMatchObject({ ok: false });
    await expect(call('agent:send', { text: 'x'.repeat(20_001) })).resolves.toMatchObject({
      ok: false,
    });
    expect(orchestrator.send).not.toHaveBeenCalled();
  });

  it('surfaces a missing key as UNAVAILABLE', async () => {
    const { call } = wire({ noKey: true });
    await expect(call('agent:send', { text: 'hi' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
  });

  it('approve requires a UUID request id and reports whether it was found', async () => {
    const { call, approvals } = wire();
    await expect(
      call('agent:approve', { requestId: 'nope', approved: true }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(call('agent:approve', { requestId: id, approved: false })).resolves.toEqual({
      ok: true,
      data: { found: true },
    });
    expect(approvals.respond).toHaveBeenCalledWith(id, false);
  });

  it('saving settings validates them and restarts the conversation', async () => {
    const { call, settings, onSettingsChanged } = wire();
    const next = { ...DEFAULT_AGENT_SETTINGS, provider: 'openai', model: 'opus', maxTurns: 5 };
    await expect(call('settings:setAgent', next)).resolves.toEqual({ ok: true, data: next });
    expect(settings.setAgent).toHaveBeenCalledWith(next);
    expect(onSettingsChanged).toHaveBeenCalledOnce();
    await expect(call('settings:setAgent', { ...next, maxBudgetUsd: 1000 })).resolves.toMatchObject(
      { ok: false, error: { code: 'INVALID_REQUEST' } },
    );
    await expect(call('settings:setAgent', { ...next, provider: 'gemini' })).resolves.toMatchObject(
      { ok: false, error: { code: 'INVALID_REQUEST' } },
    );
    expect(onSettingsChanged).toHaveBeenCalledOnce();
  });

  it('fills the provider fields of settings saved by an older renderer', async () => {
    const { call } = wire();
    await expect(
      call('settings:setAgent', { model: 'opus', maxBudgetUsd: 1, maxTurns: 5 }),
    ).resolves.toEqual({
      ok: true,
      data: { ...DEFAULT_AGENT_SETTINGS, model: 'opus', maxBudgetUsd: 1, maxTurns: 5 },
    });
  });

  it('stop and reset reach the orchestrator', async () => {
    const { call, orchestrator } = wire();
    await call('agent:stop');
    await call('agent:reset');
    expect(orchestrator.stop).toHaveBeenCalled();
    expect(orchestrator.reset).toHaveBeenCalled();
  });
});
