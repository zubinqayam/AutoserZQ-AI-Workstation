# ZQ AI Workstation — SMCBOS Roadmap

> **Status:** Living roadmap document. Captures the architecture review of the
> "SMCBOS xv2.0 / v4.0" upgrade proposal and the agreed, staged path forward.
> This is a *roadmap*, not a commitment to a rewrite. We evolve the existing
> working platform incrementally rather than rebuilding it as an "operating system."

---

## 1. Review summary

The upgrade specification is **diagnostically excellent and prescriptively
over-scoped.** Its "Mapping Current Issues to Architecture" table correctly
identifies *why* the current pain points exist. Where it overreaches is jumping
from "fix these four real problems" to "rebuild as a Sovereign Multi-Agent
Cognitive Browser Operating System" with a Redis event bus, Playwright cluster,
vector DB, RFC-3161 evidence signing, and multi-tenant isolation.

Rough split of the document's value:
- **~20% — do now.** High value, low cost, mostly incremental.
- **~30% — do once there are real users.** Genuine value, needs an infra decision.
- **~50% — premature.** Enterprise vocabulary that costs months and ongoing
  infrastructure spend without moving the product at its current stage.

### What the spec gets right
1. **The iframe problem is architectural, not a bug.** X-Frame-Options / CSP
   cannot be bypassed client-side. The only real fix for embedding blocked sites
   (Google, YouTube, Reddit, etc.) is a **server-side headless browser
   (Playwright) streaming screenshots** to the UI.
2. **Stateless AI is the COA's core weakness.** Agents said they had "no
   visibility" because prompts carried no live workspace context. Correct
   diagnosis — fixed via context injection (see Phase 1 status).
3. **Workspace state should persist.** Refreshing shouldn't wipe panels/pipeline.

### The reality gap the spec ignores: Replit deployment
- **Autoscale deployments are stateless and scale to zero.** They cannot host a
  persistent Playwright browser pool, a Redis event bus, or long-lived "browser
  pods." When traffic drops, the machine (and every browser session) dies.
- Running even 4 headless Chromium instances streaming CDP/JPEG frames is
  **heavy and always-on** — that requires a **Reserved VM** (paid 24/7) with a
  real RAM/CPU budget. A multi-master pool with multi-tenant isolation is a
  serious infra operation, not a feature toggle.
- Therefore the spec's most valuable item (real browser streaming) is also its
  most expensive, and it fundamentally changes the hosting model and cost.

---

## 2. Staged roadmap

### Phase 1 — Foundation (in progress / mostly done)
Low cost, high leverage. No infra/cost change.

- [x] **AI workspace awareness.** Inject live Conference Room panel state +
  recent Command Center chat + RER pipeline state into COA agent prompts, plus
  full app knowledge (so agents can answer "why isn't X working").
- [x] **Honest blocked-panel handling.** Detect iframe-blocking hosts
  immediately (X-Frame-Options / CSP) and surface an "Open externally" path
  instead of a silent blank panel. Default panels use embeddable URLs.
- [x] **Persist workspace to Postgres.** Rooms, members, chat, room/workspace
  state, and the RER pipeline (tasks + agent outputs) now persist in Postgres so
  the workstation survives refresh, reconnect, and redeploy. (Daily rate-limit
  counters remain in-memory by design — they reset daily.)

### Phase 2 — Server-side browser streaming (needs a decision)
The one big-ticket item that deserves a real architecture discussion.

- [ ] **Playwright server-side proxy** for iframe-blocked sites, streaming
  screenshots/CDP frames over WebSocket to the panels.
- **Prerequisite:** move deployment to a **Reserved VM (always-on, paid)** — an
  Autoscale deployment cannot host persistent browser sessions.
- **Scope before building:** cost per always-on VM, concurrent-session limits,
  per-panel resource budget, and whether live browsing of blocked sites is core
  enough to the product to justify the ongoing spend.

### Phase 3 — Intelligence & orchestration (defer until product-market fit)
Solutions to scale/compliance problems not yet present. Revisit with real usage.

- [ ] Mission engine / mission DAG (structured execution objects)
- [ ] Unified event mesh (event-driven module decoupling)
- [ ] Shared cognitive memory + knowledge graph (reusable cross-mission knowledge)
- [ ] Evidence engine (screenshots/MHTML/HAR, hashing, optional signing)
- [ ] Enterprise governance + multi-tenant isolation

---

## 3. Issue → resolution mapping

| Reported issue | Root cause | Resolution | Phase |
|---|---|---|---|
| Blank browser panels | iframe X-Frame-Options / CSP | Immediate block detection + "Open externally"; embeddable defaults | 1 (done) |
| Blank panels (blocked sites) | Client cannot bypass CSP | Server-side Playwright streaming | 2 |
| AI lacks workspace awareness | Stateless prompts | Live context injection into agent prompts | 1 (done) |
| Workspace state lost on refresh | In-memory storage | Postgres persistence | 1 (done) |
| Agents operate independently | No shared state | Context injection now; shared memory later | 1 / 3 |
| Reports don't build on prior work | No long-term memory | Knowledge engine | 3 |

---

## 4. Guiding principle

**Evolve, don't rewrite.** Keep the existing UI and functionality working while
landing the spec's correct diagnoses incrementally. Only take on always-on
infrastructure (Phase 2) when the capability it unlocks is clearly core to the
product, and only take on Phase 3 complexity when real usage demands it.
