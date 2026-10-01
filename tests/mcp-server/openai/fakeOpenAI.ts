import { vi } from 'vitest';
import type {
  Critique,
  CritiqueRequest,
  OpenAIClient,
} from '../../../src/mcp-server/openai/client';

/** Words the fake "embedding" knows; each becomes one vector dimension (bag of words). */
const VOCAB = [
  'region',
  'south',
  'east',
  'date',
  'order',
  'price',
  'unit',
  'units',
  'product',
  'discount',
  'event',
  'kind',
  'value',
  'id',
  'money',
  'revenue',
];

export function fakeVector(text: string): number[] {
  const words = text.toLowerCase().split(/[^a-z]+/);
  return VOCAB.map((w) => words.filter((x) => x === w || x === `${w}s`).length);
}

export const GOOD_CRITIQUE: Critique = {
  verdict: 'questionable',
  summary: 'The query sums units but the question asks for revenue.',
  issues: [
    {
      severity: 'high',
      issue: 'Units are not revenue.',
      suggestion: 'Multiply units by unit_price and apply the discount.',
    },
  ],
  suggested_sql: 'SELECT region, SUM(units * unit_price * (1 - discount)) FROM sales GROUP BY 1',
};

/** A deterministic stand-in for the OpenAI adapter that records what would have been sent. */
export function createFakeOpenAI(critique: Critique = GOOD_CRITIQUE) {
  const embedded: string[][] = [];
  const critiques: CritiqueRequest[] = [];
  const client = {
    embed: vi.fn((texts: readonly string[]) => {
      embedded.push([...texts]);
      return Promise.resolve(texts.map(fakeVector));
    }),
    critique: vi.fn((request: CritiqueRequest) => {
      critiques.push(request);
      return Promise.resolve(critique);
    }),
  } satisfies OpenAIClient;
  return Object.assign(client, { embedded, critiques });
}
