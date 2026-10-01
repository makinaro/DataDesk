import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, session } from 'electron';

const PRINT_PARTITION = 'datadesk-print';

/** Locked-down preferences for the print window (exported for tests). */
export const PRINT_WEB_PREFERENCES = {
  javascript: false,
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true,
  webviewTag: false,
} as const;

/** The print session's request filter: only the one temp file and inline data: images. */
export function isAllowedPrintRequest(url: string, fileUrl: string): boolean {
  return url === fileUrl || url.startsWith('data:image/');
}

// A session holds a single onBeforeRequest listener, so overlapping exports would replace (and
// then clear) each other's filter. Run them one at a time.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Prints an HTML document to PDF in a hidden, locked-down window: JavaScript off, sandboxed,
 * its own session, and every request except the temp file (and inline data: images) cancelled.
 * A temp file is used instead of a data: URL to avoid URL length limits.
 */
export function printHtmlToPdf(html: string): Promise<Buffer> {
  const run = queue.then(() => printNow(html));
  queue = run.catch(() => undefined);
  return run;
}

async function printNow(html: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'datadesk-print-'));
  const printSession = session.fromPartition(PRINT_PARTITION);
  let win: BrowserWindow | undefined;
  try {
    const file = join(dir, 'report.html');
    await writeFile(file, html, 'utf8');
    const fileUrl = pathToFileURL(file).toString();
    printSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !isAllowedPrintRequest(details.url, fileUrl) });
    });
    win = new BrowserWindow({
      show: false,
      webPreferences: { ...PRINT_WEB_PREFERENCES, session: printSession },
    });
    await win.loadFile(file);
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      generateDocumentOutline: true,
    });
  } finally {
    win?.destroy();
    printSession.webRequest.onBeforeRequest(null);
    await rm(dir, { recursive: true, force: true });
  }
}
