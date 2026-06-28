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
- **Backend**: Express + WebSocket (ws) + in-memory storage (MemStorage)
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
- `SESSION_SECRET` — Session signing secret
- `PORT` — Server port (default: 5000)

## Command Center Shortcuts

- `@tab1 <url or search>` — Navigate Conference Room Panel 1
- `@tab2 <url or search>` — Navigate Conference Room Panel 2
- `@tab3 <url or search>` — Navigate Conference Room Panel 3
- `@tab4 <url or search>` — Navigate Conference Room Panel 4
- `@all <url or search>` — Navigate all 4 Conference Room panels
- `@rer <topic>` — Launch RER pipeline with current mode
- `@cr help` — Show Conference Room navigation guide (local, no API call)

## Conference Room: iframe-compatible sites
Works: DuckDuckGo, Bing, Wikipedia, Startpage, Brave Search, Archive.org, arXiv, Semantic Scholar, Stack Overflow, Medium, Substack, GitHub Pages, most docs/news sites.
Blocked: Google, Twitter/X, YouTube (use embed URL), Facebook, Reddit, LinkedIn, GitHub.com.
Google workaround: use `@tab1 https://www.startpage.com` (Google proxy that renders in iframe).

## Deployment

Build with `npm run build` then `npm run start`. The production bundle serves both API and client on port 5000.
