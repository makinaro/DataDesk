import { describe, expect, it } from 'vitest';
import { DatasetNameSchema, suggestDatasetName } from '../../src/shared/datasets';

describe('DatasetNameSchema', () => {
  it.each(['sales', 'sales_2026', 'a'])('accepts %s', (name) => {
    expect(DatasetNameSchema.safeParse(name).success).toBe(true);
  });

  it.each(['Sales', '2026_sales', '_x', 'sales-2026', 'x; drop table y', 'a'.repeat(64), ''])(
    'rejects %j',
    (name) => {
      expect(DatasetNameSchema.safeParse(name).success).toBe(false);
    },
  );
});

describe('suggestDatasetName', () => {
  it.each([
    ['Sales Report (Q1).csv', 'sales_report_q1'],
    ['2026-data.parquet', 'ds_2026_data'],
    ['events.ndjson', 'events'],
    ['!!!.csv', 'ds_'],
  ])('%s → %s', (file, expected) => {
    expect(suggestDatasetName(file)).toBe(expected);
  });

  it('always produces a valid name', () => {
    for (const f of [
      'Sales Report (Q1).csv',
      '2026-data.parquet',
      'Ünïcödé.xlsx',
      'x'.repeat(200),
    ]) {
      expect(DatasetNameSchema.safeParse(suggestDatasetName(f)).success).toBe(true);
    }
  });
});
