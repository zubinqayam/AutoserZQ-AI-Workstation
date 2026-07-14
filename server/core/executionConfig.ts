export type ExecutionProfile = "ECONOMY" | "STANDARD" | "DEEP" | "CRITICAL";

export interface GeminiExecutionParams {
  thinkingBudget: number;
  maxOutputTokens: number;
}

export interface ExecutionConfig {
  profile: ExecutionProfile;
  rerTabCycle: GeminiExecutionParams;
  coa: GeminiExecutionParams;
  supervisor: GeminiExecutionParams;
}

const toPositiveInt = (raw: string | undefined, fallback: number) => {
  if (!raw) return fallback;
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const PROFILE_DEFAULTS: Record<ExecutionProfile, ExecutionConfig> = {
  ECONOMY: {
    profile: "ECONOMY",
    rerTabCycle: { thinkingBudget: 2500, maxOutputTokens: 2048 },
    coa: { thinkingBudget: 1000, maxOutputTokens: 1024 },
    supervisor: { thinkingBudget: 1000, maxOutputTokens: 1024 },
  },
  STANDARD: {
    profile: "STANDARD",
    rerTabCycle: { thinkingBudget: 5000, maxOutputTokens: 4096 },
    coa: { thinkingBudget: 2000, maxOutputTokens: 1536 },
    supervisor: { thinkingBudget: 2000, maxOutputTokens: 1536 },
  },
  DEEP: {
    profile: "DEEP",
    rerTabCycle: { thinkingBudget: 8000, maxOutputTokens: 4096 },
    coa: { thinkingBudget: 3500, maxOutputTokens: 2048 },
    supervisor: { thinkingBudget: 3500, maxOutputTokens: 2048 },
  },
  CRITICAL: {
    profile: "CRITICAL",
    rerTabCycle: { thinkingBudget: 10000, maxOutputTokens: 4096 },
    coa: { thinkingBudget: 5000, maxOutputTokens: 3072 },
    supervisor: { thinkingBudget: 5000, maxOutputTokens: 3072 },
  },
};

export function getExecutionConfig(): ExecutionConfig {
  const requestedProfile = (process.env.EXECUTION_PROFILE || "STANDARD").toUpperCase() as ExecutionProfile;
  const base = PROFILE_DEFAULTS[requestedProfile] || PROFILE_DEFAULTS.STANDARD;
  return {
    ...base,
    rerTabCycle: {
      thinkingBudget: toPositiveInt(process.env.GEMINI_RER_THINKING_BUDGET, base.rerTabCycle.thinkingBudget),
      maxOutputTokens: toPositiveInt(process.env.GEMINI_RER_MAX_OUTPUT_TOKENS, base.rerTabCycle.maxOutputTokens),
    },
    coa: {
      thinkingBudget: toPositiveInt(process.env.GEMINI_COA_THINKING_BUDGET, base.coa.thinkingBudget),
      maxOutputTokens: toPositiveInt(process.env.GEMINI_COA_MAX_OUTPUT_TOKENS, base.coa.maxOutputTokens),
    },
    supervisor: {
      thinkingBudget: toPositiveInt(process.env.GEMINI_SUPERVISOR_THINKING_BUDGET, base.supervisor.thinkingBudget),
      maxOutputTokens: toPositiveInt(process.env.GEMINI_SUPERVISOR_MAX_OUTPUT_TOKENS, base.supervisor.maxOutputTokens),
    },
  };
}
