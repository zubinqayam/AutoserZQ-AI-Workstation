---
name: Gemini free-tier daily quota
description: What a 429 RESOURCE_EXHAUSTED from Gemini actually means and how retry logic should treat it
---

Gemini's free tier enforces a **daily** request quota (observed: 20 requests/day for `gemini-2.5-flash` under `generativelanguage.googleapis.com/generate_content_free_tier_requests`), not just a short-window rate limit. The error is `429 RESOURCE_EXHAUSTED` with `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`.

**Why this matters:** Exponential-backoff retry (seconds-scale) is designed for short transient blips (overload, brief rate limiting). A daily quota exhaustion will not resolve within a few retries no matter the backoff — the quota resets on a ~24h cycle. Retry logic should still classify 429 as transient (correct default), but don't be surprised when a burst of testing exhausts the quota and every subsequent call fails after retries — that's expected, not a bug in the retry implementation.

**How to apply:** When debugging "why did my RER pipeline / Gemini call fail after retries," check the error body for `RESOURCE_EXHAUSTED` / `quotaId` before assuming the retry/backoff code is broken. If quota-exhausted, either wait for reset or reduce the number of test calls (e.g. test retry logic with mocked failures instead of live Gemini calls once quota is tight).
