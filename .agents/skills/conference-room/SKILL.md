# ZQ Conference Room — Web Navigation Skill

## What This Skill Does

Teaches the Supervisor AI and future agents everything needed to operate the ZQ Conference Room browser layer: iframe compatibility rules, navigation commands, Google workarounds, and research integration patterns.

---

## NAVIGATION COMMANDS

All commands are typed in the Command Center chat input:

| Command | Effect |
|---------|--------|
| `@tab1 <url or search>` | Navigate Panel 1 |
| `@tab2 <url or search>` | Navigate Panel 2 |
| `@tab3 <url or search>` | Navigate Panel 3 |
| `@tab4 <url or search>` | Navigate Panel 4 |
| `@all <url or search>` | Navigate all 4 panels |
| `@rer <topic>` | Launch RER research pipeline |
| `@cr help` | Show Conference Room quick-reference guide (local, no API call) |

**URL detection logic:**
- Input starting with `http://` or `https://` → loaded as direct URL
- Any other input → treated as a search query via the selected search engine

---

## IFRAME COMPATIBILITY MATRIX

### Confirmed BLOCKED (X-Frame-Options: DENY / SAMEORIGIN or CSP frame-ancestors)

| Site | Why Blocked | Workaround |
|------|-------------|------------|
| google.com | X-Frame-Options: SAMEORIGIN | Startpage.com, Bing, DuckDuckGo |
| gmail.com | X-Frame-Options: DENY | Open via ↗ external button |
| Google Docs / Drive | SAMEORIGIN + login redirect | Open via ↗ external button |
| Google Scholar | SAMEORIGIN | Use Semantic Scholar (semanticscholar.org) |
| twitter.com / x.com | X-Frame-Options: DENY | Open via ↗ external button |
| youtube.com | frame-ancestors 'self' | Use YouTube embed URLs (youtube.com/embed/ID) |
| facebook.com | DENY | Open via ↗ external button |
| instagram.com | DENY | Open via ↗ external button |
| linkedin.com | DENY | Open via ↗ external button |
| reddit.com | SAMEORIGIN | old.reddit.com sometimes works |
| github.com | DENY | raw.githubusercontent.com works; GitHub Pages (*.github.io) works |
| Most banks / fintech | DENY | Open via ↗ external button |

### Confirmed WORKING (iframe-friendly)

| Site | Notes |
|------|-------|
| duckduckgo.com | Full search, default engine, excellent |
| bing.com | Full search + image search |
| search.brave.com | Privacy-first, full featured |
| startpage.com | Google results proxy — renders in iframe |
| wikipedia.org | Full content, ideal for research |
| web.archive.org | Wayback Machine — access cached versions of blocked sites |
| arxiv.org | Full academic preprints |
| ssrn.com | Social science research network |
| semanticscholar.org | AI-powered academic search |
| pubmed.ncbi.nlm.nih.gov | Medical/life science research |
| docs.* (most) | MDN, ReadTheDocs, Docusaurus sites |
| stackoverflow.com | Full Q&A |
| stackexchange.com | Full network |
| medium.com | Most articles render |
| substack.com | Most newsletters render |
| *.github.io | GitHub Pages — fully embeddable |
| raw.githubusercontent.com | Raw file content |
| archive.org | Digital library, Wayback Machine |
| bbc.com | Most articles |
| reuters.com | Most articles |
| apnews.com | Most articles |
| theguardian.com | Most articles |

---

## GOOGLE WORKAROUNDS (in order of preference)

### 1. Startpage.com (BEST — Google results in iframe)
```
@tab1 https://www.startpage.com
```
Then type your query in Startpage's search bar. Renders Google results without X-Frame-Options block.

### 2. Wayback Machine cached pages
```
@tab1 https://web.archive.org/web/*/https://blocked-site.com/page
```
Replace `*` with a specific date like `20240101000000` for a particular snapshot.

### 3. External browser tab (always works)
Click the `↗` icon on any panel to open the current URL in a real browser tab. All sites load normally.

### 4. Google Scholar alternative
```
@tab1 https://www.semanticscholar.org/search?q=YOUR+QUERY
```
Semantic Scholar is fully iframe-compatible and indexes 200M+ academic papers.

