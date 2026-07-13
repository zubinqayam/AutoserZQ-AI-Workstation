import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { budgetReservations, usageLedger } from "@shared/schema";

export type UsageCounterField = "geminiCalls" | "rerLaunches" | "coaCalls" | "serpSearches" | "urlFetches";

export interface UsageIncrement {
  counter?: UsageCounterField;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedThinkingTokens?: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  actualThinkingTokens?: number;
  geminiInputMicros?: bigint;
  geminiOutputMicros?: bigint;
  geminiThinkingMicros?: bigint;
  serpMicros?: bigint;
}

export interface BudgetReservationRequest {
  uid: string;
  provider: string;
  operationType: string;
  estimatedMicros: bigint;
  monthlyCeilingMicros: bigint;
}

export interface UsageSnapshot {
  date: string;
  month: string;
  geminiCalls: number;
  rerLaunches: number;
  coaCalls: number;
  serpSearches: number;
  urlFetches: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedThinkingTokens: number;
  actualInputTokens: number;
  actualOutputTokens: number;
  actualThinkingTokens: number;
}

const toDateParts = (d = new Date()) => {
  const date = d.toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  return { date, month };
};

const parseDbBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  return 0n;
};

class BudgetLedger {
  private async ensureDailyRow(uid: string, usageDate: string, usageMonth: string) {
    await db
      .insert(usageLedger)
      .values({
        uid,
        usageDate,
        usageMonth,
      })
      .onConflictDoNothing({
        target: [usageLedger.uid, usageLedger.usageDate],
      });
  }

  async getUsageForDate(uid: string, date = toDateParts().date): Promise<UsageSnapshot> {
    const month = date.slice(0, 7);
    await this.ensureDailyRow(uid, date, month);
    const [row] = await db
      .select()
      .from(usageLedger)
      .where(and(eq(usageLedger.uid, uid), eq(usageLedger.usageDate, date)));
    return {
      date,
      month,
      geminiCalls: row?.geminiCalls ?? 0,
      rerLaunches: row?.rerLaunches ?? 0,
      coaCalls: row?.coaCalls ?? 0,
      serpSearches: row?.serpSearches ?? 0,
      urlFetches: row?.urlFetches ?? 0,
      estimatedInputTokens: row?.estimatedInputTokens ?? 0,
      estimatedOutputTokens: row?.estimatedOutputTokens ?? 0,
      estimatedThinkingTokens: row?.estimatedThinkingTokens ?? 0,
      actualInputTokens: row?.actualInputTokens ?? 0,
      actualOutputTokens: row?.actualOutputTokens ?? 0,
      actualThinkingTokens: row?.actualThinkingTokens ?? 0,
    };
  }

