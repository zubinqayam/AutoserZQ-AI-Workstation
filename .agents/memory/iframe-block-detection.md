---
name: iframe block detection
description: Why Conference Room panels need a static known-blocked host list instead of relying on iframe load events
---

# Detecting iframe-blocked sites (X-Frame-Options / CSP)

When a site refuses iframe embedding (X-Frame-Options / CSP), the browser still
renders its own "refused to connect" error page **inside** the iframe and **fires
the iframe's `onLoad` event**. So load-event-based detection is unreliable two ways:

1. A block timer armed on navigate gets cleared by the bogus `onLoad`, so the
   panel resets to `blocked:false` and shows a blank/error frame with no overlay.
2. `onLoad` itself falsely marks the panel "Ready".

**Rule:** maintain an explicit `hostBlocked(url)` known-blocked host list
(google., youtube, twitter/x, facebook, instagram, reddit, linkedin, github.com,
bing.com, amazon, netflix, and the main `duckduckgo.com` page). Set `blocked:true`
*immediately* on navigate for those hosts and skip the load timer; and in `onLoad`,
if `hostBlocked(tab.url)` is true, keep the blocked overlay rather than marking Ready.

**Embeddable alternatives** that DO frame: `lite.duckduckgo.com/lite/`, Wikipedia,
arxiv.org, archive.org, Startpage, Brave Search, Bing (search results path), most
docs/news sites. Use these as panel defaults.

**Why:** the only real fix for embedding hard-blocked sites is a server-side
headless browser (Playwright) streaming screenshots — deferred as a Phase-2 item
because it needs an always-on Reserved VM (Autoscale scales to zero). See
`docs/SMCBOS_ROADMAP.md`.
