import { budgetConfig } from "./budgetConfig";

export type PricingUnit = "token" | "request";

export interface PricingEntry {
  provider: "gemini" | "serpapi";
  modelOrOperation: string;
  unit: PricingUnit;
  inputMicrosPerUnit?: bigint;
  outputMicrosPerUnit?: bigint;
  thinkingMicrosPerUnit?: bigint;
  requestMicros?: bigint;
  verified: boolean;
  verificationNote?: string;
}

export interface PricingCatalog {
  version: string;
  lastUpdated: string;
  entries: PricingEntry[];
}

// Source refs:
// - Gemini token pricing not authoritatively defined in this repository.
// - SerpAPI request pricing depends on plan and account terms.
// Keep interfaces active but mark verification required until confirmed.
export const pricingCatalog: PricingCatalog = {
  version: "2026-07-13",
  lastUpdated: "2026-07-13",
  entries: [
    {
      provider: "gemini",
      modelOrOperation: "gemini-2.5-flash",
      unit: "token",
      verified: false,
      verificationNote: "Pricing requires authoritative provider contract verification.",
    },
    {
      provider: "serpapi",
      modelOrOperation: "google-search",
      unit: "request",
      verified: false,
      verificationNote: "Pricing requires account-plan verification.",
    },
  ],
};

export function getPricingEntry(provider: PricingEntry["provider"], modelOrOperation: string): PricingEntry | undefined {
  return pricingCatalog.entries.find((e) => e.provider === provider && e.modelOrOperation === modelOrOperation);
}

export function isPricingStale(now = new Date()): boolean {
  const updated = new Date(`${pricingCatalog.lastUpdated}T00:00:00.000Z`).getTime();
  const ageDays = (now.getTime() - updated) / (1000 * 60 * 60 * 24);
  return ageDays > budgetConfig.maxPricingAgeDays;
}
