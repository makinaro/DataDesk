import { z } from 'zod';
import { DatasetNameSchema } from './datasets';

/**
 * load_hf_dataset's input, shared by datadesk-mcp (the tool) and main (the approval dialog), so
 * the user approves exactly what the tool will download and the dataset name it will replace.
 */

/** File types load_hf_dataset accepts (Excel is left out: Hub datasets are rarely .xlsx). */
export const HF_FILE_EXTENSIONS = ['.csv', '.tsv', '.parquet', '.json', '.jsonl', '.ndjson'];

const hasControlChar = (value: string) => {
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) < 0x20) return true;
  return false;
};

const noDotSegments = (value: string) =>
  value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

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
  .refine(noDotSegments, 'Invalid revision.');

export const HfFilePathSchema = z
  .string()
  .min(1)
  .max(500)
  // A path inside the repo: forward slashes, no drive letters or Windows-invalid characters.
  .refine(
    (path) => !/[\\:*?"<>|]/.test(path) && !hasControlChar(path),
    'Use the file path inside the repo, e.g. data/train.csv.',
  )
  .refine(noDotSegments, 'Use a relative path inside the repo, without . or .. segments.')
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
