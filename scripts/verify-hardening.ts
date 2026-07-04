// Lightweight standalone verification for Task #4 (backend hardening).
// No test framework is installed in this project, so this uses plain asserts
// and prints a pass/fail summary. Run with: npx tsx scripts/verify-hardening.ts
import assert from "node:assert";
import {
  computeChecksum,
  isTransientGeminiError,
  callGeminiWithRetry,
} from "../server/gemini";
import { sanitizeRerText, rerStartSchema } from "../server/routes";
import { pingDb } from "../server/db";

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
  // ── 1. Health check ──────────────────────────────────────────────────────
  await check("pingDb() resolves boolean", async () => {
    const ok = await pingDb();
    assert.strictEqual(typeof ok, "boolean");
  });

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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
