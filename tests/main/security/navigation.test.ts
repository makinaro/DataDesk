import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl, isAppOrigin } from '../../../src/main/security/navigation';

describe('isAllowedExternalUrl', () => {
  it.each([
    'https://huggingface.co/datasets/foo/bar',
    'https://www.github.com/makinaro',
    'https://duckdb.org/docs',
  ])('allows %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });

  it.each([
    'http://huggingface.co/',
    'https://evil.com/',
    'https://huggingface.co.evil.com/',
    'https://user:pass@github.com/',
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });
});

describe('isAppOrigin', () => {
  it('matches the app origin', () => {
    expect(isAppOrigin('app://datadesk/index.html', 'app://datadesk')).toBe(true);
    expect(isAppOrigin('http://localhost:5173/x', 'http://localhost:5173')).toBe(true);
  });

  // Regression: Node's URL gives origin "null" for every non-special scheme, so a naive
  // `.origin` comparison would let any custom-scheme URL through.
  it.each([
    'app://other/index.html',
    'evil://datadesk/index.html',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'https://example.com',
    'http://localhost:5174/',
    'garbage',
  ])('rejects %s', (url) => {
    expect(
      isAppOrigin(
        url,
        url.startsWith('http://localhost') ? 'http://localhost:5173' : 'app://datadesk',
      ),
    ).toBe(false);
  });
});
