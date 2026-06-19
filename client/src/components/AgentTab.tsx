import { useState } from "react";
import {
  ExternalLink, Loader2, CheckCircle2, XCircle, Clock,
  Copy, Check, Maximize2, X, Key, Wifi, WifiOff,
  ChevronDown, ChevronUp, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { RerAgentOutput } from "@shared/schema";

export const TAB_CONFIG = [
  {
    tabNum: 1,
    label: "Researcher",
    tag: "TAB 01",
    role: "researcher",
    service: "Google Scholar",
    serviceUrl: "https://scholar.google.com",
    aiService: "Gemini",
    aiUrl: "https://gemini.google.com",
    badgeCls: "bg-blue-500/15 text-blue-500 border-blue-500/25",
    dotCls: "bg-blue-500",
    steps: ["Review Topic", "Deep Research", "Enhance", "Research Report →"],
    description: "Researches topic from scratch",
    receives: "Raw topic",
    passes: "Research Foundation Report",
  },
  {
    tabNum: 2,
    label: "Reviewer",
    tag: "TAB 02",
    role: "reviewer",
    service: "Semantic Scholar",
    serviceUrl: "https://www.semanticscholar.org",
    aiService: "ChatGPT",
    aiUrl: "https://chat.openai.com",
    badgeCls: "bg-amber-500/15 text-amber-500 border-amber-500/25",
    dotCls: "bg-amber-500",
    steps: ["Review Tab 1 Report", "Deep Research", "Enhance", "Review Report →"],
    description: "Reviews & strengthens Tab 1's report",
    receives: "Tab 1 Research Report",
    passes: "Enhanced Review Report",
  },
  {
    tabNum: 3,
    label: "Enhancer",
    tag: "TAB 03",
    role: "enhancer",
    service: "Perplexity AI",
    serviceUrl: "https://www.perplexity.ai",
    aiService: "Perplexity",
    aiUrl: "https://www.perplexity.ai",
    badgeCls: "bg-purple-500/15 text-purple-500 border-purple-500/25",
    dotCls: "bg-purple-500",
    steps: ["Review Tab 2 Report", "Deep Research", "Synthesize", "Synthesis Report →"],
    description: "Synthesizes all findings so far",
    receives: "Tab 2 Enhanced Report",
    passes: "Synthesis Report",
  },
  {
    tabNum: 4,
    label: "Reporter",
    tag: "TAB 04",
    role: "reporter",
    service: "Gemini",
    serviceUrl: "https://gemini.google.com",
    aiService: "Gemini",
    aiUrl: "https://gemini.google.com",
    badgeCls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
    dotCls: "bg-emerald-500",
    steps: ["Review Tab 3 Report", "Final Deep Research", "Final Enhance", "FINAL REPORT"],
    description: "Produces the final comprehensive report",
    receives: "Tab 3 Synthesis Report",
    passes: "Final Report (end of pipeline)",
  },
];

interface AgentTabProps {
  index: number;
  agentOutput?: RerAgentOutput | null;
  isActive?: boolean;
  credentials?: string;
  onCredentialsChange?: (creds: string) => void;
}

export default function AgentTab({ index, agentOutput, isActive, credentials, onCredentialsChange }: AgentTabProps) {
  const { toast } = useToast();
  const cfg = TAB_CONFIG[index];
  const status = agentOutput?.status ?? "idle";

  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [credInput, setCredInput] = useState(credentials || "");

  const wordCount = agentOutput?.output?.split(/\s+/).filter(Boolean).length ?? 0;
  const hasCredentials = !!credentials;

  const handleCopy = async () => {
    if (!agentOutput?.output) return;
    await navigator.clipboard.writeText(agentOutput.output);
    setCopied(true);
    toast({ title: `Tab ${index + 1} output copied` });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveCreds = () => {
    onCredentialsChange?.(credInput);
    setShowCreds(false);
    toast({ title: "Credentials saved", description: `Tab ${index + 1} will use these to authenticate` });
  };

  // ── Fullscreen modal ──
  if (fullscreen && agentOutput?.output) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid={`fullscreen-${index}`}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-wrap gap-2">
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${cfg.badgeCls}`}>{cfg.tag}</span>
          <span className="font-semibold text-sm text-card-foreground">{cfg.label}</span>
          <span className="text-xs text-muted-foreground">— Full Output</span>
          <span className="text-xs text-muted-foreground ml-1">({wordCount.toLocaleString()} words)</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy all"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setFullscreen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <MarkdownContent text={agentOutput.output} />
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col border rounded-xl bg-card overflow-hidden transition-all duration-200 ${
        isActive ? "border-primary/60 shadow-sm" : "border-border"
      }`}
      data-testid={`agent-tab-${index}`}
    >
      {/* ── Header ── */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border flex-shrink-0 ${cfg.badgeCls}`}>
          {cfg.tag}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-card-foreground">{cfg.label}</span>
          <p className="text-xs text-muted-foreground truncate">{cfg.description}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* ── Pipeline flow indicator ── */}
      <div className="px-3 py-1.5 border-b border-border bg-muted/20 flex items-center gap-1 overflow-x-auto">
        {cfg.steps.map((step, si) => (
          <div key={si} className="flex items-center gap-1 flex-shrink-0">
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              status === "done"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : status === "thinking" && si === 1
                ? "bg-primary/15 text-primary animate-pulse"
                : "bg-muted text-muted-foreground"
            }`}>
              {step}
            </span>
            {si < cfg.steps.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50 flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* ── Web AI connection row ── */}
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dotCls}`} />
        <span className="text-xs text-muted-foreground truncate flex-1">{cfg.aiService} — {cfg.serviceUrl}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {hasCredentials
            ? <span className="flex items-center gap-1 text-xs text-emerald-500"><Wifi className="w-3 h-3" />Auth</span>
            : <span className="flex items-center gap-1 text-xs text-muted-foreground"><WifiOff className="w-3 h-3" />Free</span>
          }
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs gap-1"
            onClick={() => setShowCreds(!showCreds)}
            data-testid={`button-creds-${index}`}
          >
            <Key className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs gap-1"
            onClick={() => window.open(cfg.aiUrl, "_blank")}
            data-testid={`button-open-${index}`}
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* ── Credentials input ── */}
      {showCreds && (
        <div className="px-3 py-2 border-b border-border bg-muted/20 space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">API key or credentials for {cfg.aiService}:</p>
          <div className="flex gap-1.5">
            <Input
              type="password"
              value={credInput}
              onChange={e => setCredInput(e.target.value)}
              placeholder={`${cfg.aiService} API key…`}
              className="h-7 text-xs flex-1"
              data-testid={`input-creds-${index}`}
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSaveCreds}>Save</Button>
          </div>
          <p className="text-xs text-muted-foreground/60">Without credentials, free/default AI is used for this tab.</p>
        </div>
      )}

      {/* ── Received from row ── */}
      <div className="px-3 py-1 border-b border-border flex items-center gap-2 bg-background/30">
        <span className="text-xs text-muted-foreground flex-shrink-0">Receives:</span>
        <span className="text-xs text-foreground/60 truncate">{cfg.receives}</span>
        {agentOutput?.receivedInput && status !== "idle" && (
          <span className="text-xs text-primary ml-auto flex-shrink-0">✓ received</span>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center flex-1 p-4 gap-2 text-center min-h-[140px]">
            <Clock className="w-6 h-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Waiting for pipeline to reach this tab</p>
          </div>
        )}

        {status === "thinking" && (
          <div className="flex flex-col items-center justify-center flex-1 p-4 gap-3 min-h-[140px]">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <div className="text-center">
              <p className="text-xs font-medium text-card-foreground">Running full cycle…</p>
              <p className="text-xs text-muted-foreground mt-0.5">Review → Deep Research → Enhance → Report</p>
            </div>
            {agentOutput?.receivedInput && (
              <div className="w-full bg-muted/30 rounded-lg p-2 border border-border text-left">
                <p className="text-xs text-muted-foreground font-medium mb-0.5">Input from previous tab:</p>
                <p className="text-xs text-foreground/60 line-clamp-3 leading-relaxed">{agentOutput.receivedInput}</p>
              </div>
            )}
          </div>
        )}

        {(status === "done" || status === "error") && agentOutput?.output && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* output toolbar */}
            <div className="px-3 py-1.5 border-b border-border flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1">
                {status === "done" ? `${wordCount.toLocaleString()} words` : "Error"}
              </span>
              <span className="text-xs text-muted-foreground flex-shrink-0">Passes: {cfg.passes}</span>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 gap-1 text-xs" onClick={handleCopy}>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 gap-1 text-xs"
                onClick={() => setFullscreen(true)}
                data-testid={`button-fullscreen-${index}`}
              >
                <Maximize2 className="w-3 h-3" />
                Full
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>

            <ScrollArea className={expanded ? "flex-1 max-h-[320px]" : "max-h-[180px]"}>
              <div className="p-3">
                <MarkdownContent text={expanded ? agentOutput.output : agentOutput.output.slice(0, 600)} />
                {!expanded && agentOutput.output.length > 600 && (
                  <button
                    className="mt-2 text-xs text-primary hover:underline block"
                    onClick={() => setExpanded(true)}
                  >
                    Show more — {wordCount.toLocaleString()} words total (or click Full)
                  </button>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Status badge ──
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    idle:     { icon: <Clock className="w-3 h-3" />,                 label: "Waiting",  cls: "text-muted-foreground" },
    thinking: { icon: <Loader2 className="w-3 h-3 animate-spin" />,  label: "Working…", cls: "text-primary" },
    done:     { icon: <CheckCircle2 className="w-3 h-3" />,          label: "Done",     cls: "text-emerald-500" },
    error:    { icon: <XCircle className="w-3 h-3" />,               label: "Error",    cls: "text-destructive" },
  };
  const s = map[status] ?? map.idle;
  return (
    <div className={`flex items-center gap-1 flex-shrink-0 ${s.cls}`}>
      {s.icon}
      <span className="text-xs">{s.label}</span>
    </div>
  );
}

// ── Simple markdown renderer ──
function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="text-xs leading-relaxed space-y-1 font-sans">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("# "))   return <h1 key={i} className="text-sm font-bold text-card-foreground mt-3 mb-1 border-b border-border pb-1">{line.slice(2)}</h1>;
        if (line.startsWith("## "))  return <h2 key={i} className="text-xs font-semibold text-card-foreground mt-2.5 mb-0.5">{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="text-xs font-semibold text-muted-foreground mt-2 mb-0.5">{line.slice(4)}</h3>;
        if (line.startsWith("---"))  return <hr key={i} className="border-border my-2" />;
        if (line.startsWith("- ") || line.startsWith("* "))
          return <div key={i} className="flex gap-2 pl-1"><span className="text-muted-foreground mt-0.5 flex-shrink-0">•</span><span className="text-foreground/80">{renderInline(line.slice(2))}</span></div>;
        if (/^\d+\.\s/.test(line)) {
          const m = line.match(/^(\d+)\.\s(.+)/);
          return <div key={i} className="flex gap-2 pl-1"><span className="text-muted-foreground flex-shrink-0 font-mono w-4">{m?.[1]}.</span><span className="text-foreground/80">{renderInline(m?.[2] || "")}</span></div>;
        }
        if (line.trim() === "") return <div key={i} className="h-0.5" />;
        return <p key={i} className="text-foreground/80">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-card-foreground">{part.slice(2, -2)}</strong>
      : part
  );
}
