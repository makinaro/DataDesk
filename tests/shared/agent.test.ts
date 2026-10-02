import { describe, expect, it } from 'vitest';
import { changesCatalog } from '../../src/shared/agent';

describe('changesCatalog', () => {
  it('matches catalog tools as Claude and OpenAI report them', () => {
    for (const name of [
      'mcp__datadesk__register_dataset',
      'mcp__datadesk__load_hf_dataset',
      'register_dataset',
      'load_hf_dataset',
    ]) {
      expect(changesCatalog(name), name).toBe(true);
    }
  });

  it('ignores every other tool, including look-alikes from other servers', () => {
    for (const name of [
      'mcp__datadesk__run_sql',
      'mcp__datadesk__list_datasets',
      'mcp__hf__load_hf_dataset',
      'mcp__datadesk__register_dataset_v2',
      'Agent',
    ]) {
      expect(changesCatalog(name), name).toBe(false);
    }
  });
});
