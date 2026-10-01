import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../../../src/main/settings/settingsStore';
import { DEFAULT_AGENT_SETTINGS } from '../../../src/shared/agent';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'settings-'));
  file = join(dir, 'settings.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('returns defaults when nothing is stored or the file is corrupt', async () => {
    await expect(new SettingsStore(file).getAgent()).resolves.toEqual(DEFAULT_AGENT_SETTINGS);
    writeFileSync(file, '{ nope');
    await expect(new SettingsStore(file).getAgent()).resolves.toEqual(DEFAULT_AGENT_SETTINGS);
  });

  it('persists valid settings across instances', async () => {
    const next = {
      provider: 'openai' as const,
      model: 'opus',
      openaiModel: 'gpt-5.5' as const,
      maxBudgetUsd: 5,
      maxTurns: 10,
    };
    await new SettingsStore(file).setAgent(next);
    await expect(new SettingsStore(file).getAgent()).resolves.toEqual(next);
  });

  it('rejects invalid settings', async () => {
    await expect(
      new SettingsStore(file).setAgent({ ...DEFAULT_AGENT_SETTINGS, model: '', maxBudgetUsd: 0 }),
    ).rejects.toThrow();
  });

  it('keeps settings saved before Phase 7 (no provider) and defaults to Claude', async () => {
    writeFileSync(
      file,
      JSON.stringify({ version: 1, agent: { model: 'opus', maxBudgetUsd: 3, maxTurns: 12 } }),
    );
    await expect(new SettingsStore(file).getAgent()).resolves.toEqual({
      provider: 'anthropic',
      model: 'opus',
      openaiModel: 'gpt-5.4-mini',
      maxBudgetUsd: 3,
      maxTurns: 12,
    });
  });

  it('refuses an OpenAI model without a price (cost and the spend cap need one)', async () => {
    await expect(
      new SettingsStore(file).setAgent({
        ...DEFAULT_AGENT_SETTINGS,
        openaiModel: 'gpt-4o' as never,
      }),
    ).rejects.toThrow();
  });
});
