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

  describe('artifacts channels', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const getChart = ipcContract[IpcChannels.artifactsGetChart].request;
    const exportReport = ipcContract[IpcChannels.artifactsExportReport].request;

    it('only accepts uuid ids (no paths)', () => {
      expect(getChart.safeParse({ id }).success).toBe(true);
      for (const bad of ['../x', 'C:/secrets.json', '', id.slice(1)]) {
        expect(getChart.safeParse({ id: bad }).success).toBe(false);
      }
      expect(getChart.safeParse({ id, extra: 1 }).success).toBe(false);
    });

    it('bounds export payloads and takes no renderer SVGs', () => {
      expect(exportReport.safeParse({ id, format: 'md' }).success).toBe(true);
      expect(exportReport.safeParse({ id, format: 'pdf', bodyHtml: '<p>x</p>' }).success).toBe(
        true,
      );
      expect(exportReport.safeParse({ id, format: 'docx' }).success).toBe(false);
      expect(exportReport.safeParse({ id, format: 'md', svgs: {} }).success).toBe(false);
      expect(
        exportReport.safeParse({ id, format: 'pdf', bodyHtml: 'x'.repeat(20_000_001) }).success,
      ).toBe(false);
    });
  });

  describe('compare channels', () => {
    const run = ipcContract[IpcChannels.compareRun].request;

    it('takes one bounded question and nothing else', () => {
      expect(run.safeParse({ text: 'Which region?' }).success).toBe(true);
      expect(run.safeParse({ text: '   ' }).success).toBe(false);
      expect(run.safeParse({ text: 'x'.repeat(20_001) }).success).toBe(false);
      expect(run.safeParse({ text: 'q', provider: 'openai' }).success).toBe(false);
      expect(ipcContract[IpcChannels.compareStop].request.safeParse({}).success).toBe(false);
      expect(ipcContract[IpcChannels.compareReset].request.safeParse(undefined).success).toBe(true);
    });
  });

  describe('clipboard channel', () => {
    it('is write-only: no channel can read the clipboard', () => {
      const clipboardChannels = Object.values(IpcChannels).filter((c) =>
        c.startsWith('clipboard:'),
      );
      expect(clipboardChannels).toEqual(['clipboard:writeText']);
    });

    it('takes only bounded text', () => {
      const write = ipcContract[IpcChannels.clipboardWriteText].request;
      expect(write.safeParse({ text: 'SELECT 1;' }).success).toBe(true);
      expect(write.safeParse({ text: 'x'.repeat(1_000_001) }).success).toBe(false);
      expect(write.safeParse({ text: 'x', html: '<b>x</b>' }).success).toBe(false);
      expect(write.safeParse({}).success).toBe(false);
    });
  });

  describe('appearance channels', () => {
    const set = ipcContract[IpcChannels.settingsSetAppearance].request;

    it('takes only a known theme and layout', () => {
      expect(set.safeParse({ theme: 'slate', layout: 'chat-first' }).success).toBe(true);
      expect(set.safeParse({ theme: 'neon', layout: 'chat-first' }).success).toBe(false);
      expect(set.safeParse({ theme: 'dark', layout: 'sideways' }).success).toBe(false);
      expect(set.safeParse({ theme: 'dark' }).success).toBe(false);
      expect(set.safeParse({ theme: 'dark', layout: 'chat-first', css: 'body{}' }).success).toBe(
        false,
      );
      expect(ipcContract[IpcChannels.settingsGetAppearance].request.safeParse({}).success).toBe(
        false,
      );
    });
  });
});
