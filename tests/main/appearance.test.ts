import { describe, expect, it, vi } from 'vitest';
import { applyTheme, chromeFor } from '../../src/main/appearance';
import { THEME_CHROME } from '../../src/shared/appearance';

function fakeNativeTheme(systemDark: boolean) {
  const theme = {
    source: 'system' as 'system' | 'dark' | 'light',
    sets: 0,
    get themeSource() {
      return this.source;
    },
    set themeSource(value) {
      this.sets++;
      this.source = value;
    },
    get shouldUseDarkColors() {
      return this.source === 'system' ? systemDark : this.source === 'dark';
    },
  };
  return theme;
}

describe('applyTheme', () => {
  it.each([
    ['dark', 'dark', THEME_CHROME.dark],
    ['light', 'light', THEME_CHROME.light],
    ['slate', 'dark', THEME_CHROME.slate],
  ] as const)('%s sets themeSource %s and paints its colours', (theme, source, chrome) => {
    const nativeTheme = fakeNativeTheme(false);
    const paint = vi.fn();
    applyTheme(theme, { nativeTheme, paint });
    expect(nativeTheme.themeSource).toBe(source);
    expect(paint).toHaveBeenCalledWith(chrome);
  });

  it('system keeps following the OS', () => {
    const paint = vi.fn();
    const darkOs = fakeNativeTheme(true);
    darkOs.source = 'light';
    applyTheme('system', { nativeTheme: darkOs, paint });
    expect(darkOs.themeSource).toBe('system');
    expect(paint).toHaveBeenLastCalledWith(THEME_CHROME.dark);

    applyTheme('system', { nativeTheme: fakeNativeTheme(false), paint });
    expect(paint).toHaveBeenLastCalledWith(THEME_CHROME.light);
  });

  it('does not reassign an unchanged themeSource (that would re-emit "updated")', () => {
    const nativeTheme = fakeNativeTheme(false);
    applyTheme('system', { nativeTheme, paint: vi.fn() });
    expect(nativeTheme.sets).toBe(0);
  });
});

describe('chromeFor', () => {
  it('resolves system with the OS preference', () => {
    expect(chromeFor('system', true)).toBe(THEME_CHROME.dark);
    expect(chromeFor('system', false)).toBe(THEME_CHROME.light);
    expect(chromeFor('slate', false)).toBe(THEME_CHROME.slate);
  });
});
