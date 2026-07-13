import { budgetConfig, type BudgetStatus, type PaidOperation } from "./budgetConfig";
import { budgetLedger } from "./budgetLedger";
import { eventBus } from "./eventBus";

type Tier = "free" | "pro" | "enterprise";

export interface QuotaDecision {
  allowed: boolean;
  statusCode?: number;
  retryAfterSeconds?: number;
  code?: string;
  message?: string;
  status: BudgetStatus;
}

class QuotaEnforcer {
  private getLimit(tier: Tier, operation: PaidOperation): number {
    return budgetConfig.tiers[tier][operation];
  }

  private computeBudgetStatus(usedPercent: number): BudgetStatus {
    if (budgetConfig.emergencyKillSwitch || budgetConfig.zeroPaidSpendMode) return "disabled";
    if (usedPercent >= 100) return "exhausted";
    if (usedPercent >= 95) return "degraded";
    if (usedPercent >= 60) return "warning";
    return "normal";
  }

  async evaluate(uid: string, tier: Tier, operation: PaidOperation): Promise<QuotaDecision> {
    if (budgetConfig.emergencyKillSwitch) {
      return { allowed: false, statusCode: 503, code: "PAID_OPERATIONS_DISABLED", message: "Paid operations are administratively disabled.", status: "disabled" };
    }
    if (budgetConfig.zeroPaidSpendMode) {
      return { allowed: false, statusCode: 503, code: "ZERO_PAID_SPEND_MODE", message: "Zero-paid-spend mode is enabled.", status: "disabled" };
    }

    const totals = await budgetLedger.getBudgetTotals(uid);
    const used = totals.daily[operation];
    const limit = this.getLimit(tier, operation);
    if (used >= limit) {
      return {
        allowed: false,
        statusCode: 429,
        code: "RATE_LIMITED",
        message: `Daily ${operation} limit reached (${used}/${limit}).`,
        retryAfterSeconds: 3600,
        status: "exhausted",
      };
    }

    const ceiling = budgetConfig.monthlyCeilingMicros;
    const budgetUsed = totals.monthlySpentMicros + totals.activeReservationMicros;
    const usedPercent = ceiling > 0n ? Number((budgetUsed * 10000n) / ceiling) / 100 : 0;
    const status = this.computeBudgetStatus(usedPercent);
    if (status === "warning") eventBus.publish("budget.soft_threshold", "global", { uid, usedPercent });
    if (status === "degraded" || status === "exhausted") eventBus.publish("budget.hard_threshold", "global", { uid, usedPercent });
    if (status === "exhausted") {
      return {
        allowed: false,
        statusCode: 429,
        code: "BUDGET_EXHAUSTED",
        message: "Monthly paid budget exhausted.",
        status,
      };
    }

    return { allowed: true, status };
  }
}

export const quotaEnforcer = new QuotaEnforcer();