### 5. YouTube embedding
YouTube's standard URLs block iframes. Use embed format:
```
@tab1 https://www.youtube.com/embed/VIDEO_ID
```

### 6. Search engine switching
Use the search engine dropdown at the top of the Conference Room to switch between:
- DuckDuckGo (default) — privacy, full results
- Bing — Microsoft index, image search
- Wikipedia — direct encyclopedia lookup
- Brave — independent index
- Startpage — Google proxy

---

## RESEARCH WORKFLOW PATTERNS

### Pattern A: Multi-source parallel research
```
@tab1 <topic>                                    (DuckDuckGo overview)
@tab2 https://en.wikipedia.org/wiki/<Topic>      (encyclopedia context)
@tab3 https://arxiv.org/search/?query=<topic>    (academic papers)
@tab4 https://semanticscholar.org/search?q=<t>  (citation network)
```

### Pattern B: Deep dive with Conference Room + RER
1. Open multiple sources in Conference Room panels
2. Copy key URLs or paste excerpts into Command Center chat
3. Attach URLs via the Link button (reads page content server-side)
4. Launch `@rer <topic>` — pipeline runs while you browse

### Pattern C: News monitoring
```
@tab1 <topic> site:reuters.com
@tab2 <topic> site:apnews.com
@tab3 <topic> site:bbc.com
@tab4 https://news.google.com/... (use ↗ to pop out)
```

### Pattern D: Academic research cascade
```
@tab1 https://arxiv.org/abs/<paper-id>           (primary paper)
@tab2 https://semanticscholar.org/paper/<id>     (citations)
@tab3 https://pubmed.ncbi.nlm.nih.gov/?term=<t> (related biomedical)
@tab4 https://ssrn.com/abstract=<id>             (social science angle)
```

---

## TECHNICAL ARCHITECTURE

### How the Conference Room panels work
- Each panel is an `<iframe>` element
- URL is set via `iframe.src` or a `sandbox` attribute combination
- Navigation commands fire `CustomEvent("zq-tab-navigate")` on `window`
- ConferenceRoom.tsx listens for this event and updates the relevant iframe src
- Each panel has its own URL state, navigation history (browser-managed), and controls

### Why iframes get blocked
Servers set `X-Frame-Options: DENY` or `SAMEORIGIN` in HTTP response headers, or use `Content-Security-Policy: frame-ancestors 'none'`. The browser enforces these before rendering. There is no client-side workaround — the block happens at the network/browser level.

### Server-side proxy approach (future enhancement)
To overcome iframe blocks, a server-side proxy can fetch the target URL and serve the HTML with headers stripped. Implementation requires:
1. A backend `/api/proxy?url=<target>` endpoint that fetches the URL server-side
2. Strips `X-Frame-Options` and `Content-Security-Policy` headers from the response
3. Rewrites relative URLs in HTML to absolute to preserve navigation
4. Serves the content as `text/html` from the same origin

**Caveats:** JavaScript-heavy SPAs (Google, Twitter) won't work even with header stripping. Login sessions won't transfer. Some sites detect proxy headers. Best for static/article content.

### @cr help command flow
1. User types `@cr help` in Command Center
2. `tryTabRoute()` intercepts before the API call
3. Fires `CustomEvent("zq-cr-help")` with the help text
4. ConferenceRoom.tsx listener receives the event
5. Injects help text as an AI message via `sendMessage()` — no API call, no rate limit consumed

---

## FUTURE IMPROVEMENTS TO RESEARCH

Based on deep research into browser automation, iframe security, and web scraping:

1. **Server-side HTML proxy** — strip X-Frame headers for article/documentation content
2. **Puppeteer/Playwright integration** — screenshot renderer for blocked sites
3. **Readability extraction** — server-side `@mozilla/readability` to extract article text from any URL and display in a clean reader panel
4. **Search API integrations** — Brave Search API, SerpAPI for Google results without iframe
5. **PDF viewer** — embed PDF.js for academic paper rendering
6. **Google Search via SerpAPI** — route `@tab* google:<query>` to SerpAPI backend and render structured results
7. **Collaborative bookmarks** — shared URL bookmark list per room, persisted server-side
8. **Panel layout options** — toggle between 2×2, 1+3, 1 large panel modes
