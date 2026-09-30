/**
 * Content-Security-Policy for the renderer. Production is strict: only our own bundled scripts
 * and styles, no eval, no inline scripts, no network. Dev relaxes only what Vite needs for HMR
 * (the React Refresh preamble is an inline script, and Tailwind injects <style> tags at runtime).
 */
export type CspMode = { kind: 'production' } | { kind: 'development'; devServerUrl: string };

const PRODUCTION_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-ancestors': ["'none'"],
};

export function buildCsp(mode: CspMode): string {
  const directives: Record<string, string[]> = structuredClone(PRODUCTION_DIRECTIVES);

  if (mode.kind === 'development') {
    const origin = new URL(mode.devServerUrl).origin;
    const wsOrigin = origin.replace(/^http/, 'ws');
    directives['script-src'] = ["'self'", "'unsafe-inline'", origin];
    directives['style-src'] = ["'self'", "'unsafe-inline'", origin];
    directives['connect-src'] = ["'self'", origin, wsOrigin];
  }

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
