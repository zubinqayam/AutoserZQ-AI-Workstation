---
name: iframe block detection
description: Why Conference Room panels need a static known-blocked host list instead of relying on iframe load events, and which hosts are actually embeddable
---

# Detecting iframe-blocked sites (X-Frame-Options / CSP)

When a site refuses iframe embedding (X-Frame-Options / CSP), the browser still
renders its own "refused to connect" error page **inside** the iframe and **fires
the iframe's `onLoad` event**. So load-event-based detection is unreliable two ways:

1. A block timer armed on navigate gets cleared by the bogus `onLoad`, so the
   panel resets to `blocked:false` and shows a blank/error frame with no overlay.
2. `onLoad` itself falsely marks the panel "Ready".

**Rule:** maintain an explicit `hostBlocked(url)` known-blocked host list and set
`blocked:true` *immediately* on navigate for those hosts, skipping the load timer;
in `onLoad`, if `hostBlocked(tab.url)` is true, keep the blocked overlay rather
than marking Ready.

**Verified via live response headers (curl -I) on 2026-07-04 — do not trust
"commonly known to work" claims without checking, they go stale fast:**
- Actually embeddable (no X-Frame-Options / no restrictive frame-ancestors):
  `bing.com` (search results path), `wikipedia.org`, `archive.org`.
- Actually blocked (X-Frame-Options: SAMEORIGIN or CSP frame-ancestors 'self'/'none'),
  despite being widely assumed/documented as iframe-friendly: `duckduckgo.com`
  (including `lite.` and `html.` subdomains — all of them, not just the main page),
  `startpage.com`, `search.brave.com`, `perplexity.ai`, `arxiv.org`,
  `stackoverflow.com`/`stackexchange.com`, `medium.com`, `semanticscholar.org`.

**Why:** frame-embedding policies change over time and vary by exact path/subdomain
(e.g. duckduckgo's lite/no-JS endpoint was once embeddable but now sends the same
SAMEORIGIN header as the main site). Never hardcode a "known working" list from
memory or general assumption — re-verify with `curl -sI <url> | grep -i -E
"x-frame|frame-ancestors"` before shipping a Conference-Room-style iframe feature.

**How to apply:** when adding/changing default panel URLs or a search-engine
selector for an iframe-embedding feature, curl-check the exact URL (not just the
domain) for `X-Frame-Options` and CSP `frame-ancestors`, and keep the blocked-host
list, UI labels, and docs (help text, replit.md) all in sync.

The only real fix for embedding hard-blocked sites is a server-side headless
browser (Playwright) streaming screenshots — deferred as a Phase-2 item because it
needs an always-on Reserved VM (Autoscale scales to zero). See
`docs/SMCBOS_ROADMAP.md`.