  async incrementUsage(uid: string, increment: UsageIncrement): Promise<UsageSnapshot> {
    const { date, month } = toDateParts();
    await this.ensureDailyRow(uid, date, month);
    const set: Record<string, any> = { updatedAt: new Date() };

    if (increment.counter === "geminiCalls") set.geminiCalls = sql`${usageLedger.geminiCalls} + 1`;
    if (increment.counter === "rerLaunches") set.rerLaunches = sql`${usageLedger.rerLaunches} + 1`;
    if (increment.counter === "coaCalls") set.coaCalls = sql`${usageLedger.coaCalls} + 1`;
    if (increment.counter === "serpSearches") set.serpSearches = sql`${usageLedger.serpSearches} + 1`;
    if (increment.counter === "urlFetches") set.urlFetches = sql`${usageLedger.urlFetches} + 1`;

    if (typeof increment.estimatedInputTokens === "number") set.estimatedInputTokens = sql`${usageLedger.estimatedInputTokens} + ${increment.estimatedInputTokens}`;
    if (typeof increment.estimatedOutputTokens === "number") set.estimatedOutputTokens = sql`${usageLedger.estimatedOutputTokens} + ${increment.estimatedOutputTokens}`;
    if (typeof increment.estimatedThinkingTokens === "number") set.estimatedThinkingTokens = sql`${usageLedger.estimatedThinkingTokens} + ${increment.estimatedThinkingTokens}`;
    if (typeof increment.actualInputTokens === "number") set.actualInputTokens = sql`${usageLedger.actualInputTokens} + ${increment.actualInputTokens}`;
    if (typeof increment.actualOutputTokens === "number") set.actualOutputTokens = sql`${usageLedger.actualOutputTokens} + ${increment.actualOutputTokens}`;
    if (typeof increment.actualThinkingTokens === "number") set.actualThinkingTokens = sql`${usageLedger.actualThinkingTokens} + ${increment.actualThinkingTokens}`;

    if (typeof increment.geminiInputMicros === "bigint") set.geminiInputMicros = sql`${usageLedger.geminiInputMicros} + ${increment.geminiInputMicros}`;
    if (typeof increment.geminiOutputMicros === "bigint") set.geminiOutputMicros = sql`${usageLedger.geminiOutputMicros} + ${increment.geminiOutputMicros}`;
    if (typeof increment.geminiThinkingMicros === "bigint") set.geminiThinkingMicros = sql`${usageLedger.geminiThinkingMicros} + ${increment.geminiThinkingMicros}`;
    if (typeof increment.serpMicros === "bigint") set.serpMicros = sql`${usageLedger.serpMicros} + ${increment.serpMicros}`;

    await db
      .update(usageLedger)
      .set(set)
      .where(and(eq(usageLedger.uid, uid), eq(usageLedger.usageDate, date)));

    return this.getUsageForDate(uid, date);
  }

  async reserveBudget(input: BudgetReservationRequest): Promise<{ allowed: boolean; reservationId?: string; reason?: string }> {
    const { date, month } = toDateParts();
    return db.transaction(async (tx) => {
      await tx
        .insert(usageLedger)
        .values({ uid: input.uid, usageDate: date, usageMonth: month })
        .onConflictDoNothing({ target: [usageLedger.uid, usageLedger.usageDate] });

      await tx.execute(
        sql`SELECT id FROM usage_ledger WHERE uid = ${input.uid} AND usage_month = ${month} FOR UPDATE`
      );

      const spendRows = await tx.execute(sql`
        SELECT
          COALESCE(SUM(gemini_input_micros + gemini_output_micros + gemini_thinking_micros + serp_micros), 0) AS spent_micros
        FROM usage_ledger
        WHERE uid = ${input.uid} AND usage_month = ${month}
      `);
      const activeRows = await tx.execute(sql`
        SELECT COALESCE(SUM(estimated_micros), 0) AS active_reserved
        FROM budget_reservations
        WHERE uid = ${input.uid} AND status = 'active'
      `);

      const spent = parseDbBigInt((spendRows as any).rows?.[0]?.spent_micros);
      const activeReserved = parseDbBigInt((activeRows as any).rows?.[0]?.active_reserved);
      const projected = spent + activeReserved + input.estimatedMicros;
      if (projected > input.monthlyCeilingMicros) {
        return { allowed: false, reason: "Monthly budget ceiling exceeded" };
      }

      const [reservation] = await tx
        .insert(budgetReservations)
        .values({
          uid: input.uid,
          provider: input.provider,
          operationType: input.operationType,
          estimatedMicros: input.estimatedMicros,
          status: "active",
        })
        .returning();

      await tx
        .update(usageLedger)
        .set({
          reservedMicros: sql`${usageLedger.reservedMicros} + ${input.estimatedMicros}`,
          updatedAt: new Date(),
        })
        .where(and(eq(usageLedger.uid, input.uid), eq(usageLedger.usageDate, date)));

      return { allowed: true, reservationId: reservation.id };
    });
  }

