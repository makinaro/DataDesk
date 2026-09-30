import { lstat, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, normalize, parse, relative, sep } from 'node:path';
import type { DatasetFormat } from '../shared/datasets';

export class ImportPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportPathError';
  }
}

const EXTENSIONS: Record<string, DatasetFormat> = {
  '.csv': 'csv',
  '.tsv': 'csv',
  '.parquet': 'parquet',
  '.json': 'json',
  '.jsonl': 'json',
  '.ndjson': 'json',
  '.xlsx': 'xlsx',
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSIONS);

export interface ImportPolicy {
  /** Directories that may never be imported from (e.g. DataDesk's own userData). */
  denyDirs: string[];
  maxFileBytes: number;
  platform?: NodeJS.Platform;
}

export interface ValidatedFile {
  path: string;
  format: DatasetFormat;
  sizeBytes: number;
}

function samePathCase(platform: NodeJS.Platform): (p: string) => string {
  // Windows (and default macOS) file systems are case-insensitive.
  return platform === 'linux' ? (p) => p : (p) => p.toLowerCase();
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Decides whether a file may become a dataset. Registration grants the analyst read access to
 * that exact file, so this is a security boundary:
 * - absolute local paths only (no UNC / network shares: on Windows they can leak credentials)
 * - no symlinks or junctions (the checked path must be the real path)
 * - a regular file with a known data extension, under the size cap
 * - never inside a denied directory
 */
export async function validateImportPath(
  rawPath: string,
  policy: ImportPolicy,
): Promise<ValidatedFile> {
  const platform = policy.platform ?? process.platform;
  const fold = samePathCase(platform);

  if (!isAbsolute(rawPath)) throw new ImportPathError('Path must be absolute.');
  if (/^[\\/]{2}/.test(rawPath)) {
    throw new ImportPathError('Network paths (\\\\server\\share) are not supported.');
  }

  const requested = normalize(rawPath);
  const format = EXTENSIONS[extname(requested).toLowerCase()];
  if (!format) {
    throw new ImportPathError(
      `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}.`,
    );
  }

  // DuckDB's read_* functions treat these as glob patterns, which could match other files.
  if (/[*?[\]]/.test(basename(requested))) {
    throw new ImportPathError('File names containing *, ? or [ ] are not supported. Rename it.');
  }

  try {
    await lstat(requested);
  } catch {
    throw new ImportPathError('File not found.');
  }
  // Walk every component rather than comparing against realpath(): realpath also expands
  // Windows 8.3 short names (C:\PROGRA~1 → C:\Program Files), which are not links.
  await assertNoLinks(requested);

  const real = await realpath(requested);
  if (/^[\\/]{2}/.test(real)) {
    // A mapped drive letter that points at a network share.
    throw new ImportPathError('Network drives are not supported. Copy the file locally first.');
  }

  const info = await stat(real);
  if (!info.isFile()) throw new ImportPathError('Not a regular file.');
  if (info.size > policy.maxFileBytes) {
    throw new ImportPathError(
      `File is too large (${String(info.size)} bytes; limit ${String(policy.maxFileBytes)}).`,
    );
  }

  for (const denied of policy.denyDirs) {
    let deniedReal = normalize(denied);
    try {
      deniedReal = await realpath(denied);
    } catch {
      // A deny dir that doesn't exist yet still blocks its path.
    }
    if (isInside(fold(real), fold(deniedReal))) {
      throw new ImportPathError('This location is not allowed.');
    }
  }

  return { path: real, format, sizeBytes: info.size };
}

/** Rejects the path if the file or any parent directory is a symlink or junction. */
async function assertNoLinks(filePath: string): Promise<void> {
  const { root } = parse(filePath);
  const parts = filePath
    .slice(root.length)
    .split(/[\\/]+/)
    .filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    // On Windows, Node reports directory junctions as symbolic links too.
    if ((await lstat(current)).isSymbolicLink()) {
      throw new ImportPathError(
        current === filePath
          ? 'Symbolic links are not supported.'
          : 'Paths through links or junctions are not supported.',
      );
    }
  }
}
