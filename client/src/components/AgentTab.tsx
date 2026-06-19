import { useState } from "react";
import {
  ExternalLink, Loader2, CheckCircle2, XCircle, Clock,
  Copy, Check, ChevronDown, ChevronUp, Maximize2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { RerAgentOutput } from "@shared/schema";

const ROLE_CONFIG = {
  researcher: {
    label: "Researcher",
    tab: "TAB 01",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
    dot: "bg-blue-500",
    site: "https://scholar.google.com",
    siteLabel: "Google Scholar",
    stages: ["Research", "Self-Review", "Self-Enhance", "Research Report"],
    description: "Deep initial research on the topic",
  },
  reviewer: {
    label: "Reviewer",
    tab: "TAB 02",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
    site: "https://www.semanticscholar.org",
    siteLabel: "Semantic Scholar",
    stages: ["Review Research", "Self-Review", "Self-Enhance", "Review Report"],
    description: "Critical analysis & gap identification",
  },
  enhancer: {
    label: "Enhancer",
    tab: "TAB 03",
    badge: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
    dot: "bg-purple-500",
    site: "https://www.perplexity.ai",
    siteLabel: "Perplexity AI",
    stages: ["Research Enhancements", "Self-Review", "Enhance", "Enhanced Report"],
    description: "Synthesizes all findings into enhanced analysis",
  },
  reporter: {
    label: "Reporter",
    tab: "TAB 04",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
    site: "https://gemini.google.com",
    siteLabel: "Gemini",
    stages: ["Research Report", "Self-Review", "Enhance", "Final Detailed Report"],
    description: "Produces the final comprehensive report",
  },
};

type RoleKey = keyof typeof ROLE_CONFIG;

interface AgentTabProps {
  index: number;
  agentOutput?: RerAgentOutput | null;
  isActive?: boolean;
}

// Parse agent output into sections based on ## STAGE headers
function parseSections(text: string): { title: string; content: string }[] {
  const lines = text.split("\n");
  const sections: { title: string; content: string }[] = [];
  let current: { title: string; content: string } | null = null;

  for (const line of lines) {
    const stageMatch = line.match(/^##\s+STAGE\s+\d+[:\s]+(.+)/i);
    const h2Match = !stageMatch && line.match(/^##\s+(.+)/);
    const header = stageMatch?.[1] || h2Match?.[1];

    if (header) {
      if (current) sections.push(current);
      current = { title: header.trim(), content: "" };
    } else if (current) {
      current.content += line + "\n";
    } else {
      // Before first section
      if (!sections.length) {
        current = { title: "Output", content: line + "\n" };
      }
    }
  }
  if (current) sections.push(current);
  return sections.filter(s => s.content.trim());
}

export default function AgentTab({ index, agentOutput, isActive }: AgentTabProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeSection, setActiveSection] = useState(0);

  const roleKey = (agentOutput?.role || ["researcher", "reviewer", "enhancer", "reporter"][index]) as RoleKey;
  const config = ROLE_CONFIG[roleKey] ?? ROLE_CONFIG.researcher;
  const status = agentOutput?.status ?? "idle";

  const sections = agentOutput?.output ? parseSections(agentOutput.output) : [];
  const wordCount = agentOutput?.output
    ? agentOutput.output.split(/\s+/).filter(Boolean).length
    : 0;

  const handleCopy = async () => {
    if (!agentOutput?.output) return;
    await navigator.clipboard.writeText(agentOutput.output);
    setCopied(true);
    toast({ title: "Output copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const statusBadge = {
    idle:     { icon: <Clock className="w-3 h-3" />,                           label: "Waiting",    color: "text-muted-foreground" },
    thinking: { icon: <Loader2 className="w-3 h-3 animate-spin" />,             label: "Working…",  color: "text-primary" },
    done:     { icon: <CheckCircle2 className="w-3 h-3" />,                     label: "Done",       color: "text-emerald-500" },
    error:    { icon: <XCircle className="w-3 h-3" />,                          label: "Error",      color: "text-destructive" },
  }[status] ?? { icon: <Clock className="w-3 h-3" />, label: "—", color: "text-muted-foreground" };

  // Fullscreen modal
  if (fullscreen && agentOutput?.output) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid={`agent-tab-fullscreen-${index}`}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${config.badge}`}>{config.tab}</span>
          <span className="font-semibold text-sm text-card-foreground">{config.label} — Full Output</span>
          <Badge variant="secondary" className="text-xs">{wordCount.toLocaleString()} words</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setFullscreen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stage nav */}
        {sections.length > 1 && (
          <div className="flex gap-1 px-4 py-2 border-b border-border overflow-x-auto">
            {sections.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveSection(i)}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  activeSection === i
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        )}

        <ScrollArea className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            {sections.length > 1 ? (
              <MarkdownContent text={sections[activeSection]?.content || ""} />
            ) : (
              <MarkdownContent text={agentOutput.output} />
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col border rounded-xl bg-card overflow-hidden transition-all duration-200 ${
        isActive ? "border-primary/60 shadow-sm" : status === "done" ? "border-border" : "border-border"
      }`}
      data-testid={`agent-tab-${index}`}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border flex-shrink-0 ${config.badge}`}>
          {config.tab}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-card-foreground">{config.label}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{config.description}</p>
        </div>
        <div className={`flex items-center gap-1.5 flex-shrink-0 ${statusBadge.color}`}>
          {statusBadge.icon}
          <span className="text-xs">{statusBadge.label}</span>
        </div>
      </div>

      {/* Stage pills when done */}
      {status === "done" && sections.length > 0 && (
        <div className="px-3 py-1.5 border-b border-border flex gap-1 overflow-x-auto">
          {config.stages.map((stage, i) => (
            <span
              key={i}
              className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                i < sections.length
                  ? `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {stage}
            </span>
          ))}
        </div>
      )}

      {/* Website bar */}
      <div className="px-3 py-1.5 bg-background/30 border-b border-border flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dot}`} />
        <span className="text-xs text-muted-foreground flex-1 truncate">{config.site}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1 flex-shrink-0"
          onClick={() => window.open(config.site, "_blank")}
          data-testid={`button-open-site-${index}`}
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col">
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center flex-1 p-4 gap-2 text-center">
            <Clock className="w-6 h-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Waiting for task</p>
            <p className="text-xs text-muted-foreground/60">Assign a topic in the Command Center</p>
          </div>
        )}

        {status === "thinking" && (
          <div className="flex flex-col items-center justify-center flex-1 p-4 gap-3 text-center">
            <div className="relative">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            </div>
            <div>
              <p className="text-sm font-medium text-card-foreground">Running R→E→R cycle…</p>
              <p className="text-xs text-muted-foreground mt-0.5">Research · Review · Enhance · Report</p>
            </div>
            {agentOutput?.receivedInput && (
              <div className="mt-1 w-full text-left bg-muted/30 rounded-lg p-2.5 border border-border">
                <p className="text-xs font-medium text-muted-foreground mb-1">Input received from previous tab:</p>
                <p className="text-xs text-foreground/60 line-clamp-4 leading-relaxed">
                  {agentOutput.receivedInput.slice(0, 300)}…
                </p>
              </div>
            )}
          </div>
        )}

        {(status === "done" || status === "error") && agentOutput?.output && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Output toolbar */}
            <div className="px-3 py-1.5 border-b border-border flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground flex-1">
                {status === "done" ? `Output · ${wordCount.toLocaleString()} words` : "Error"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={handleCopy}
                data-testid={`button-copy-${index}`}
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => setFullscreen(true)}
                data-testid={`button-expand-${index}`}
              >
                <Maximize2 className="w-3 h-3" />
                Full
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setExpanded(!expanded)}
                data-testid={`button-toggle-${index}`}
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>

            <ScrollArea className={expanded ? "flex-1" : "max-h-[200px]"}>
              <div className="p-3">
                <MarkdownContent
                  text={agentOutput.output.slice(0, expanded ? undefined : 800)}
                />
                {!expanded && agentOutput.output.length > 800 && (
                  <button
                    className="mt-2 text-xs text-primary hover:underline"
                    onClick={() => setExpanded(true)}
                  >
                    Show more ({wordCount.toLocaleString()} words total) — or click Full for the complete report
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

// Simple markdown-to-jsx renderer for report output
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="text-xs leading-relaxed text-foreground space-y-1 font-sans">
      {lines.map((line, i) => {
        if (line.startsWith("# "))
          return <h1 key={i} className="text-base font-bold text-card-foreground mt-3 mb-1">{line.slice(2)}</h1>;
        if (line.startsWith("## "))
          return <h2 key={i} className="text-sm font-semibold text-card-foreground mt-3 mb-1 border-b border-border pb-0.5">{line.slice(3)}</h2>;
        if (line.startsWith("### "))
          return <h3 key={i} className="text-xs font-semibold text-card-foreground mt-2 mb-0.5">{line.slice(4)}</h3>;
        if (line.startsWith("**") && line.endsWith("**"))
          return <p key={i} className="font-semibold text-card-foreground">{line.slice(2, -2)}</p>;
        if (line.startsWith("- ") || line.startsWith("* "))
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-muted-foreground mt-0.5 flex-shrink-0">•</span>
              <span className="text-foreground/80">{inlineFormat(line.slice(2))}</span>
            </div>
          );
        if (/^\d+\.\s/.test(line)) {
          const match = line.match(/^(\d+)\.\s(.+)/);
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-muted-foreground flex-shrink-0 font-mono">{match?.[1]}.</span>
              <span className="text-foreground/80">{inlineFormat(match?.[2] || "")}</span>
            </div>
          );
        }
        if (line.startsWith("---") || line.startsWith("==="))
          return <hr key={i} className="border-border my-2" />;
        if (line.trim() === "")
          return <div key={i} className="h-1" />;
        return <p key={i} className="text-foreground/80">{inlineFormat(line)}</p>;
      })}
    </div>
  );
}

function inlineFormat(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-card-foreground">{part.slice(2, -2)}</strong>
      : part
  );
}
