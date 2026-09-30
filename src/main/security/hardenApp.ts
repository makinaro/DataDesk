import { app, session, shell } from 'electron';
import { isAllowedExternalUrl, isAppOrigin } from './navigation';

/**
 * App-wide guards, applied to every WebContents we ever create:
 * - deny all permission requests (camera, notifications, geolocation…)
 * - block in-app navigation away from our renderer origin
 * - never open new windows; allowlisted https links go to the default browser
 * - forbid <webview>
 */
export function hardenApp(rendererOrigin: string): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAppOrigin(url, rendererOrigin)) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!isAppOrigin(url, rendererOrigin)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}

/** Dev only: the Vite dev server is plain http, so we can attach the CSP as a response header. */
export function applyDevCspHeader(csp: string): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}
