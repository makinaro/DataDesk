import { describe, expect, it } from 'vitest';
import { defaultHfDatasetName, LoadHfDatasetInput } from '../../src/shared/hf';

const ok = { repo_id: 'scikit-learn/iris', path: 'Iris.csv' };

describe('LoadHfDatasetInput (what the user approves and the tool downloads)', () => {
  it.each([
    ok,
    { ...ok, path: 'data/train-00000-of-00001.parquet' },
    { ...ok, revision: 'refs/convert/parquet', path: 'default/train/0000.parquet' },
    { ...ok, revision: '3f1a9c0', name: 'iris' },
    { repo_id: 'HuggingFaceFW/fineweb.edu-v1', path: 'sample.JSONL' },
  ])('accepts %j', (input) => {
    expect(LoadHfDatasetInput.safeParse(input).success).toBe(true);
  });

  it.each([
    { ...ok, repo_id: 'iris' },
    { ...ok, repo_id: '../etc/passwd' },
    { ...ok, repo_id: 'a/b/c' },
    { ...ok, repo_id: 'https://evil.example/x' },
    { ...ok, path: '../secret.csv' },
    { ...ok, path: 'data/../../x.csv' },
    { ...ok, path: '/abs.csv' },
    { ...ok, path: 'C:/Users/me/x.csv' },
    { ...ok, path: 'data\\x.csv' },
    { ...ok, path: 'data//x.csv' },
    { ...ok, path: 'data/x\u0000.csv' },
    { ...ok, path: 'x\n.csv' },
    { ...ok, path: 'model.safetensors' },
    { ...ok, path: 'x.csv.exe' },
    { ...ok, path: 'sheet.xlsx' },
    { ...ok, path: `${'a/'.repeat(300)}x.csv` },
    { ...ok, revision: '../main' },
    { ...ok, revision: 'main?x=1' },
    { ...ok, name: 'Bad Name' },
  ])('rejects %j', (input) => {
    expect(LoadHfDatasetInput.safeParse(input).success).toBe(false);
  });
});

describe('defaultHfDatasetName', () => {
  it.each([
    ['scikit-learn/iris', 'Iris.csv', 'hf_iris'],
    ['stanfordnlp/imdb', 'plain_text/train-00000-of-00001.parquet', 'hf_imdb_train_00000_of_00001'],
    ['owner/wikitext-2.0', 'test.csv', 'hf_wikitext_2_0_test'],
    ['o/r', `${'x'.repeat(100)}.csv`, `hf_r_${'x'.repeat(58)}`],
  ])('%s %s → %s', (repo, path, name) => {
    expect(defaultHfDatasetName(repo, path)).toBe(name);
  });
});
