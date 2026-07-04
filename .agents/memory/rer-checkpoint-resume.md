---
name: RER checkpoint/resume design
description: How the RER pipeline's crash-resume and checkpoint integrity verification works, and its known limitation
---

The RER pipeline (`server/routes.ts`) writes a SHA-256 checkpoint hash (`rerAgentOutputs.checkpointHash`, computed via `computeChecksum` in `server/gemini.ts`) alongside every tab's output when it completes.

On server startup, `resumeInterruptedRerTasks()` scans for `rerTasks` rows still marked `status: "running"` (meaning the process died mid-pipeline) and:
- For **sequential** mode: walks the tab outputs in order, re-verifying each `done` tab's stored hash against a fresh hash of its stored output. If a mismatch is found, the chain is considered broken and the task is marked `error` rather than resumed (never trust/continue from corrupted state). If all verified tabs check out, the pipeline resumes from the next unfinished tab, seeding it with the last verified report.
- For **parallel** mode: resume is intentionally NOT implemented (ambiguous which round was interrupted) — the task is just marked `error`. This is a known, accepted scope cut (see follow-up task for parallel-mode resume).

**Why:** Verifying hashes before resuming prevents silently continuing a pipeline on top of truncated/corrupted checkpoint data, which would produce a coherent-looking but wrong final report.

**How to apply:** When extending the RER pipeline (e.g. adding parallel-mode resume, or changing what gets checkpointed), keep the "verify-hash-before-trusting" pattern, and update `computeChecksum`/`checkpointHash` writes in lockstep with any change to what's stored as a tab's `output`.
