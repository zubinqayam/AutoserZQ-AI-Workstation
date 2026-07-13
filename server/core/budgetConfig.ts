export type BudgetStatus = "normal" | "warning" | "degraded" | "exhausted" | "disabled";
export type PaidOperation =
  | "geminiCalls"
  | "rerLaunches"
  | "coaCalls"
  | "serpSearches"
  | "urlFetches";

const intFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const bigIntFromEnv = (name: string, fallback: bigint): bigint => {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const parsed = BigInt(raw);
    return parsed >= 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export interface TierQuotaConfig {
  geminiCalls: number;
  rerLaunches: number;
  coaCalls: number;
  serpSearches: number;
  urlFetches: number;
}

export interface BudgetConfig {
  emergencyKillSwitch: boolean;
  zeroPaidSpendMode: boolean;
  monthlyCeilingMicros: bigint;
  maxPricingAgeDays: number;
  tiers: Record<"free" | "pro" | "enterprise", TierQuotaConfig>;
}

export const budgetConfig: BudgetConfig = {
  emergencyKillSwitch: process.env.BUDGET_KILL_SWITCH === "true",
  zeroPaidSpendMode: process.env.ZERO_PAID_SPEND_MODE === "true",
  monthlyCeilingMicros: bigIntFromEnv("MONTHLY_BUDGET_CEILING_MICROS", 10_000_000n),
  maxPricingAgeDays: intFromEnv("PRICING_MAX_AGE_DAYS", 30),
  tiers: {
    free: {
      geminiCalls: intFromEnv("FREE_GEMINI_PER_DAY", 20),
      rerLaunches: intFromEnv("FREE_RER_PER_DAY", 3),
      coaCalls: intFromEnv("FREE_COA_PER_DAY", 15),
      serpSearches: intFromEnv("FREE_SERP_PER_DAY", 20),
      urlFetches: intFromEnv("FREE_FETCH_URL_PER_DAY", 30),
    },
    pro: {
      geminiCalls: intFromEnv("PRO_GEMINI_PER_DAY", 100),
      rerLaunches: intFromEnv("PRO_RER_PER_DAY", 15),
      coaCalls: intFromEnv("PRO_COA_PER_DAY", 50),
      serpSearches: intFromEnv("PRO_SERP_PER_DAY", 100),
      urlFetches: intFromEnv("PRO_FETCH_URL_PER_DAY", 150),
    },
    enterprise: {
      geminiCalls: intFromEnv("ENTERPRISE_GEMINI_PER_DAY", 500),
      rerLaunches: intFromEnv("ENTERPRISE_RER_PER_DAY", 50),
      coaCalls: intFromEnv("ENTERPRISE_COA_PER_DAY", 200),
      serpSearches: intFromEnv("ENTERPRISE_SERP_PER_DAY", 500),
      urlFetches: intFromEnv("ENTERPRISE_FETCH_URL_PER_DAY", 500),
    },
  },
};
