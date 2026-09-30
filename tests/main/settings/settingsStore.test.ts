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
    const next = { model: 'opus', maxBudgetUsd: 5, maxTurns: 10 };
    await new SettingsStore(file).setAgent(next);
    await expect(new SettingsStore(file).getAgent()).resolves.toEqual(next);
  });

  it('rejects invalid settings', async () => {
    await expect(
      new SettingsStore(file).setAgent({ model: '', maxBudgetUsd: 0, maxTurns: 0 }),
    ).rejects.toThrow();
  });
});
