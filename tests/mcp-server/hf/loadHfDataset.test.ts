import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerDataset } from '../../../src/mcp-server/datasets';
import {
  HfDownloadError,
  loadHfDataset,
  localPathFor,
  resolveUrl,
  type HfDownloadConfig,
} from '../../../src/mcp-server/hf/loadHfDataset';
import { createWorkspace } from '../fixtures';
import { endlessBody, fakeHub, stallingBody, type FakeRoute } from './fakeHub';

const TOKEN = 'hf_secret_test_token_0123';
const CSV = 'sepal_length,species\n5.1,setosa\n6.2,virginica\n5.9,versicolor\n';
const URL_IRIS = 'https://huggingface.co/datasets/scikit-learn/iris/resolve/main/Iris.csv';
const CDN = 'https://cas-bridge.xethub.hf.co/xet-bridge-us/abc?X-Amz-Signature=x';

let ws: ReturnType<typeof createWorkspace>;
let userData: string;
let hfDir: string;
beforeEach(() => {
  ws = createWorkspace();
  userData = join(ws.root, 'userData');
  hfDir = join(userData, 'datasets', 'hf');
  mkdirSync(userData, { recursive: true });
});
afterEach(() => {
  ws.cleanup();
});

function load(
  routes: Record<string, FakeRoute | (() => FakeRoute)>,
  args: { repo_id?: string; path?: string; revision?: string; name?: string } = {},
  overrides: Partial<HfDownloadConfig> = {},
  signal?: AbortSignal,
  maxFileBytes = 10_000_000,
) {
  const hub = fakeHub(routes);
  const config: HfDownloadConfig = {
    token: TOKEN,
    hfDir,
    maxBytes: 1_000,
    timeoutMs: 5_000,
    fetch: hub.fetch,
    ...overrides,
  };
  const policy = { denyDirs: [userData], maxFileBytes };
  const promise = loadHfDataset(
    { db: ws.db, policy, config },
    { repo_id: 'scikit-learn/iris', path: 'Iris.csv', ...args },
    signal,
  );
  return { promise, hub };
}

/** Every file left in the HF folder (to prove nothing partial survives). */
function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

