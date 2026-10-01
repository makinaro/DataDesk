import { z } from 'zod';

export const ThemeSchema = z.enum(['dark', 'light', 'slate', 'system']);
export type Theme = z.infer<typeof ThemeSchema>;
/** A theme with `system` resolved: the value of `<html data-theme>`. */
export type ResolvedTheme = Exclude<Theme, 'system'>;

export const LayoutSchema = z.enum(['results-first', 'chat-first']);
export type Layout = z.infer<typeof LayoutSchema>;

/** UI preferences. Not agent settings: changing them never touches the conversation. */
export const AppearanceSchema = z.strictObject({
  theme: ThemeSchema,
  layout: LayoutSchema,
});
export type Appearance = z.infer<typeof AppearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = { theme: 'dark', layout: 'results-first' };

/**
 * Electron's `nativeTheme.themeSource` for a theme. It drives `prefers-color-scheme` in the
 * renderer and native UI (context menus); `system` keeps following the OS.
 */
export function nativeThemeSource(theme: Theme): 'system' | 'dark' | 'light' {
  return theme === 'system' ? 'system' : THEME_CHROME[theme].nativeSource;
}

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme !== 'system') return theme;
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Colours main paints outside the page: the window background before first paint (--dd-canvas)
 * and the native window controls (--dd-surface behind --dd-muted symbols). A tooling test keeps
 * them equal to styles.css.
 */
export const THEME_CHROME: Record<
  ResolvedTheme,
  { canvas: string; titleBar: string; symbols: string; nativeSource: 'dark' | 'light' }
> = {
  dark: { canvas: '#0e0e0e', titleBar: '#151515', symbols: '#b4b4b4', nativeSource: 'dark' },
  light: { canvas: '#ffffff', titleBar: '#f7f7f6', symbols: '#464646', nativeSource: 'light' },
  slate: { canvas: '#020617', titleBar: '#0b1224', symbols: '#b4c0d0', nativeSource: 'dark' },
};
