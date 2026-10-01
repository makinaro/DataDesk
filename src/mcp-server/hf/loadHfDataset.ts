import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { z } from 'zod';
import { ColumnInfoSchema, DatasetNameSchema, DatasetFormatSchema } from '../../shared/datasets';
import { DEFAULT_HF_REVISION, defaultHfDatasetName, type LoadHfDatasetArgs } from '../../shared/hf';
import type { DatasetDb } from '../db/datasetDb';
import { registerDataset } from '../datasets';
import type { ImportPolicy } from '../fileAccess';

/** A failure the model (and user) can act on: gated, not found, too large, … */
export class HfDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HfDownloadError';
  }
}

export interface HfDownloadConfig {
  /** The user's HF token (gated datasets they accepted). Sent to huggingface.co only. */
  token: string | undefined;
  /** userData/datasets/hf: the only place downloads go, and the only registration exception. */
  hfDir: string;
  /** Hard cap on the bytes written for one file (D-020). */
  maxBytes: number;
  timeoutMs: number;
  /** Injected: tests pass a fake (no network). */
  fetch: typeof fetch;
}

export const LoadedHfDatasetSchema = z.object({
  name: DatasetNameSchema,
  format: DatasetFormatSchema,
  path: z.string(),
  rowCount: z.number().int().nonnegative().nullable(),
  columns: z.array(ColumnInfoSchema),
  repoId: z.string(),
  revision: z.string(),
  file: z.string(),
  downloadedBytes: z.number().int().nonnegative(),
});
export type LoadedHfDataset = z.infer<typeof LoadedHfDatasetSchema>;

const HUB = 'https://huggingface.co';
const MAX_REDIRECTS = 5;

export function resolveUrl(repoId: string, revision: string, file: string): string {
  const encodedPath = file.split('/').map(encodeURIComponent).join('/');
  return `${HUB}/datasets/${repoId}/resolve/${encodeURIComponent(revision)}/${encodedPath}`;
}

/**
 * Downloads follow redirects to HF's CDN only (huggingface.co, *.huggingface.co, *.hf.co; the CDN
 * hosts are observed, not documented), over https.
 */
function isHfHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === 'https:' &&
    (host === 'huggingface.co' || host.endsWith('.huggingface.co') || host.endsWith('.hf.co'))
  );
}

/** userData/datasets/hf/<owner>/<repo>/<revision>/<path…>, each segment made file-system safe. */
export function localPathFor(
  hfDir: string,
  repoId: string,
  revision: string,
  file: string,
): string {
  const safe = (segment: string) => segment.replace(/[^A-Za-z0-9._-]/g, '_');
  const [owner = '', repo = ''] = repoId.split('/');
  const target = join(
    hfDir,
    safe(owner),
    safe(repo),
    safe(revision.replaceAll('/', '_')),
    ...file.split('/').map(safe),
  );
  const rel = relative(hfDir, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new HfDownloadError('Invalid file path.');
  }
  return target;
}

const mb = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

function tooLarge(bytes: number | undefined, maxBytes: number): HfDownloadError {
  return new HfDownloadError(
    `The file is larger than the ${mb(maxBytes)} download limit${bytes === undefined ? '' : ` (${mb(bytes)})`}. ` +
      'Pick a smaller file or split (hf_fs ls shows sizes), or the Parquet conversion (revision refs/convert/parquet).',
  );
}

function httpError(response: Response, input: { repoId: string; file: string }): HfDownloadError {
  const code = response.headers.get('x-error-code');
  if (code === 'GatedRepo') {
    return new HfDownloadError(
      `${input.repoId} is gated: the user must accept its terms on huggingface.co (with the account of their token) first.`,
    );
  }
  if (code === 'EntryNotFound' || (response.status === 404 && code !== 'RepoNotFound')) {
    return new HfDownloadError(
      `${input.file} was not found in ${input.repoId} at that revision. List the files with hf_fs.`,
    );
  }
  if (code === 'RepoNotFound' || response.status === 401 || response.status === 404) {
    return new HfDownloadError(`Dataset ${input.repoId} was not found, or it is private.`);
  }
  if (response.status === 403) {
    return new HfDownloadError(`Hugging Face refused access to ${input.repoId}.`);
  }
  return new HfDownloadError(`Hugging Face returned HTTP ${String(response.status)}.`);
}

