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

  describe('dataset channels', () => {
    const register = ipcContract[IpcChannels.datasetsRegister].request;
    const preview = ipcContract[IpcChannels.datasetsPreview].request;

    it('accepts a path with an optional safe name', () => {
      expect(register.safeParse({ path: 'C:/data/sales.csv' }).success).toBe(true);
      expect(register.safeParse({ path: 'C:/data/sales.csv', name: 'sales_2026' }).success).toBe(
        true,
      );
    });

    it.each([
      { path: '' },
      { path: 'x'.repeat(5000) },
      { path: 'C:/a.csv', name: 'Bad Name' },
      { path: 'C:/a.csv', extra: 1 },
    ])('rejects register payload %j', (payload) => {
      expect(register.safeParse(payload).success).toBe(false);
    });

    it('bounds preview limits and validates names', () => {
      expect(preview.safeParse({ name: 'sales', limit: 20 }).success).toBe(true);
      expect(preview.safeParse({ name: 'sales', limit: 0 }).success).toBe(false);
      expect(preview.safeParse({ name: 'sales', limit: 101 }).success).toBe(false);
      expect(preview.safeParse({ name: '../etc', limit: 5 }).success).toBe(false);
    });
  });

  it('no-payload channels reject payloads', () => {
    expect(ipcContract[IpcChannels.secretsStatus].request.safeParse({ x: 1 }).success).toBe(false);
    expect(ipcContract[IpcChannels.secretsStatus].request.safeParse(undefined).success).toBe(true);
  });
});
