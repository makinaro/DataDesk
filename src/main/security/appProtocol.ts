import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';

/**
 * The production renderer is served from app://datadesk/ instead of file://.
 * Why: file:// pages get extra privileges (e.g. reading other local files) and Electron's
 * webRequest hooks don't run for file://, so a CSP response header could never be applied.
 */
export const APP_SCHEME = 'app';
export const APP_HOST = 'datadesk';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

/** Must be called before app 'ready'. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/**
 * Maps an app:// URL to a file inside `rootDir`. Returns null for anything that would escape
 * the root (path traversal), a foreign host, or a non-app scheme.
 */
export function resolveAppPath(rootDir: string, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const root = resolve(rootDir);
  const target = resolve(root, `.${pathname}`);
  const rel = relative(root, target);
  if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) return null;
  return target;
}

/** Serves files from `rootDir` on app:// and attaches the CSP header to every response. */
export function handleAppProtocol(rootDir: string, csp: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveAppPath(rootDir, request.url);
    if (!filePath) return new Response('Not found', { status: 404 });

    const fileResponse = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(fileResponse.headers);
    headers.set('Content-Security-Policy', csp);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(fileResponse.body, { status: fileResponse.status, headers });
  });
}
