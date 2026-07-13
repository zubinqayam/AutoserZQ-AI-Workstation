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

  let estimatedCostMicros = 0n;
  if (pricing?.verified) {
    estimatedCostMicros += (pricing.inputMicrosPerUnit || 0n) * BigInt(estimatedInputTokens);
    estimatedCostMicros += (pricing.outputMicrosPerUnit || 0n) * BigInt(estimatedOutputTokens);
    estimatedCostMicros += (pricing.thinkingMicrosPerUnit || 0n) * BigInt(estimatedThinkingTokens);
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
