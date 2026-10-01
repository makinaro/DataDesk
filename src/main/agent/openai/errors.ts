import OpenAI from 'openai';

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}

/** An HTTP status, from this `openai` copy's APIError or anything shaped like one. */
function httpStatus(error: unknown): number | undefined {
  const cause: unknown = error instanceof Error ? error.cause : undefined;
  for (const candidate of [error, cause]) {
    if (candidate instanceof OpenAI.APIError) {
      const status: unknown = candidate.status;
      return typeof status === 'number' ? status : 0;
    }
    // Duck-typed too: if a second copy of `openai` were ever bundled, instanceof would miss its
    // errors and their raw message would reach the chat. Fail closed instead.
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      'status' in candidate &&
      typeof candidate.status === 'number'
    ) {
      return candidate.status;
    }
  }
  return undefined;
}

/**
 * A readable, key-free message for a failed OpenAI run. API errors are mapped by status, so the
 * raw message (which can echo a masked key or request details) never reaches the chat or logs.
 */
export function explainOpenAIError(error: unknown): string {
  const connection =
    error instanceof OpenAI.APIConnectionError ||
    (error instanceof Error && error.cause instanceof OpenAI.APIConnectionError);
  if (connection) return 'Could not reach OpenAI (network error or timeout).';
  const status = httpStatus(error);
  if (status === undefined) return firstLine(error);
  if (status === 401) return 'OpenAI rejected the API key (401). Check it in Settings.';
  if (status === 403 || status === 404) {
    return `OpenAI refused the request (${String(status)}): your key may not have access to this model.`;
  }
  if (status === 429) return 'OpenAI rate limit or quota reached (429). Try again later.';
  return `OpenAI request failed (${status === 0 ? '?' : String(status)}).`;
}
