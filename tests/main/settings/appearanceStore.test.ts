import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppearanceStore } from '../../../src/main/settings/appearanceStore';
import { DEFAULT_APPEARANCE, type Appearance } from '../../../src/shared/appearance';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'appearance-'));
  file = join(dir, 'appearance.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('AppearanceStore', () => {
  it('defaults to the dark theme and the results-first layout', async () => {
    await expect(new AppearanceStore(file).get()).resolves.toEqual({
      theme: 'dark',
      layout: 'results-first',
    });
  });

  it('falls back to defaults for a corrupt or unknown file', async () => {
    writeFileSync(file, '{ nope');
    await expect(new AppearanceStore(file).get()).resolves.toEqual(DEFAULT_APPEARANCE);
    writeFileSync(file, JSON.stringify({ version: 1, appearance: { theme: 'neon' } }));
    await expect(new AppearanceStore(file).get()).resolves.toEqual(DEFAULT_APPEARANCE);
  });

  it('persists across instances in its own file', async () => {
    const next: Appearance = { theme: 'system', layout: 'chat-first' };
    await new AppearanceStore(file).set(next);
    await expect(new AppearanceStore(file).get()).resolves.toEqual(next);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 1, appearance: next });
  });

  it('rejects invalid values', async () => {
    await expect(
      new AppearanceStore(file).set({ theme: 'neon', layout: 'chat-first' } as never),
    ).rejects.toThrow();
  });
});