/** A declared size (header) that is a valid number, else undefined. */
function declaredSize(response: Response, header: string): number | undefined {
  const value = Number(response.headers.get(header) ?? NaN);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function openDownload(
  config: HfDownloadConfig,
  input: { repoId: string; revision: string; file: string },
  signal: AbortSignal,
): Promise<Response> {
  let url = new URL(resolveUrl(input.repoId, input.revision, input.file));
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isHfHost(url)) {
      throw new HfDownloadError(`Refusing to download from ${url.host}: not a Hugging Face host.`);
    }
    // Redirects are followed by hand so the token is sent to huggingface.co and nowhere else.
    const headers: Record<string, string> = {};
    if (config.token && url.hostname.toLowerCase() === 'huggingface.co') {
      headers.Authorization = `Bearer ${config.token}`;
    }
    const response = await config.fetch(url, { headers, redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const linked = declaredSize(response, 'x-linked-size');
      if (linked !== undefined && linked > config.maxBytes) throw tooLarge(linked, config.maxBytes);
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new HfDownloadError('Hugging Face sent a redirect without a target.');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw httpError(response, input);
    }
    return response;
  }
  throw new HfDownloadError('Too many redirects.');
}

/** Streams the body to `target`, never writing more than maxBytes. Atomic: temp file + rename. */
async function saveCapped(
  response: Response,
  target: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<number> {
  const declared = declaredSize(response, 'content-length');
  if (declared !== undefined && declared > maxBytes) {
    await response.body?.cancel();
    throw tooLarge(declared, maxBytes);
  }
  if (!response.body) throw new HfDownloadError('Hugging Face sent an empty response.');
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.part`;
  const file = await open(temp, 'wx');
  let written = 0;
  try {
    // Node types the body as ReadableStream<any>; fetch bodies are always bytes.
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    // A stalled read must still end on abort. Cancelling makes it report "done", so the signal
    // is checked again below: an aborted download is never kept as if it were complete.
    const onAbort = () => void reader.cancel().catch(() => undefined);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        // Enforced on the bytes actually received, whatever the headers claimed.
        if (written + value.byteLength > maxBytes) throw tooLarge(undefined, maxBytes);
        await file.write(value);
        written += value.byteLength;
      }
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', onAbort);
      await reader.cancel().catch(() => undefined);
    }
    await file.close();
    await rename(temp, target);
    return written;
  } catch (error) {
    await file.close().catch(() => undefined);
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * load_hf_dataset: download one file of a public (or accepted gated) HF dataset into the HF
 * folder, then register it like any local file. The user approved this exact input (main).
 */
export async function loadHfDataset(
  deps: { db: DatasetDb; policy: ImportPolicy; config: HfDownloadConfig },
  args: LoadHfDatasetArgs,
  signal?: AbortSignal,
): Promise<LoadedHfDataset> {
  const { db, policy, config } = deps;
  const revision = args.revision ?? DEFAULT_HF_REVISION;
  const input = { repoId: args.repo_id, revision, file: args.path };
  const target = localPathFor(config.hfDir, input.repoId, revision, input.file);
  const maxBytes = Math.min(config.maxBytes, policy.maxFileBytes);
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let downloadedBytes: number;
  try {
    const response = await openDownload({ ...config, maxBytes }, input, combined);
    downloadedBytes = await saveCapped(response, target, maxBytes, combined);
  } catch (error) {
    if (error instanceof HfDownloadError) throw error;
    if (timeout.aborted) {
      throw new HfDownloadError(
        `The download took longer than ${String(config.timeoutMs / 60_000)} minutes.`,
      );
    }
    if (signal?.aborted) throw new HfDownloadError('The download was cancelled.');
    const message = error instanceof Error ? error.message : String(error);
    throw new HfDownloadError(
      `Could not download from Hugging Face: ${message.split('\n')[0] ?? ''}`,
    );
  }
  const { entry, columns, rowCount } = await registerDataset(
    db,
    { ...policy, allowDirs: [config.hfDir] },
    { path: target, name: args.name ?? defaultHfDatasetName(input.repoId, input.file) },
  );
  return {
    name: entry.name,
    format: entry.format,
    path: entry.path,
    rowCount,
    columns,
    repoId: input.repoId,
    revision,
    file: input.file,
    downloadedBytes,
  };
}
