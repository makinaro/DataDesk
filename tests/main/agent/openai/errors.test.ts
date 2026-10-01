import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { explainOpenAIError } from '../../../../src/main/agent/openai/errors';

describe('explainOpenAIError', () => {
  it('never repeats the raw API message (it can echo a masked key)', () => {
    const raw = new OpenAI.AuthenticationError(
      401,
      { message: 'Incorrect API key provided: sk-test-****6789' },
      'Incorrect API key provided: sk-test-****6789',
      new Headers(),
    );
    expect(explainOpenAIError(raw)).toBe(
      'OpenAI rejected the API key (401). Check it in Settings.',
    );
    expect(explainOpenAIError(new Error('wrapped', { cause: raw }))).toMatch(/401/);
    expect(
      explainOpenAIError(new OpenAI.RateLimitError(429, undefined, 'quota', new Headers())),
    ).toMatch(/429/);
    expect(explainOpenAIError(new Error('first line\nsecond'))).toBe('first line');
  });

  it('fails closed for API errors from another copy of the SDK (no instanceof match)', () => {
    const foreign = Object.assign(new Error('Incorrect API key provided: sk-…6789'), {
      status: 401,
    });
    expect(explainOpenAIError(foreign)).toBe(
      'OpenAI rejected the API key (401). Check it in Settings.',
    );
    const other = Object.assign(new Error('raw upstream detail'), { status: 500 });
    expect(explainOpenAIError(other)).toBe('OpenAI request failed (500).');
  });

  it('reports connection problems without a status', () => {
    expect(
      explainOpenAIError(new OpenAI.APIConnectionError({ message: 'socket hang up' })),
    ).toMatch(/Could not reach OpenAI/);
  });
});
