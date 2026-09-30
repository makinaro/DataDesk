import { describe, expect, it } from 'vitest';
import { IpcChannels } from '../../../src/shared/ipc/channels';
import { ipcContract, SecretsStatusSchema } from '../../../src/shared/ipc/contract';

describe('ipcContract', () => {
  it('defines request and response schemas for every channel', () => {
    for (const channel of Object.values(IpcChannels)) {
      expect(ipcContract[channel].request).toBeDefined();
      expect(ipcContract[channel].response).toBeDefined();
    }
  });

  describe('secrets:set request', () => {
    const schema = ipcContract[IpcChannels.secretsSet].request;

    it('accepts a known provider and a plausible key', () => {
      expect(schema.safeParse({ provider: 'openai', key: 'sk-test-12345678' }).success).toBe(true);
    });

    it.each([
      { provider: 'gemini', key: 'sk-test-12345678' },
      { provider: 'openai', key: 'short' },
      { provider: 'openai', key: '        ' },
      { provider: 'openai', key: 'sk-test-12345678', extra: true },
      { provider: 'openai' },
      'sk-test-12345678',
      undefined,
    ])('rejects %j', (payload) => {
      expect(schema.safeParse(payload).success).toBe(false);
    });
  });

  it('secrets status can never carry a key (strict booleans only)', () => {
    expect(
      SecretsStatusSchema.safeParse({ anthropic: true, openai: false, huggingface: false }).success,
    ).toBe(true);
    expect(
      SecretsStatusSchema.safeParse({
        anthropic: true,
        openai: false,
        huggingface: false,
        anthropicKey: 'sk-ant-leak',
      }).success,
    ).toBe(false);
    expect(
      SecretsStatusSchema.safeParse({ anthropic: 'sk-ant-leak', openai: false, huggingface: false })
        .success,
    ).toBe(false);
  });

  it('no-payload channels reject payloads', () => {
    expect(ipcContract[IpcChannels.secretsStatus].request.safeParse({ x: 1 }).success).toBe(false);
    expect(ipcContract[IpcChannels.secretsStatus].request.safeParse(undefined).success).toBe(true);
  });
});
