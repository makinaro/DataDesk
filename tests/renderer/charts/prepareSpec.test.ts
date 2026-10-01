import { describe, expect, it } from 'vitest';
import { prepareSpec } from '../../../src/renderer/src/charts/prepareSpec';

const base = {
  mark: 'bar',
  encoding: { x: { field: 'a', type: 'nominal' } },
  data: { values: [{ a: 'x' }] },
};

describe('prepareSpec (renderer re-sanitizing)', () => {
  it('keeps inline rows', () => {
    expect(prepareSpec(base)).toEqual({
      ok: true,
      spec: { mark: 'bar', encoding: base.encoding, data: { values: [{ a: 'x' }] } },
    });
  });

  it('rejects usermeta, which vega-embed would merge over our embed options', () => {
    expect(prepareSpec({ ...base, usermeta: { embedOptions: { actions: true } } }).ok).toBe(false);
  });

  it('rejects specs without inline object rows', () => {
    expect(prepareSpec({ ...base, data: { url: 'https://evil.example/d.csv' } }).ok).toBe(false);
    expect(prepareSpec({ ...base, data: { values: [1, 2] } }).ok).toBe(false);
    expect(prepareSpec({ mark: 'bar' }).ok).toBe(false);
  });

  it('rejects remote references hidden anywhere in an edited artifact', () => {
    const r = prepareSpec({
      ...base,
      layer: [{ mark: 'image', encoding: { url: { value: 'https://evil.example/x.png' } } }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('prepareSpec data limits', () => {
  it('accepts a full-size chart (data does not count toward the spec size limit)', () => {
    const values = Array.from({ length: 5_000 }, (_, i) => ({
      a: `row-${String(i)}`,
      units: i * 1.5,
    }));
    expect(prepareSpec({ ...base, data: { values } }).ok).toBe(true);
  });

  it('rejects more rows than the chart cap', () => {
    const values = Array.from({ length: 5_001 }, () => ({ a: 'x' }));
    expect(prepareSpec({ ...base, data: { values } })).toEqual({
      ok: false,
      error: 'Chart data exceeds 5000 rows.',
    });
  });
});
