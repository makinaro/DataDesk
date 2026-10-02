import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_CHROME } from '../../src/shared/appearance';
import { CHART_INK } from '../../src/shared/chartTheme';

const SRC = resolve('src/renderer/src');
const css = readFileSync(join(SRC, 'styles.css'), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function themeBlock(theme: string): string {
  const block = new RegExp(`\\[data-theme='${theme}'\\] \\{([^}]*)\\}`).exec(css);
  if (!block?.[1]) throw new Error(`No block for theme ${theme}`);
  return block[1];
}

/** The `--dd-*` variables a theme block defines. */
function themeVars(theme: string): Set<string> {
  return new Set([...themeBlock(theme).matchAll(/(--dd-[\w-]+):/g)].map((m) => m[1] ?? ''));
}

function themeValue(theme: string, name: string): string | undefined {
  return new RegExp(`${name}: ([^;]+);`).exec(themeBlock(theme))?.[1];
}

describe('theme tokens', () => {
  it('components use theme tokens, never Tailwind palette colours', () => {
    const palette =
      /\b(?:bg|text|border|outline|ring|divide|fill|stroke|from|to|via|placeholder|accent|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          palette.test(line) ? [`${file}:${String(i + 1)}: ${line.trim()}`] : [],
        ),
    );
    expect(offenders).toEqual([]);
  });

  it('every theme defines every token', () => {
    const dark = themeVars('dark');
    expect(dark.size).toBeGreaterThan(15);
    for (const theme of ['light', 'slate']) {
      expect([...themeVars(theme)].sort()).toEqual([...dark].sort());
    }
  });

  it('every Tailwind colour token points at a variable that the themes define', () => {
    const dark = themeVars('dark');
    const referenced = [...css.matchAll(/--color-[\w-]+: var\((--dd-[\w-]+)\)/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(15);
    for (const name of referenced) expect(dark).toContain(name);
  });

  it.each(Object.entries(CHART_INK))(
    'charts in the %s theme use its stylesheet ink',
    (theme, ink) => {
      expect(ink.canvas).toBe(themeValue(theme, '--dd-canvas'));
      expect(ink.fg).toBe(themeValue(theme, '--dd-fg'));
      expect(ink.muted).toBe(themeValue(theme, '--dd-muted'));
      expect(ink.faint).toBe(themeValue(theme, '--dd-faint'));
      expect(ink.line).toBe(themeValue(theme, '--dd-line'));
      expect(new Set(ink.category).size).toBe(8);
    },
  );

  it.each(Object.entries(THEME_CHROME))(
    'main paints the %s theme in the same colours as the stylesheet',
    (theme, chrome) => {
      expect(chrome.canvas).toBe(themeValue(theme, '--dd-canvas'));
      expect(chrome.titleBar).toBe(themeValue(theme, '--dd-surface'));
      expect(chrome.symbols).toBe(themeValue(theme, '--dd-muted'));
      expect(chrome.nativeSource).toBe(/color-scheme: (\w+)/.exec(themeBlock(theme))?.[1]);
    },
  );
});