  async settleReservation(reservationId: string, actualMicros: bigint, usage?: UsageIncrement): Promise<void> {
    const { date, month } = toDateParts();
    await db.transaction(async (tx) => {
      const lockRows = await tx.execute(sql`SELECT * FROM budget_reservations WHERE id = ${reservationId} FOR UPDATE`);
      const reservation = (lockRows as any).rows?.[0];
      if (!reservation || reservation.status !== "active") return;

      await tx
        .insert(usageLedger)
        .values({ uid: reservation.uid, usageDate: date, usageMonth: month })
        .onConflictDoNothing({ target: [usageLedger.uid, usageLedger.usageDate] });

      const estimated = parseDbBigInt(reservation.estimated_micros);
      const microsSet: Record<string, any> = {
        reservedMicros: sql`${usageLedger.reservedMicros} - ${estimated}`,
        updatedAt: new Date(),
      };
      if (reservation.provider === "serpapi") microsSet.serpMicros = sql`${usageLedger.serpMicros} + ${actualMicros}`;
      if (reservation.provider === "gemini" || reservation.provider === "gemini-rer") {
        microsSet.geminiOutputMicros = sql`${usageLedger.geminiOutputMicros} + ${actualMicros}`;
      }
      if (usage?.actualInputTokens) microsSet.actualInputTokens = sql`${usageLedger.actualInputTokens} + ${usage.actualInputTokens}`;
      if (usage?.actualOutputTokens) microsSet.actualOutputTokens = sql`${usageLedger.actualOutputTokens} + ${usage.actualOutputTokens}`;
      if (usage?.actualThinkingTokens) microsSet.actualThinkingTokens = sql`${usageLedger.actualThinkingTokens} + ${usage.actualThinkingTokens}`;

      await tx
        .update(usageLedger)
        .set(microsSet)
        .where(and(eq(usageLedger.uid, reservation.uid), eq(usageLedger.usageDate, date)));

      await tx
        .update(budgetReservations)
        .set({
          status: "settled",
          actualMicros,
          settledAt: new Date(),
        })
        .where(eq(budgetReservations.id, reservationId));
    });
  }

  async releaseReservation(reservationId: string, errorMessage?: string): Promise<void> {
    const { date, month } = toDateParts();
    await db.transaction(async (tx) => {
      const lockRows = await tx.execute(sql`SELECT * FROM budget_reservations WHERE id = ${reservationId} FOR UPDATE`);
      const reservation = (lockRows as any).rows?.[0];
      if (!reservation || reservation.status !== "active") return;

      await tx
        .insert(usageLedger)
        .values({ uid: reservation.uid, usageDate: date, usageMonth: month })
        .onConflictDoNothing({ target: [usageLedger.uid, usageLedger.usageDate] });

      const estimated = parseDbBigInt(reservation.estimated_micros);
      await tx
        .update(usageLedger)
        .set({
          reservedMicros: sql`${usageLedger.reservedMicros} - ${estimated}`,
          updatedAt: new Date(),
        })
        .where(and(eq(usageLedger.uid, reservation.uid), eq(usageLedger.usageDate, date)));

      await tx
        .update(budgetReservations)
        .set({
          status: "released",
          errorMessage: errorMessage ?? null,
          releasedAt: new Date(),
        })
        .where(eq(budgetReservations.id, reservationId));
    });
  }

  async getBudgetTotals(uid: string): Promise<{ daily: UsageSnapshot; monthlySpentMicros: bigint; activeReservationMicros: bigint }> {
    const { date, month } = toDateParts();
    const daily = await this.getUsageForDate(uid, date);

    const spendRows = await db.execute(sql`
      SELECT COALESCE(SUM(gemini_input_micros + gemini_output_micros + gemini_thinking_micros + serp_micros), 0) AS spent_micros
      FROM usage_ledger
      WHERE uid = ${uid} AND usage_month = ${month}
    `);
    const activeRows = await db.execute(sql`
      SELECT COALESCE(SUM(estimated_micros), 0) AS active_reserved
      FROM budget_reservations
      WHERE uid = ${uid} AND status = 'active'
    `);

    return {
      daily,
      monthlySpentMicros: parseDbBigInt((spendRows as any).rows?.[0]?.spent_micros),
      activeReservationMicros: parseDbBigInt((activeRows as any).rows?.[0]?.active_reserved),
    };
  }
}

export const budgetLedger = new BudgetLedger();
