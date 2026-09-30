import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: {}, protocol: {} }));

const { resolveAppPath } = await import('../../../src/main/security/appProtocol');

const root = resolve('/srv/renderer');

describe('resolveAppPath', () => {
  it('maps app URLs to files inside the renderer root', () => {
    expect(resolveAppPath(root, 'app://datadesk/index.html')).toBe(join(root, 'index.html'));
    expect(resolveAppPath(root, 'app://datadesk/assets/index-abc.js')).toBe(
      join(root, 'assets', 'index-abc.js'),
    );
  });

  it('serves index.html for the bare origin', () => {
    expect(resolveAppPath(root, 'app://datadesk/')).toBe(join(root, 'index.html'));
  });

  // The URL parser normalizes literal and %2e-encoded dot segments before we see the path,
  // so these land inside the root. What matters is that they never leave it.
  it.each(['app://datadesk/../secrets.json', 'app://datadesk/%2e%2e/../../secrets.json'])(
    'keeps normalized dot-segments inside the root: %s',
    (url) => {
      expect(resolveAppPath(root, url)).toBe(join(root, 'secrets.json'));
    },
  );

  it.each([
    'app://datadesk/assets/%2e%2e%2f%2e%2e%2fsecrets.json',
    // Windows-specific: %5c decodes to `\`, a path separator only on Windows (CI is Windows-only).
    'app://datadesk/..%5c..%5cWindows%5cwin.ini',
    'app://datadesk/%00',
    'app://datadesk/%E0%A4%A',
  ])('blocks traversal and malformed paths: %s', (url) => {
    expect(resolveAppPath(root, url)).toBeNull();
  });

  it('rejects foreign hosts and schemes', () => {
    expect(resolveAppPath(root, 'app://evil/index.html')).toBeNull();
    expect(resolveAppPath(root, 'file:///srv/renderer/index.html')).toBeNull();
    expect(resolveAppPath(root, 'not a url')).toBeNull();
  });
});
