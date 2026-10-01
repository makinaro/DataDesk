import { z } from 'zod';
import { DatasetNameSchema } from '../../shared/datasets';
import {
  DEFAULT_HF_REVISION,
  defaultHfDatasetName,
  HF_MAX_DOWNLOAD_BYTES,
  LoadHfDatasetInput,
} from '../../shared/hf';
import { datadeskTool } from './claude/datadeskTools';

/**
 * The tools that always ask the user (D-010, D-020), and what each asks. Provider-neutral: the
 * Claude orchestrator asks from `canUseTool`, the OpenAI one from inside the tool (D-021).
 */

const RegisterInput = z.object({
  path: z.string().min(1).max(4096),
  name: DatasetNameSchema.optional(),
  sheet: z.string().max(100).optional(),
});

export interface ApprovalQuestion {
  title: string;
  lines: string[];
  /** Exactly what the tool receives if the user approves (validated and stripped). */
  input: Record<string, unknown>;
  /** Told to the analyst on a denial. */
  declined: string;
}

/** Anything but the main branch is pointed out: users rarely read the revision line. */
function revisionNote(revision: string): string {
  if (revision === DEFAULT_HF_REVISION) return revision;
  if (revision === 'refs/convert/parquet') return `${revision} (the Hub's automatic Parquet copy)`;
  return `${revision} (NOT the main branch: only allow it if you expected this version)`;
}

const mb = (bytes: number) => `${String(Math.round(bytes / 1024 ** 2))} MB`;

/**
 * How to validate each approval tool's input and what to show. A question is undefined for
 * input the tool would reject. load_hf_dataset is only registered with an HF token; without one
 * the tool doesn't exist.
 */
const APPROVALS: Record<string, ((input: unknown) => ApprovalQuestion | undefined) | undefined> = {
  [datadeskTool('register_dataset')]: (input) => {
    const parsed = RegisterInput.safeParse(input);
    if (!parsed.success) return undefined;
    const { path, name, sheet } = parsed.data;
    return {
      title: 'Add a dataset?',
      lines: [
        'The analyst wants to register this file so it can query it:',
        '',
        `File:  ${path}`,
        ...(name ? [`Name:  ${name} (replaces any dataset with this name)`] : []),
        ...(sheet ? [`Sheet: ${sheet}`] : []),
      ],
      input: parsed.data,
      declined: 'The user declined to add this file.',
    };
  },
  [datadeskTool('load_hf_dataset')]: (input) => {
    // Strict: an unknown key means the model sent something the dialog wouldn't show.
    const parsed = LoadHfDatasetInput.strict().safeParse(input);
    if (!parsed.success) return undefined;
    const { repo_id, path, revision, name } = parsed.data;
    return {
      title: 'Download a dataset from Hugging Face?',
      lines: [
        'The analyst wants to download this file from the Hugging Face Hub and add it as a dataset:',
        '',
        `Dataset:  ${repo_id}`,
        `          https://huggingface.co/datasets/${repo_id}`,
        `File:     ${path}`,
        `Revision: ${revisionNote(revision ?? DEFAULT_HF_REVISION)}`,
        `Name:     ${name ?? defaultHfDatasetName(repo_id, path)} (replaces any dataset with this name)`,
        '',
        `It is saved in DataDesk's data folder. Files over ${mb(HF_MAX_DOWNLOAD_BYTES)} are refused.`,
        'Anyone can publish on the Hub: the contents are treated as untrusted data.',
      ],
      input: parsed.data,
      declined: 'The user declined to download this dataset.',
    };
  },
};

/** Whether this tool always asks the user first. */
export function needsApproval(toolName: string): boolean {
  // hasOwn: a plain object would also resolve prototype keys such as "constructor".
  return Object.hasOwn(APPROVALS, toolName);
}

/** The question for an approval tool call, or undefined if the tool or its input is invalid. */
export function approvalQuestion(toolName: string, input: unknown): ApprovalQuestion | undefined {
  const ask = Object.hasOwn(APPROVALS, toolName) ? APPROVALS[toolName] : undefined;
  return ask?.(input);
}
