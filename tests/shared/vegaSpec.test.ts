import { describe, expect, it } from 'vitest';
import { rowsToValues, sanitizeVegaLiteSpec } from '../../src/shared/vegaSpec';

const bar = {
  mark: 'bar',
  encoding: {
    x: { field: 'region', type: 'nominal' },
    y: { field: 'units', type: 'quantitative' },
  },
};

describe('sanitizeVegaLiteSpec', () => {
  it('accepts a normal spec and reports the encoded fields', () => {
    const r = sanitizeVegaLiteSpec({ ...bar, title: 'Units by region', width: 400 });
    expect(r).toMatchObject({ ok: true, fields: ['region', 'units'] });
  });

  it('drops top-level data and $schema (the server supplies the data)', () => {
    const r = sanitizeVegaLiteSpec({ ...bar, $schema: 'x', data: { values: [{ a: 1 }] } });
    expect(r.ok && Object.keys(r.spec).sort()).toEqual(['encoding', 'mark']);
  });

  it('accepts layered and concatenated specs', () => {
    expect(sanitizeVegaLiteSpec({ layer: [bar, { ...bar, mark: 'rule' }] }).ok).toBe(true);
    expect(sanitizeVegaLiteSpec({ hconcat: [bar, bar] }).ok).toBe(true);
  });

  it.each([
    ['nested data url', { layer: [{ ...bar, data: { url: 'https://evil.example/x.csv' } }] }],
    [
      'lookup from external data',
      { ...bar, transform: [{ lookup: 'a', from: { data: { url: 'x.csv' } } }] },
    ],
    ['image mark url channel', { mark: 'image', encoding: { url: { field: 'u' } } }],
    ['href channel', { ...bar, encoding: { ...bar.encoding, href: { field: 'link' } } }],
    [
      'usermeta (can override embed options)',
      { ...bar, usermeta: { embedOptions: { actions: true } } },
    ],
    ['named datasets', { ...bar, datasets: { a: [] } }],
    ['unknown top-level key', { ...bar, signals: [] }],
    ['no mark', { encoding: bar.encoding }],
    ['not an object', [bar]],
  ])('rejects %s', (_label, spec) => {
    expect(sanitizeVegaLiteSpec(spec).ok).toBe(false);
  });

  it('rejects oversized and pathologically deep specs', () => {
    expect(sanitizeVegaLiteSpec({ ...bar, description: 'x'.repeat(60_000) }).ok).toBe(false);
    let deep: Record<string, unknown> = { a: 1 };
    for (let i = 0; i < 40; i++) deep = { a: deep };
    expect(sanitizeVegaLiteSpec({ ...bar, config: deep }).ok).toBe(false);
  });
});

describe('rowsToValues', () => {
  it('turns row arrays into objects keyed by column', () => {
    expect(rowsToValues(['a', 'b'], [[1, 'x'], [2]])).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: null },
    ]);
  });
});
