import { z } from 'zod';
import { DatasetNameSchema } from './datasets';

/**
 * load_hf_dataset's input, shared by datadesk-mcp (the tool) and main (the approval dialog), so
 * the user approves exactly what the tool will download and the dataset name it will replace.
 */

/** File types load_hf_dataset accepts (Excel is left out: Hub datasets are rarely .xlsx). */
export const HF_FILE_EXTENSIONS = ['.csv', '.tsv', '.parquet', '.json', '.jsonl', '.ndjson'];

/**
 * Characters that are invalid in Windows file names, or that would make the approval dialog lie
 * about what it shows: C0/C1 controls, DEL, bidi overrides and isolates, line/paragraph
 * separators.
 */
const isUnsafeChar = (code: number) =>
  code < 0x20 ||
  (code >= 0x7f && code <= 0x9f) ||
  code === 0x200e ||
  code === 0x200f ||
  (code >= 0x2028 && code <= 0x202e) ||
  (code >= 0x2066 && code <= 0x2069);

const hasUnsafeChar = (value: string) => {
  for (let i = 0; i < value.length; i++) if (isUnsafeChar(value.charCodeAt(i))) return true;
  return false;
};

const noDotSegments = (value: string) =>
  value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

/** Windows strips trailing dots/spaces and reserves device names like NUL or COM1.csv. */
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const windowsSafeSegments = (value: string) =>
  value
    .split('/')
    .every(
      (segment) => segment.length <= 255 && !/[. ]$/.test(segment) && !WINDOWS_DEVICE.test(segment),
    );

export const HfRepoIdSchema = z
  .string()
  .max(200)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/,
    'Use the dataset id as owner/name, e.g. scikit-learn/iris.',
  )
  .refine(noDotSegments, 'Invalid dataset id.');

export const HfRevisionSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._/-]+$/, 'Use a branch, tag or commit id.')
  .refine(noDotSegments, 'Invalid revision.')
  // Anyone can open a pull request on any Hub repo, so its files aren't the publisher's.
  .refine(
    (revision) => !revision.toLowerCase().startsWith('refs/pr/'),
    'Pull-request revisions (refs/pr/…) can be written by anyone and are not supported.',
  );

export const HfFilePathSchema = z
  .string()
  .min(1)
  .max(500)
  // A path inside the repo: forward slashes, no drive letters or Windows-invalid characters.
  .refine(
    (path) => !/[\\:*?"<>|]/.test(path) && !hasUnsafeChar(path),
    'Use the file path inside the repo, e.g. data/train.csv.',
  )
  .refine(noDotSegments, 'Use a relative path inside the repo, without . or .. segments.')
  .refine(windowsSafeSegments, 'This file name cannot be saved on Windows.')
  .refine(
    (path) => HF_FILE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext)),
    `Only ${HF_FILE_EXTENSIONS.join(', ')} files can be loaded.`,
  );

export const LoadHfDatasetInput = z.object({
  repo_id: HfRepoIdSchema.describe('Dataset id on the Hub, owner/name.'),
  path: HfFilePathSchema.describe('One file inside the dataset repo, e.g. data/train.csv.'),
  revision: HfRevisionSchema.optional().describe(
    'Branch, tag or commit (default main). Use refs/convert/parquet for the Hub’s Parquet conversion.',
  ),
  name: DatasetNameSchema.optional().describe(
    'Dataset/view name. Defaults to hf_<repo>_<file>. Re-using a name replaces that dataset.',
  ),
});
export type LoadHfDatasetArgs = z.infer<typeof LoadHfDatasetInput>;

export const DEFAULT_HF_REVISION = 'main';

/** Default per-file download cap (datadesk-mcp's DATADESK_HF_MAX_BYTES; shown in the approval). */
export const HF_MAX_DOWNLOAD_BYTES = 500 * 1024 ** 2;

/** hf_<repo>_<file stem>; the hf_ prefix keeps it apart from the user's local datasets. */
export function defaultHfDatasetName(repoId: string, path: string): string {
  const repo = repoId.split('/')[1] ?? repoId;
  const stem = (path.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
  const parts = stem.toLowerCase() === repo.toLowerCase() ? [repo] : [repo, stem];
  return ['hf', ...parts]
    .join('_')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 63)
    .replace(/_+$/, '');
}
