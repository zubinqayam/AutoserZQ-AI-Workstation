import { getPricingEntry, isPricingStale } from "./pricingCatalog";

export interface TokenEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedThinkingTokens: number;
  estimatedCostMicros: bigint;
  pricingVerified: boolean;
  pricingStale: boolean;
}

export interface ActualTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
}

export function estimateGeminiTokens(params: {
  inputText: string;
  maxOutputTokens: number;
  thinkingBudget: number;
  model?: string;
}): TokenEstimate {
  const estimatedInputTokens = Math.max(1, Math.ceil(params.inputText.length / 4));
  const estimatedOutputTokens = Math.max(1, params.maxOutputTokens);
  const estimatedThinkingTokens = Math.max(0, params.thinkingBudget);
  const pricing = getPricingEntry("gemini", params.model || "gemini-2.5-flash");
  const pricingStale = isPricingStale();

  let estimatedCostMicros = BigInt(0);
  if (pricing?.verified) {
    estimatedCostMicros += (pricing.inputMicrosPerUnit || BigInt(0)) * BigInt(estimatedInputTokens);
    estimatedCostMicros += (pricing.outputMicrosPerUnit || BigInt(0)) * BigInt(estimatedOutputTokens);
    estimatedCostMicros += (pricing.thinkingMicrosPerUnit || BigInt(0)) * BigInt(estimatedThinkingTokens);
  }

  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedThinkingTokens,
    estimatedCostMicros,
    pricingVerified: Boolean(pricing?.verified),
    pricingStale,
  };
}

export function extractGeminiUsageMetadata(response: any): ActualTokenUsage {
  const usage = response?.usageMetadata;
  if (!usage || typeof usage !== "object") return {};
  return {
    inputTokens: typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : undefined,
    outputTokens: typeof usage.candidatesTokenCount === "number" ? usage.candidatesTokenCount : undefined,
    thinkingTokens: typeof usage.thoughtsTokenCount === "number" ? usage.thoughtsTokenCount : undefined,
  };
}
