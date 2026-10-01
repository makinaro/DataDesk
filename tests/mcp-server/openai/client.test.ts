import { describe, expect, it } from 'vitest';
import {
  boundCritique,
  createOpenAIClient,
  CRITIC_MAX_OUTPUT_TOKENS,
  CRITIC_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  OpenAIUnavailableError,
} from '../../../src/mcp-server/openai/client';

const KEY = 'sk-test-not-a-real-key-123456';

interface Captured {
  url: string;
  body: Record<string, unknown>;
  auth: string | null;
}

/** A fetch stand-in: records requests and answers from `reply`. No network is touched. */
function fakeFetch(reply: (req: Captured) => { status: number; json: unknown }) {
  const requests: Captured[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers);
    const req: Captured = {
      url,
      body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >,
      auth: headers.get('authorization'),
    };
    requests.push(req);
    const { status, json } = reply(req);
    return Promise.resolve(
      new Response(JSON.stringify(json), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { fetch, requests };
}

function embeddingsReply(req: Captured) {
  const input = req.body.input as string[];
  // Reverse order on purpose: the adapter must place vectors by `index`.
  const data = input
    .map((text, index) => ({ object: 'embedding', index, embedding: [text.length, index] }))
    .reverse();
  return {
    status: 200,
    json: {
      object: 'list',
      data,
      model: EMBEDDING_MODEL,
      usage: { prompt_tokens: 1, total_tokens: 1 },
    },
  };
}

function responsesReply(text: string) {
  return {
    status: 200,
    json: {
      id: 'resp_1',
      object: 'response',
      created_at: 1,
      status: 'completed',
      model: CRITIC_MODEL,
      output: [
        {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text, annotations: [] }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    },
  };
}

describe('createOpenAIClient (adapter over the official SDK, fetch injected)', () => {
  it('embeds with our model and dimensions, in batches, returning vectors in input order', async () => {
    const { fetch, requests } = fakeFetch(embeddingsReply);
    const client = createOpenAIClient(KEY, { fetch });
    const texts = Array.from({ length: 300 }, (_, i) => `t${String(i)}`);
    const vectors = await client.embed(texts);
    expect(vectors).toHaveLength(300);
    expect(vectors[0]).toEqual([2, 0]);
    expect(vectors[299]).toEqual([4, 43]); // second batch, index 43 within it
    expect(requests).toHaveLength(2); // 256 + 44
    expect(requests[0]?.url).toMatch(/\/embeddings$/);
    expect(requests[0]?.body).toMatchObject({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    expect((requests[0]?.body.input as string[]).length).toBe(256);
    expect(requests[0]?.auth).toBe(`Bearer ${KEY}`);
  });

  it('parses a structured critique from the Responses API', async () => {
    const critique = {
      verdict: 'wrong',
      summary: 'Filters the wrong year.',
      issues: [{ severity: 'high', issue: 'Uses 2025.', suggestion: 'Use 2026.' }],
      suggested_sql: null,
    };
    const { fetch, requests } = fakeFetch(() => responsesReply(JSON.stringify(critique)));
    const client = createOpenAIClient(KEY, { fetch });
    await expect(
      client.critique({ question: 'Sales in 2026?', sql: 'SELECT 1', result: '1 row' }),
    ).resolves.toEqual(critique);
    expect(requests[0]?.url).toMatch(/\/responses$/);
    expect(requests[0]?.body.model).toBe(CRITIC_MODEL);
    const format = (requests[0]?.body.text as { format: { type: string; strict: boolean } }).format;
    expect(format).toMatchObject({ type: 'json_schema', strict: true });
    // Not retained by OpenAI, and the critic's cost is capped at the source.
    expect(requests[0]?.body).toMatchObject({
      store: false,
      max_output_tokens: CRITIC_MAX_OUTPUT_TOKENS,
      reasoning: { effort: 'low' },
    });
    // The fields travel as one JSON object, so data can't forge another section.
    expect(JSON.parse(String(requests[0]?.body.input))).toEqual({
      question: 'Sales in 2026?',
      sql: 'SELECT 1',
      result_preview: '1 row',
    });
  });

  it('fails readably when the critic is cut off, refuses, or returns malformed output', async () => {
    const incomplete = responsesReply('{"verdict":"wro');
    (incomplete.json as Record<string, unknown>).status = 'incomplete';
    const refusal = responsesReply('');
    (refusal.json as { output: { content: unknown[] }[] }).output = [
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'refusal', refusal: 'I cannot help with that.' }],
      } as unknown as { content: unknown[] },
    ];
    for (const [reply, message] of [
      [incomplete, /ran out of its output budget/],
      [refusal, /no usable critique/],
      [responsesReply('not json at all'), /OpenAI request failed/],
    ] as const) {
      const { fetch } = fakeFetch(() => reply);
      const client = createOpenAIClient(KEY, { fetch });
      await expect(client.critique({ question: 'q', sql: 's', result: 'r' })).rejects.toThrow(
        message,
      );
    }
  });

  it('maps network failures, user aborts and incomplete embedding responses', async () => {
    const offline = createOpenAIClient(KEY, {
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    await expect(offline.embed(['x'])).rejects.toThrow(/Could not reach OpenAI/);

    const { fetch } = fakeFetch(embeddingsReply);
    const controller = new AbortController();
    controller.abort();
    await expect(
      createOpenAIClient(KEY, { fetch }).embed(['x'], controller.signal),
    ).rejects.toThrow(/cancelled/);

    const partial = fakeFetch((req) => {
      const reply = embeddingsReply(req);
      (reply.json as { data: unknown[] }).data.pop(); // one vector missing
      return reply;
    });
    await expect(
      createOpenAIClient(KEY, { fetch: partial.fetch }).embed(['a', 'b']),
    ).rejects.toThrow(/incomplete embeddings response/);
  });

  it.each([
    [401, /rejected the API key/],
    [429, /rate limit or quota/],
    [500, /request failed \(500\)/],
  ])('turns HTTP %i into a readable error without key material', async (status, message) => {
    const { fetch } = fakeFetch(() => ({ status, json: { error: { message: `bad ${KEY}` } } }));
    const client = createOpenAIClient(KEY, { fetch });
    const error = await client.embed(['x']).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OpenAIUnavailableError);
    expect((error as Error).message).toMatch(message);
    expect((error as Error).message).not.toContain(KEY);
  });
});

describe('boundCritique', () => {
  it('clips long fields and caps the number of issues instead of failing', () => {
    const bounded = boundCritique({
      verdict: 'looks_right',
      summary: 's'.repeat(5_000),
      issues: Array.from({ length: 20 }, () => ({
        severity: 'low' as const,
        issue: 'i'.repeat(900),
        suggestion: 'ok',
      })),
      suggested_sql: null,
    });
    expect(bounded.summary).toHaveLength(1_000);
    expect(bounded.issues).toHaveLength(8);
    expect(bounded.issues[0]?.issue).toHaveLength(500);
  });
});
