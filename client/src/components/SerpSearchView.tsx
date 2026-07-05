import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { SearchCode, Loader2, AlertCircle, ExternalLink, Globe } from "lucide-react";

interface SerpResult {
  position: number | null;
  title: string;
  link: string;
  displayedLink: string;
  snippet: string;
  favicon: string | null;
}

export default function SerpSearchView() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("United States");
  const [googleDomain, setGoogleDomain] = useState("google.com");
  const [hl, setHl] = useState("en");
  const [gl, setGl] = useState("us");
  const [results, setResults] = useState<SerpResult[] | null>(null);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    if (!query.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/serp/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query.trim(),
          location: location.trim(),
          google_domain: googleDomain.trim(),
          hl: hl.trim(),
          gl: gl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults(null);
        setTotalResults(null);
        setError(data.error || `Search failed (HTTP ${res.status})`);
        return;
      }
      setResults(data.results || []);
      setTotalResults(typeof data.totalResults === "number" ? data.totalResults : null);
    } catch (err: any) {
      setResults(null);
      setTotalResults(null);
      setError(err.message || "Search failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border bg-card/50 flex-shrink-0 space-y-3">
        <div className="flex items-center gap-2">
          <SearchCode className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-card-foreground">ZQ Conference Room SERP</h2>
          <Badge variant="secondary" className="text-[10px]">Real Google Search</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input
            className="flex-1 min-w-[200px] h-9 text-sm"
            placeholder="Search Google…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            data-testid="input-serp-query"
          />
          <Button onClick={runSearch} disabled={!query.trim() || isLoading} className="gap-2" data-testid="button-serp-search">
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SearchCode className="w-3.5 h-3.5" />}
            Search
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground">Location</label>
            <Input className="h-7 w-36 text-xs" value={location} onChange={(e) => setLocation(e.target.value)} data-testid="input-serp-location" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground">Google domain</label>
            <Input className="h-7 w-32 text-xs" value={googleDomain} onChange={(e) => setGoogleDomain(e.target.value)} data-testid="input-serp-domain" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground">Language (hl)</label>
            <Input className="h-7 w-20 text-xs" value={hl} onChange={(e) => setHl(e.target.value)} data-testid="input-serp-hl" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground">Country (gl)</label>
            <Input className="h-7 w-20 text-xs" value={gl} onChange={(e) => setGl(e.target.value)} data-testid="input-serp-gl" />
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 max-w-3xl mx-auto space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center" data-testid="status-serp-loading">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching Google…
            </div>
          )}

          {!isLoading && error && (
            <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 rounded-lg p-3 text-sm text-destructive" data-testid="text-serp-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!isLoading && !error && results && results.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8" data-testid="text-serp-empty">
              No results found.
            </div>
          )}

          {!isLoading && !error && results && results.length > 0 && (
            <>
              {totalResults !== null && (
                <p className="text-xs text-muted-foreground" data-testid="text-serp-total">
                  About {totalResults.toLocaleString()} results
                </p>
              )}
              {results.map((r, i) => (
                <a
                  key={`${r.link}-${i}`}
                  href={r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border border-border rounded-lg p-3 hover-elevate active-elevate-2"
                  data-testid={`link-serp-result-${i}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 min-w-0">
                    {r.favicon ? (
                      <img src={r.favicon} alt="" className="w-3.5 h-3.5 rounded-sm flex-shrink-0" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-[11px] text-muted-foreground truncate">{r.displayedLink || r.link}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-medium text-primary truncate">{r.title}</h3>
                    <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  </div>
                  {r.snippet && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{r.snippet}</p>
                  )}
                </a>
              ))}
            </>
          )}

          {!isLoading && !error && !results && (
            <div className="text-center text-sm text-muted-foreground py-8" data-testid="text-serp-placeholder">
              Enter a query above to search Google.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
