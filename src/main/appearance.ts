import {
  nativeThemeSource,
  resolveTheme,
  THEME_CHROME,
  type ResolvedTheme,
  type Theme,
} from '../shared/appearance';

export type WindowChrome = (typeof THEME_CHROME)[ResolvedTheme];

interface NativeThemeLike {
  themeSource: 'system' | 'dark' | 'light';
  readonly shouldUseDarkColors: boolean;
}

interface Deps {
  nativeTheme: NativeThemeLike;
  /** Paints one window's main-drawn colours. */
  paint: (chrome: WindowChrome) => void;
}

/**
 * Applies a theme to what main draws. Setting `themeSource` makes `prefers-color-scheme` in
 * the renderer follow it, so the page resolves `system` itself.
 */
export function applyTheme(theme: Theme, { nativeTheme, paint }: Deps): void {
  const source = nativeThemeSource(theme);
  if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source;
  paint(chromeFor(theme, nativeTheme.shouldUseDarkColors));
}

export function chromeFor(theme: Theme, systemPrefersDark: boolean): WindowChrome {
  return THEME_CHROME[resolveTheme(theme, systemPrefersDark)];
}
