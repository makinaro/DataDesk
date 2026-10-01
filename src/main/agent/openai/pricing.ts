import type { OpenAIModel } from '../../../shared/agent';

/**
 * Standard prices in USD per 1M tokens, from developers.openai.com/api/docs/pricing (checked
 * 2026-10-01, D-021). Reasoning tokens are billed as output and are included in outputTokens.
 * Long-context rates (prompts over 272K tokens) are not modelled: run_sql results are capped,
 * so a DataDesk turn stays far below that.
 */
export const OPENAI_PRICES: Record<
  OpenAIModel,
  { input: number; cachedInput: number; output: number }
> = {
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.4': { input: 2.5, cachedInput: 0.25, output: 15 },
  'gpt-5.5': { input: 5, cachedInput: 0.5, output: 30 },
};

/** One model response's usage, as the Agents SDK reports it (`response_done`). */
export interface ResponseUsage {
  inputTokens: number;
  outputTokens: number;
  inputTokensDetails?: Record<string, number> | Record<string, number>[] | undefined;
}

function cachedTokens(details: ResponseUsage['inputTokensDetails']): number {
  const list = Array.isArray(details) ? details : details ? [details] : [];
  return list.reduce((sum, d) => sum + (d.cached_tokens ?? 0), 0);
}

/** The price of one model response. */
export function responseCostUsd(model: OpenAIModel, usage: ResponseUsage): number {
  const price = OPENAI_PRICES[model];
  const cached = Math.min(cachedTokens(usage.inputTokensDetails), usage.inputTokens);
  return (
    ((usage.inputTokens - cached) * price.input +
      cached * price.cachedInput +
      usage.outputTokens * price.output) /
    1_000_000
  );
}
