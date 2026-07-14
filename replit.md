# ZQ Workstation

A 4-tab multi-agent research platform with the RER (Review → Enhance → Report) pipeline.

## Features

- **4-Tab RER Pipeline**: Tab1 (Researcher) → Tab2 (Reviewer) → Tab3 (Enhancer) → Tab4 (Reporter), each running a full Review → Deep Research → Enhance → Report cycle and passing their complete output forward
- **Command Center**: Supervisor AI chatbot sidecar with file/URL reading, voice input, camera capture, and attachment support
- **ZQ Conference Room**: 4-panel live browser execution layer (2×2 grid) with URL bars, navigation, search engine selector, and command log
- **ZQ Cognitive Overlay Agent (COA)**: Floating panel with 10 specialized agents (Thinker, Mr.Q, ALGA, DRM, Keyhole, Insight Sparker, Fundamentals Checker, Synthesis Expert, Critical Challenger, Evaluation Agent)
- **ALGA Intelligence Matrix**: Real-time audit dashboard (Legitimacy, Compliance, Source Integrity, Bias Detection, Coherence, Depth Analysis)
- **Real-time collaboration**: WebSocket-powered room system with member presence, chat, and state sync
- **Email-only auth** with guest mode and daily rate limiting per tier
- **Project folder management** in the left sidebar with localStorage persistence

## Architecture

- **Frontend**: React + Vite + Tailwind + shadcn/ui + TanStack Query + wouter
- **Backend**: Express + WebSocket (ws) + Postgres persistence (Drizzle ORM) for rooms, members, chat, workspace state, RER pipeline state, and persistent usage/budget ledgers
- **AI**: Google Gemini 2.5 Flash via `@google/genai`
- **Port**: 5000 (development and production)

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (tsx + Vite HMR) |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server (pre-built dist) |

## Environment Variables

- `GEMINI_API_KEY` — Google Gemini API key (required for AI features)
- `SERPAPI_KEY` — SerpAPI key (required for `/api/serp/search`)
- `SESSION_SECRET` — Session signing secret
- `PORT` — Server port (default: 5000)
- `GOOGLE_CLIENT_ID` — Google OAuth Client ID (optional, enables "Continue with Google")
- `GOOGLE_CLIENT_SECRET` — Google OAuth Client Secret (optional)
- `GITHUB_CLIENT_ID` — GitHub OAuth App Client ID (optional, enables "Continue with GitHub")
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App Client Secret (optional)
- `EXECUTION_PROFILE` — Gemini execution profile (`ECONOMY|STANDARD|DEEP|CRITICAL`, default `STANDARD`)
- `GEMINI_RER_THINKING_BUDGET` — Override RER thinking budget (default 5000)
- `GEMINI_RER_MAX_OUTPUT_TOKENS` — Override RER max output tokens (default 4096)
- `GEMINI_COA_THINKING_BUDGET` / `GEMINI_COA_MAX_OUTPUT_TOKENS` — COA execution overrides
- `GEMINI_SUPERVISOR_THINKING_BUDGET` / `GEMINI_SUPERVISOR_MAX_OUTPUT_TOKENS` — Command Center execution overrides
- `GEMINI_PIPELINE_MAX_CONCURRENCY` — Max concurrent Gemini RER tab calls (default 2)
- `ZERO_PAID_SPEND_MODE` — `true` disables new paid-provider calls platform-wide
- `BUDGET_KILL_SWITCH` — `true` administratively disables paid-provider calls
- `MONTHLY_BUDGET_CEILING_MICROS` — Monthly paid ceiling in integer micros (1 USD = 1,000,000 micros)
- `PRICING_MAX_AGE_DAYS` — Pricing-catalog staleness threshold

## Setting up Google Sign-In

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add Authorized redirect URI: `https://your-app.replit.app/api/auth/google/callback`
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to Replit Secrets

## Setting up GitHub Sign-In

1. Go to [GitHub Settings → Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Authorization callback URL: `https://your-app.replit.app/api/auth/github/callback`
4. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to Replit Secrets

## Command Center Shortcuts

- `@tab1 <url or search>` — Navigate Conference Room Panel 1
- `@tab2 <url or search>` — Navigate Conference Room Panel 2
- `@tab3 <url or search>` — Navigate Conference Room Panel 3
- `@tab4 <url or search>` — Navigate Conference Room Panel 4
- `@all <url or search>` — Navigate all 4 Conference Room panels
- `@rer <topic>` — Launch RER pipeline with current mode
- `@cr help` — Show Conference Room navigation guide (local, no API call)

## Conference Room: iframe-compatible sites
Works (verified via response headers — no X-Frame-Options/frame-ancestors restriction): Bing, Wikipedia, Archive.org, most docs/news sites without frame restrictions.
Blocked (X-Frame-Options: SAMEORIGIN or restrictive CSP frame-ancestors): Google, Twitter/X, YouTube (use embed URL), Facebook, Reddit, LinkedIn, GitHub.com, DuckDuckGo (all subdomains including lite/html), Startpage, Brave Search, Perplexity AI, arXiv, Stack Overflow, Medium, Semantic Scholar.
Workaround for blocked sites: use `@tab1 https://web.archive.org/web/*/URL` (cached copy) or the ↗ button to open the real site in a new tab.

## Deployment

Build with `npm run build` then `npm run start`. The production bundle serves both API and client on port 5000.
