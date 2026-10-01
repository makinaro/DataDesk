import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, session } from 'electron';

const PRINT_PARTITION = 'datadesk-print';

/**
 * Prints an HTML document to PDF in a hidden, locked-down window:
 * JavaScript off, sandboxed, its own session, and every request except the one temp file (and
 * inline data: images) cancelled. A temp file is used instead of a data: URL to avoid URL
 * length limits.
 */
export async function printHtmlToPdf(html: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'datadesk-print-'));
  const file = join(dir, 'report.html');
  await writeFile(file, html, 'utf8');
  const fileUrl = pathToFileURL(file).toString();

  const printSession = session.fromPartition(PRINT_PARTITION);
  printSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url === fileUrl || details.url.startsWith('data:image/');
    callback({ cancel: !allowed });
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: printSession,
      webviewTag: false,
    },
  });
  try {
    await win.loadFile(file);
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      generateDocumentOutline: true,
    });
  } finally {
    win.destroy();
    printSession.webRequest.onBeforeRequest(null);
    await rm(dir, { recursive: true, force: true });
  }
}
