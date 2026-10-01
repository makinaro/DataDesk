import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve('src/renderer/src');
const css = readFileSync(join(SRC, 'styles.css'), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The `--dd-*` variables a theme block defines. */
function themeVars(theme: string): Set<string> {
  const block = new RegExp(`:root\\[data-theme='${theme}'\\] \\{([^}]*)\\}`).exec(css);
  if (!block?.[1]) throw new Error(`No block for theme ${theme}`);
  return new Set([...block[1].matchAll(/(--dd-[\w-]+):/g)].map((m) => m[1] ?? ''));
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
});
