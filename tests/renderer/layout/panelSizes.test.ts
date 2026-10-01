import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIZES,
  STORAGE_KEY,
  clampSize,
  loadSizes,
  saveSizes,
} from '../../../src/renderer/src/layout/panelSizes';

describe('panel sizes', () => {
  it('starts from per-layout defaults', () => {
    expect(loadSizes(localStorage, 'chat-first')).toEqual(DEFAULT_SIZES['chat-first']);
    expect(loadSizes(localStorage, 'results-first')).toEqual(DEFAULT_SIZES['results-first']);
  });

  it('remembers each layout separately', () => {
    saveSizes(localStorage, 'chat-first', { sidebar: 300, side: 600, timeline: 150 });
    saveSizes(localStorage, 'results-first', { sidebar: 200, side: 420, timeline: 300 });
    expect(loadSizes(localStorage, 'chat-first')).toEqual({
      sidebar: 300,
      side: 600,
      timeline: 150,
    });
    expect(loadSizes(localStorage, 'results-first')).toEqual({
      sidebar: 200,
      side: 420,
      timeline: 300,
    });
  });

  it('clamps stored values and ignores corrupt or foreign data', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'chat-first': { sidebar: 5, side: 99_999, timeline: 150 } }),
    );
    expect(loadSizes(localStorage, 'chat-first')).toEqual({
      sidebar: clampSize('sidebar', 0),
      side: clampSize('side', Infinity),
      timeline: 150,
    });
    for (const bad of ['not json', '[]', '{"chat-first":{"sidebar":"wide"}}']) {
      localStorage.setItem(STORAGE_KEY, bad);
      expect(loadSizes(localStorage, 'chat-first')).toEqual(DEFAULT_SIZES['chat-first']);
    }
  });
});
