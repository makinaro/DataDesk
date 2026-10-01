import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Filter = (details: { url: string }, cb: (r: { cancel: boolean }) => void) => void;

const electron = vi.hoisted(() => {
  const state = {
    filter: null as Filter | null,
    windows: [] as {
      options: { show: boolean; webPreferences: Record<string, unknown> };
      file: string | null;
      destroyed: boolean;
    }[],
    loadFile: (_file: string): Promise<void> => Promise.resolve(),
    log: [] as string[],
  };
  const printSession = {
    webRequest: {
      onBeforeRequest: (filter: Filter | null) => {
        state.filter = filter;
        state.log.push(filter ? 'filter:on' : 'filter:off');
      },
    },
  };
  class BrowserWindow {
    private readonly record;
    webContents = {
      printToPDF: () => {
        state.log.push('print');
        return Promise.resolve(Buffer.from('%PDF-1.7'));
      },
    };
    constructor(options: { show: boolean; webPreferences: Record<string, unknown> }) {
      this.record = { options, file: null as string | null, destroyed: false };
      state.windows.push(this.record);
    }
    loadFile(file: string) {
      this.record.file = file;
      return state.loadFile(file);
    }
    destroy() {
      this.record.destroyed = true;
    }
  }
  return { state, BrowserWindow, session: { fromPartition: vi.fn(() => printSession) } };
});
vi.mock('electron', () => ({ BrowserWindow: electron.BrowserWindow, session: electron.session }));

const { printHtmlToPdf, isAllowedPrintRequest } =
  await import('../../../src/main/artifacts/printPdf');

beforeEach(() => {
  electron.state.windows.length = 0;
  electron.state.log.length = 0;
  electron.state.filter = null;
  electron.state.loadFile = () => Promise.resolve();
});

describe('printHtmlToPdf', () => {
  it('prints from a hidden, JS-off, sandboxed window in its own session', async () => {
    const pdf = await printHtmlToPdf('<p>hi</p>');
    expect(pdf.toString()).toBe('%PDF-1.7');
    expect(electron.session.fromPartition).toHaveBeenCalledWith('datadesk-print');
    const [win] = electron.state.windows;
    expect(win?.options.show).toBe(false);
    expect(win?.options.webPreferences).toMatchObject({
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    });
    expect(win?.options.webPreferences).not.toHaveProperty('preload');
    expect(win?.destroyed).toBe(true);
    expect(electron.state.filter).toBeNull(); // filter removed afterwards
    expect(existsSync(win?.file ?? '')).toBe(false); // temp file cleaned up
  });

  it('lets the print page load only its own file and inline images', async () => {
    let decisions: Record<string, boolean> = {};
    electron.state.loadFile = (file) => {
      const ask = (url: string) =>
        new Promise<boolean>((resolve) => {
          electron.state.filter?.({ url }, ({ cancel }) => {
            resolve(cancel);
          });
        });
      return (async () => {
        decisions = {
          ownFile: await ask(pathToFileURL(file).toString()),
          https: await ask('https://evil.example/x.png'),
          otherFile: await ask('file:///C:/Users/secret.txt'),
          dataImage: await ask('data:image/svg+xml;base64,PHN2Zy8+'),
          dataHtml: await ask('data:text/html,<script>x</script>'),
        };
      })();
    };
    await printHtmlToPdf('<p>x</p>');
    expect(decisions).toEqual({
      ownFile: false,
      https: true,
      otherFile: true,
      dataImage: false,
      dataHtml: true,
    });
  });

  it.runIf(process.platform === 'win32')(
    'matches its file whether Chromium requests ~ literally or percent-encoded (8.3 temp dirs on CI)',
    () => {
      const file = 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\datadesk-print-x\\report.html';
      for (const url of [
        'file:///C:/Users/RUNNER~1/AppData/Local/Temp/datadesk-print-x/report.html',
        'file:///C:/Users/RUNNER%7E1/AppData/Local/Temp/datadesk-print-x/report.html',
        'file:///c:/users/runner~1/appdata/local/temp/datadesk-print-x/report.html',
      ]) {
        expect(isAllowedPrintRequest(url, file), url).toBe(true);
      }
      for (const url of [
        'file:///C:/Users/RUNNER~1/AppData/Local/Temp/datadesk-print-x/other.html',
        'file:///C:/Users/RUNNER~1/AppData/Local/Temp/datadesk-print-x/../secret.txt',
        'https://evil.example/report.html',
        'file://evil-host/share/report.html',
      ]) {
        expect(isAllowedPrintRequest(url, file), url).toBe(false);
      }
    },
  );

  it('cleans up the window, filter and temp file when loading fails', async () => {
    electron.state.loadFile = () => Promise.reject(new Error('load failed'));
    await expect(printHtmlToPdf('<p>x</p>')).rejects.toThrow('load failed');
    const [win] = electron.state.windows;
    expect(win?.destroyed).toBe(true);
    expect(electron.state.filter).toBeNull();
    expect(existsSync(win?.file ?? '')).toBe(false);
  });

  it('runs overlapping exports one at a time, so they never share the session filter', async () => {
    let release: () => void = () => undefined;
    electron.state.loadFile = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const first = printHtmlToPdf('<p>1</p>');
    const second = printHtmlToPdf('<p>2</p>');
    await vi.waitFor(() => {
      expect(electron.state.windows).toHaveLength(1);
    });
    release();
    await vi.waitFor(() => {
      expect(electron.state.windows).toHaveLength(2);
    });
    release();
    await Promise.all([first, second]);
    expect(electron.state.log).toEqual([
      'filter:on',
      'print',
      'filter:off',
      'filter:on',
      'print',
      'filter:off',
    ]);
  });
});
