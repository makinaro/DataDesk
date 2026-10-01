import OpenAI from 'openai';

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] ?? message;
}

/**
 * A readable, key-free message for a failed OpenAI run. API errors are mapped by class, so the
 * raw message (which can echo a masked key or request details) never reaches the chat.
 */
export function explainOpenAIError(error: unknown): string {
  const api =
    error instanceof OpenAI.APIError
      ? error
      : error instanceof Error && error.cause instanceof OpenAI.APIError
        ? error.cause
        : undefined;
  if (api instanceof OpenAI.AuthenticationError) {
    return 'OpenAI rejected the API key (401). Check it in Settings.';
  }
  if (api instanceof OpenAI.PermissionDeniedError || api instanceof OpenAI.NotFoundError) {
    return `OpenAI refused the request (${String(api.status)}): your key may not have access to this model.`;
  }
  if (api instanceof OpenAI.RateLimitError) {
    return 'OpenAI rate limit or quota reached (429). Try again later.';
  }
  if (api instanceof OpenAI.APIConnectionError) {
    return 'Could not reach OpenAI (network error or timeout).';
  }
  if (api) return `OpenAI request failed (${String(api.status ?? '?')}).`;
  return firstLine(error);
}
