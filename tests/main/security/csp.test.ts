import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../../src/main/security/csp';

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((part) => {
      const [name = '', ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe('buildCsp', () => {
  const prod = directives(buildCsp({ kind: 'production' }));

  it('denies everything by default in production', () => {
    expect(prod.get('default-src')).toEqual(["'none'"]);
    expect(prod.get('object-src')).toEqual(["'none'"]);
    expect(prod.get('base-uri')).toEqual(["'none'"]);
    expect(prod.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('never allows eval or inline script in production', () => {
    const csp = buildCsp({ kind: 'production' });
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-inline');
    expect(prod.get('script-src')).toEqual(["'self'"]);
  });

  it('allows no remote network connections in production', () => {
    expect(prod.get('connect-src')).toEqual(["'self'"]);
  });

  it('relaxes only script/style/connect for the Vite dev server', () => {
    const dev = directives(
      buildCsp({ kind: 'development', devServerUrl: 'http://localhost:5173/' }),
    );
    expect(dev.get('script-src')).toContain('http://localhost:5173');
    expect(dev.get('connect-src')).toContain('ws://localhost:5173');
    expect(dev.get('default-src')).toEqual(["'none'"]);
    expect(buildCsp({ kind: 'development', devServerUrl: 'http://localhost:5173' })).not.toContain(
      'unsafe-eval',
    );
  });
});
