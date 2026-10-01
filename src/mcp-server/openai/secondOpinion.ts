import type { DatasetDb } from '../db/datasetDb';
import { z } from 'zod';
import { CritiqueSchema, type OpenAIClient } from './client';

/** Bounds on what goes to OpenAI for one critique. */
export const CRITIQUE_MAX_ROWS = 50;
const RESULT_MAX_CHARS = 8_000;

/** A compact, bounded text table of a query result. */
export function renderResult(result: {
  columns: { name: string }[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
}): string {
  // Escape newlines and the column separator, so a cell can't break the table or forge rows.
  const cell = (v: unknown) =>
    (v === null || v === undefined ? 'NULL' : typeof v === 'string' ? v : JSON.stringify(v))
      .replaceAll('\\', '\\\\')
      .replaceAll('\r', '\\r')
      .replaceAll('\n', '\\n')
      .replaceAll('|', '\\|');
  const lines = [
    result.columns.map((c) => c.name).join(' | '),
    ...result.rows.map((row) => row.map(cell).join(' | ')),
  ];
  let text = lines.join('\n');
  if (text.length > RESULT_MAX_CHARS) text = `${text.slice(0, RESULT_MAX_CHARS)}\n…(clipped)`;
  const note = result.truncated
    ? `(first ${String(result.rowCount)} rows shown; more rows exist)`
    : `(${String(result.rowCount)} rows)`;
  return `${text}\n${note}`;
}

export interface SecondOpinionInput {
  question: string;
  sql: string;
  answer?: string | undefined;
}

export const SecondOpinionResultSchema = CritiqueSchema.extend({
  rowsReviewed: z.number().int(),
  resultTruncated: z.boolean(),
});
export type SecondOpinionResult = z.infer<typeof SecondOpinionResultSchema>;

/**
 * Re-runs the SQL itself (same read-only guard, small row cap), so the critic sees the real
 * result rather than one the analyst describes, then asks a second model for a structured
 * critique.
 */
export async function secondOpinion(
  deps: { db: DatasetDb; openai: OpenAIClient },
  input: SecondOpinionInput,
  signal?: AbortSignal,
): Promise<SecondOpinionResult> {
  const result = await deps.db.query(input.sql, CRITIQUE_MAX_ROWS, signal);
  const critique = await deps.openai.critique(
    {
      question: input.question,
      sql: input.sql,
      result: renderResult(result),
      answer: input.answer,
    },
    signal,
  );
  return { ...critique, rowsReviewed: result.rowCount, resultTruncated: result.truncated };
}