describe('loadHfDataset', () => {
  it('follows the CDN redirect, saves under the HF folder and registers a queryable dataset', async () => {
    expect(resolveUrl('scikit-learn/iris', 'main', 'Iris.csv')).toBe(URL_IRIS);
    const { promise } = load({
      [URL_IRIS]: { status: 302, headers: { location: CDN, 'x-linked-size': '64' } },
      [CDN]: { status: 200, headers: { 'content-length': String(CSV.length) }, body: CSV },
    });
    const loaded = await promise;
    expect(loaded).toMatchObject({
      name: 'hf_iris',
      format: 'csv',
      rowCount: 3,
      repoId: 'scikit-learn/iris',
      revision: 'main',
      file: 'Iris.csv',
      downloadedBytes: CSV.length,
    });
    expect(loaded.path).toBe(join(hfDir, 'scikit-learn', 'iris', 'main', 'Iris.csv'));
    expect(readFileSync(loaded.path, 'utf8')).toBe(CSV);
    const result = await ws.db.query('SELECT count(*) AS n FROM hf_iris', 10);
    expect(result.rows).toEqual([[3]]);
    expect(filesIn(hfDir)).toEqual(['Iris.csv']);
  });

  it('sends the token to huggingface.co only, never to the CDN, and follows redirects by hand', async () => {
    const { promise, hub } = load({
      [URL_IRIS]: { status: 302, headers: { location: CDN } },
      [CDN]: { status: 200, body: CSV },
    });
    await promise;
    expect(hub.calls).toEqual([
      { url: URL_IRIS, auth: `Bearer ${TOKEN}`, redirect: 'manual' },
      { url: CDN, auth: null, redirect: 'manual' },
    ]);
  });

  it('works without a token (public datasets) and resolves relative redirects', async () => {
    const cache =
      'https://huggingface.co/api/resolve-cache/datasets/scikit-learn/iris/abc/Iris.csv';
    const { promise, hub } = load(
      {
        [URL_IRIS]: {
          status: 307,
          headers: { location: '/api/resolve-cache/datasets/scikit-learn/iris/abc/Iris.csv' },
        },
        [cache]: { status: 200, body: CSV },
      },
      {},
      { token: undefined },
    );
    await expect(promise).resolves.toMatchObject({ rowCount: 3 });
    expect(hub.calls.map((c) => c.auth)).toEqual([null, null]);
  });

  it('places revisions and nested paths in safe folders, and uses the given name', async () => {
    const url =
      'https://huggingface.co/datasets/scikit-learn/iris/resolve/refs%2Fconvert%2Fparquet/default/train/0000.csv';
    const { promise } = load(
      { [url]: { status: 200, body: CSV } },
      { revision: 'refs/convert/parquet', path: 'default/train/0000.csv', name: 'iris_train' },
    );
    const loaded = await promise;
    expect(loaded.name).toBe('iris_train');
    expect(loaded.path).toBe(
      join(hfDir, 'scikit-learn', 'iris', 'refs_convert_parquet', 'default', 'train', '0000.csv'),
    );
  });

  describe('download cap', () => {
    it('refuses before downloading when the redirect declares a larger file (X-Linked-Size)', async () => {
      const { promise, hub } = load({
        [URL_IRIS]: { status: 302, headers: { location: CDN, 'x-linked-size': '5000' } },
        [CDN]: { status: 200, body: CSV },
      });
      await expect(promise).rejects.toThrow(/larger than the 0\.0 MB download limit/);
      expect(hub.calls).toHaveLength(1);
      expect(filesIn(hfDir)).toEqual([]);
    });

    it('refuses when Content-Length is over the cap', async () => {
      const { promise } = load({
        [URL_IRIS]: { status: 200, headers: { 'content-length': '5000' }, body: 'x'.repeat(5000) },
      });
      await expect(promise).rejects.toBeInstanceOf(HfDownloadError);
      expect(filesIn(hfDir)).toEqual([]);
    });

    it('stops a server that sends more than it declared, and leaves no partial file', async () => {
      const { promise } = load({
        [URL_IRIS]: {
          status: 200,
          headers: { 'content-length': '10' },
          body: endlessBody(new Uint8Array(256)),
        },
      });
      await expect(promise).rejects.toThrow(/download limit/);
      expect(filesIn(hfDir)).toEqual([]);
    });

    it('uses the smaller of its own cap and the import size cap', async () => {
      const { promise } = load(
        { [URL_IRIS]: { status: 200, body: CSV } },
        {},
        { maxBytes: 10_000 },
        undefined,
        20,
      );
      await expect(promise).rejects.toThrow(/download limit/);
      expect(filesIn(hfDir)).toEqual([]);
    });
  });

  it('a cancelled download (stalled body) leaves nothing behind', async () => {
    const controller = new AbortController();
    const { promise } = load(
      { [URL_IRIS]: { status: 200, body: stallingBody(new TextEncoder().encode('a,b\n')) } },
      {},
      {},
      controller.signal,
    );
    setTimeout(() => {
      controller.abort();
    }, 30);
    await expect(promise).rejects.toThrow(/cancelled/);
    expect(filesIn(hfDir)).toEqual([]);
  });

  it('times out a stalled download', async () => {
    const { promise } = load(
      { [URL_IRIS]: { status: 200, body: stallingBody(new TextEncoder().encode('a,b\n')) } },
      {},
      { timeoutMs: 50 },
    );
    await expect(promise).rejects.toThrow(/took longer than/);
    expect(filesIn(hfDir)).toEqual([]);
  });

  it.each([
    [{ status: 401, headers: { 'x-error-code': 'GatedRepo' } }, /gated/],
    [
      { status: 404, headers: { 'x-error-code': 'EntryNotFound' } },
      /not found in scikit-learn\/iris.*hf_fs/,
    ],
    [{ status: 401, headers: { 'x-error-code': 'RepoNotFound' } }, /not found, or it is private/],
    [{ status: 403 }, /refused access/],
    [{ status: 500 }, /HTTP 500/],
  ])('explains HTTP errors: %j', async (route, message) => {
    const { promise } = load({ [URL_IRIS]: route });
    await expect(promise).rejects.toThrow(message);
  });

  it.each([
    'http://huggingface.co/x.csv',
    'https://evil.example/x.csv',
    'https://huggingface.co.evil.example/x.csv',
    'file:///C:/Windows/win.ini',
  ])('refuses to follow a redirect to %s', async (location) => {
    const { promise, hub } = load({ [URL_IRIS]: { status: 302, headers: { location } } });
    await expect(promise).rejects.toThrow(/not a Hugging Face host/);
    expect(hub.calls).toHaveLength(1);
  });

  it('gives up after too many redirects', async () => {
    const { promise } = load({ [URL_IRIS]: { status: 302, headers: { location: URL_IRIS } } });
    await expect(promise).rejects.toThrow(/Too many redirects/);
  });

  it('never puts the token in an error message', async () => {
    const { promise } = load({ [URL_IRIS]: { status: 500, body: TOKEN } });
    const error = await promise.catch((e: unknown) => e);
    expect(String(error)).not.toContain(TOKEN);
  });
});

describe('the registration exception (D-020)', () => {
  it('is used only by load_hf_dataset: register_dataset still refuses the HF folder', async () => {
    const { promise } = load({ [URL_IRIS]: { status: 200, body: CSV } });
    const loaded = await promise;
    await expect(
      registerDataset(
        ws.db,
        { denyDirs: [userData], maxFileBytes: 10_000_000 },
        { path: loaded.path },
      ),
    ).rejects.toThrow(/not allowed/);
  });

  it('keeps every path inside the HF folder', () => {
    expect(localPathFor(hfDir, 'a/b', 'main', 'x.csv')).toBe(
      join(hfDir, 'a', 'b', 'main', 'x.csv'),
    );
    // The input schema rejects .. segments first; the path builder refuses an escape on its own.
    expect(() => localPathFor(hfDir, 'a/b', 'main', '../../../../x.csv')).toThrow(HfDownloadError);
  });
});
