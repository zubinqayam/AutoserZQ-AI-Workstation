// ── SMCBOS Browser API (interfaces only) ─────────────────────────────────────
// This defines the CONTRACT agents will use to drive browsers, so agents never
// touch the DOM directly. The real implementation (a server-side Playwright/CDP
// cluster streaming screenshots) is DEFERRED to a later SMCBOS phase because it
// requires an always-on Reserved VM. See docs/SMCBOS_ROADMAP.md.
//
// Today the only implementation is DeferredBrowserSession, which throws a clear
// "not yet implemented" error. Nothing in the app depends on it yet — it exists
// so future phases have a stable interface to build against.

export interface BrowserNavigateResult {
  url: string;
  status: number;
  title?: string;
}

export interface BrowserSearchResult {
  query: string;
  engine: string;
  url: string;
}

export interface BrowserExtractResult {
  url: string;
  text: string;
  html?: string;
}

export interface BrowserCaptureResult {
  url: string;
  screenshot: string; // base64 or asset path
  capturedAt: number;
}

export interface BrowserDownloadResult {
  url: string;
  path: string;
  bytes: number;
}

export interface BrowserUploadResult {
  ok: boolean;
  path: string;
}

export interface BrowserPerformanceResult {
  [metric: string]: number;
}

export interface IBrowserSession {
  navigate(url: string): Promise<BrowserNavigateResult>;
  search(query: string, engine?: string): Promise<BrowserSearchResult>;
  extract(selector?: string): Promise<BrowserExtractResult>;
  capture(): Promise<BrowserCaptureResult>;
  download(url: string): Promise<BrowserDownloadResult>;
  upload(localPath: string): Promise<BrowserUploadResult>;
  performance(): Promise<BrowserPerformanceResult>;
  close(): Promise<void>;
}

export interface IBrowserCluster {
  createSession(roomId: string): Promise<IBrowserSession>;
}

const DEFERRED_MSG =
  "Server-side browser cluster (Playwright/CDP) is deferred to a later SMCBOS phase — " +
  "it requires an always-on Reserved VM. See docs/SMCBOS_ROADMAP.md.";

export class DeferredBrowserSession implements IBrowserSession {
  async navigate(): Promise<BrowserNavigateResult> { throw new Error(DEFERRED_MSG); }
  async search(): Promise<BrowserSearchResult> { throw new Error(DEFERRED_MSG); }
  async extract(): Promise<BrowserExtractResult> { throw new Error(DEFERRED_MSG); }
  async capture(): Promise<BrowserCaptureResult> { throw new Error(DEFERRED_MSG); }
  async download(): Promise<BrowserDownloadResult> { throw new Error(DEFERRED_MSG); }
  async upload(): Promise<BrowserUploadResult> { throw new Error(DEFERRED_MSG); }
  async performance(): Promise<BrowserPerformanceResult> { throw new Error(DEFERRED_MSG); }
  async close(): Promise<void> { /* no-op */ }
}

export class DeferredBrowserCluster implements IBrowserCluster {
  async createSession(): Promise<IBrowserSession> {
    return new DeferredBrowserSession();
  }
}

export const browserCluster: IBrowserCluster = new DeferredBrowserCluster();
