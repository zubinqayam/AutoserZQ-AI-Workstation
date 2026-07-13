// Lightweight standalone verification for Task #4 (backend hardening).
// No test framework is installed in this project, so this uses plain asserts
// and prints a pass/fail summary. Run with: npx tsx scripts/verify-hardening.ts
import assert from "node:assert";
import {
  computeChecksum,
  isTransientGeminiError,
  callGeminiWithRetry,
  pingGemini,
} from "../server/gemini";
import { sanitizeRerText, rerStartSchema, verifyCheckpointChain } from "../server/rerValidation";
import { validateOutboundUrl } from "../server/core/urlSafety";
import { getExecutionConfig } from "../server/core/executionConfig";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`PASS: ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`FAIL: ${name} — ${err.message}`);
      failed++;
    });
}

async function main() {
  let pingDb: (() => Promise<boolean>) | null = null;
  if (process.env.DATABASE_URL) {
    ({ pingDb } = await import("../server/db"));
  }

  // ── 1. Health check ──────────────────────────────────────────────────────
  if (pingDb) {
    await check("pingDb() resolves boolean", async () => {
      const ok = await pingDb!();
      assert.strictEqual(typeof ok, "boolean");
    });
  } else {
    console.log("SKIP: pingDb() resolves boolean (DATABASE_URL not set)");
  }

  await check("pingGemini() resolves boolean and respects timeout", async () => {
    const ok = await pingGemini(3000);
    assert.strictEqual(typeof ok, "boolean");
  });

  await check("pingGemini() returns false quickly on a near-zero timeout (bounded latency)", async () => {
    const start = Date.now();
    const ok = await pingGemini(1);
    const elapsed = Date.now() - start;
    assert.strictEqual(typeof ok, "boolean");
    assert.ok(elapsed < 2000, `expected probe to resolve quickly, took ${elapsed}ms`);
  });

  // /api/health reads Gemini reachability from a background-refreshed cache
  // (see startGeminiHealthMonitor) rather than probing live inline, so the
  // endpoint itself stays fast regardless of Gemini's real-world latency.
  // Give the server's background monitor a moment to complete its first probe.
  await new Promise((r) => setTimeout(r, 1500));

  if (process.env.RUN_HEALTH_ENDPOINT_TEST === "true") {
    await check("GET /api/health returns expected shape within 200ms (requires running server on PORT/5000)", async () => {
      const port = process.env.PORT || "5000";
      const start = Date.now();
      const res = await fetch(`http://localhost:${port}/api/health`);
      const elapsed = Date.now() - start;
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(["ok", "degraded", "down"].includes(body.status));
      assert.strictEqual(typeof body.checks.db, "boolean");
      assert.strictEqual(typeof body.checks.gemini, "boolean");
      assert.strictEqual(typeof body.checks.uptime, "number");
      assert.ok(elapsed < 200, `expected /api/health to respond in <200ms, took ${elapsed}ms`);
    });
  } else {
    console.log("SKIP: GET /api/health test (RUN_HEALTH_ENDPOINT_TEST not true)");
  }

  // ── 2. Retry/backoff ─────────────────────────────────────────────────────
  await check("isTransientGeminiError classifies 429/503 as transient", () => {
    assert.strictEqual(isTransientGeminiError({ status: 429 }), true);
    assert.strictEqual(isTransientGeminiError({ status: 503 }), true);
  });

  await check("isTransientGeminiError classifies 400/401/403 as permanent", () => {
    assert.strictEqual(isTransientGeminiError({ status: 400 }), false);
    assert.strictEqual(isTransientGeminiError({ status: 401 }), false);
    assert.strictEqual(isTransientGeminiError({ status: 403 }), false);
  });

  await check("callGeminiWithRetry retries transient errors up to maxAttempts then throws", async () => {
    let attempts = 0;
    const start = Date.now();
    await assert.rejects(
      callGeminiWithRetry(
        async () => {
          attempts++;
          const err: any = new Error("rate limit exceeded");
          err.status = 429;
          throw err;
        },
        { maxAttempts: 3, baseDelayMs: 10 }
      )
    );
    assert.strictEqual(attempts, 3, `expected 3 attempts, got ${attempts}`);
    assert.ok(Date.now() - start >= 0);
  });

  await check("callGeminiWithRetry does not retry permanent errors", async () => {
    let attempts = 0;
    await assert.rejects(
      callGeminiWithRetry(
        async () => {
          attempts++;
          const err: any = new Error("bad request");
          err.status = 400;
          throw err;
        },
        { maxAttempts: 3, baseDelayMs: 10 }
      )
    );
    assert.strictEqual(attempts, 1, `expected 1 attempt (no retry), got ${attempts}`);
  });

  await check("callGeminiWithRetry succeeds after transient failures", async () => {
    let attempts = 0;
    const result = await callGeminiWithRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          const err: any = new Error("overloaded");
          err.status = 503;
          throw err;
        }
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 10 }
    );
    assert.strictEqual(result, "ok");
    assert.strictEqual(attempts, 2);
  });

  // ── 3. Input sanitization ────────────────────────────────────────────────
  await check("sanitizeRerText strips control chars, zero-width chars, and angle brackets", () => {
    const dirty = "Hello\x00\x1F\u200B<script>alert(1)</script>World";
    const clean = sanitizeRerText(dirty);
    assert.ok(!/[\x00-\x1F\x7F-\x9F]/.test(clean));
    assert.ok(!/[\u200B-\u200F\uFEFF]/.test(clean));
    assert.ok(!clean.includes("<") && !clean.includes(">"));
  });

  await check("sanitizeRerText caps length at 500 chars", () => {
    const long = "a".repeat(1000);
    assert.strictEqual(sanitizeRerText(long).length, 500);
  });

  await check("rerStartSchema rejects empty topic", () => {
    const result = rerStartSchema.safeParse({ roomId: "r1", topic: "" });
    assert.strictEqual(result.success, false);
  });

  await check("rerStartSchema rejects topic that is empty after sanitization", () => {
    const result = rerStartSchema.safeParse({ roomId: "r1", topic: "\x00\x01\u200B" });
    assert.strictEqual(result.success, false);
  });

  await check("rerStartSchema accepts and sanitizes a valid topic", () => {
    const result = rerStartSchema.safeParse({ roomId: "r1", topic: "  Climate <b>change</b> impacts  " });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.topic.includes("<"), false);
    }
  });

  await check("rerStartSchema defaults mode to sequential and rejects invalid mode", () => {
    const withDefault = rerStartSchema.safeParse({ roomId: "r1", topic: "topic" });
    assert.strictEqual(withDefault.success, true);
    if (withDefault.success) assert.strictEqual(withDefault.data.mode, "sequential");

    const invalidMode = rerStartSchema.safeParse({ roomId: "r1", topic: "topic", mode: "bogus" });
    assert.strictEqual(invalidMode.success, false);
  });

  // ── 4. Checkpoint integrity ──────────────────────────────────────────────
  await check("computeChecksum is deterministic and detects tampering", () => {
    const a = computeChecksum("hello world");
    const b = computeChecksum("hello world");
    const c = computeChecksum("hello world!");
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, c);
    assert.strictEqual(a.length, 64); // sha256 hex
  });

  await check("verifyCheckpointChain accepts a fully valid chain and finds correct resume point", () => {
    const outputs = [0, 1].map((i) => {
      const output = `tab${i} output`;
      return { tabIndex: i, status: "done", output, checkpointHash: computeChecksum(output) };
    });
    const { lastGoodIndex, intact } = verifyCheckpointChain(outputs);
    assert.strictEqual(intact, true);
    assert.strictEqual(lastGoodIndex, 1);
  });

  await check("verifyCheckpointChain rejects a tampered checkpoint (hash mismatch) and stops at the last good tab", () => {
    const goodOutput = "tab0 output";
    const outputs = [
      { tabIndex: 0, status: "done", output: goodOutput, checkpointHash: computeChecksum(goodOutput) },
      { tabIndex: 1, status: "done", output: "tampered output", checkpointHash: "0".repeat(64) },
      { tabIndex: 2, status: "idle", output: null, checkpointHash: null },
    ];
    const { lastGoodIndex, intact } = verifyCheckpointChain(outputs);
    assert.strictEqual(intact, false);
    assert.strictEqual(lastGoodIndex, 0);
  });

  await check("verifyCheckpointChain rejects a done checkpoint with a missing hash", () => {
    const outputs = [
      { tabIndex: 0, status: "done", output: "tab0 output", checkpointHash: null },
    ];
    const { lastGoodIndex, intact } = verifyCheckpointChain(outputs);
    assert.strictEqual(intact, false);
    assert.strictEqual(lastGoodIndex, -1);
  });

  // ── 5. URL fetch hardening + execution config ─────────────────────────────
  await check("validateOutboundUrl rejects malformed URLs", async () => {
    await assert.rejects(validateOutboundUrl("not-a-url"));
  });

  await check("validateOutboundUrl rejects localhost and loopback", async () => {
    await assert.rejects(validateOutboundUrl("http://localhost:8080"));
    await assert.rejects(validateOutboundUrl("http://127.0.0.1"));
  });

  await check("validateOutboundUrl rejects private and metadata addresses", async () => {
    await assert.rejects(validateOutboundUrl("http://10.0.0.1"));
    await assert.rejects(validateOutboundUrl("http://192.168.1.1"));
    await assert.rejects(validateOutboundUrl("http://169.254.169.254/latest/meta-data"));
  });

  await check("execution config defaults RER thinking budget to 5000 and output to 4096", () => {
    delete process.env.GEMINI_RER_THINKING_BUDGET;
    delete process.env.GEMINI_RER_MAX_OUTPUT_TOKENS;
    process.env.EXECUTION_PROFILE = "STANDARD";
    const cfg = getExecutionConfig();
    assert.strictEqual(cfg.rerTabCycle.thinkingBudget, 5000);
    assert.strictEqual(cfg.rerTabCycle.maxOutputTokens, 4096);
  });

  await check("execution config allows typed env overrides", () => {
    process.env.GEMINI_RER_THINKING_BUDGET = "6200";
    process.env.GEMINI_RER_MAX_OUTPUT_TOKENS = "3000";
    const cfg = getExecutionConfig();
    assert.strictEqual(cfg.rerTabCycle.thinkingBudget, 6200);
    assert.strictEqual(cfg.rerTabCycle.maxOutputTokens, 3000);
    delete process.env.GEMINI_RER_THINKING_BUDGET;
    delete process.env.GEMINI_RER_MAX_OUTPUT_TOKENS;
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
