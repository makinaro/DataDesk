import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { createSenderCheck } from '../../../src/main/ipc/trustedSender';

const isTrusted = createSenderCheck('app://datadesk');

function eventFrom(frame: { url: string; parent: unknown } | null): IpcMainInvokeEvent {
  return { senderFrame: frame } as unknown as IpcMainInvokeEvent;
}

describe('createSenderCheck', () => {
  it('trusts the top-level frame of the app origin', () => {
    expect(isTrusted(eventFrom({ url: 'app://datadesk/index.html', parent: null }))).toBe(true);
  });

  it('rejects subframes, foreign origins and destroyed frames', () => {
    expect(isTrusted(eventFrom({ url: 'app://datadesk/index.html', parent: {} }))).toBe(false);
    expect(isTrusted(eventFrom({ url: 'https://example.com/', parent: null }))).toBe(false);
    expect(isTrusted(eventFrom({ url: 'app://evil/index.html', parent: null }))).toBe(false);
    expect(isTrusted(eventFrom(null))).toBe(false);
  });
});
