import { ExternalLink, Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import type { RerAgentOutput } from "@shared/schema";

const ROLE_CONFIG = {
  researcher: {
    label: "Researcher",
    color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
    icon: "01",
    site: "https://scholar.google.com",
    siteLabel: "Google Scholar",
    description: "Conducts initial deep research on the topic",
  },
  reviewer: {
    label: "Reviewer",
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
    icon: "02",
    site: "https://www.semanticscholar.org",
    siteLabel: "Semantic Scholar",
    description: "Reviews and critically analyzes research findings",
  },
  enhancer: {
    label: "Enhancer",
    color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
    icon: "03",
    site: "https://www.perplexity.ai",
    siteLabel: "Perplexity AI",
    description: "Enhances and synthesizes all findings",
  },
  reporter: {
    label: "Reporter",
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    icon: "04",
    site: "https://gemini.google.com",
    siteLabel: "Gemini",
    description: "Produces the final polished research report",
  },
};

interface AgentTabProps {
  index: number;
  agentOutput?: RerAgentOutput | null;
  isActive?: boolean;
}

export default function AgentTab({ index, agentOutput, isActive }: AgentTabProps) {
  const [outputExpanded, setOutputExpanded] = useState(false);
  const role = (agentOutput?.role || ["researcher","reviewer","enhancer","reporter"][index]) as keyof typeof ROLE_CONFIG;
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.researcher;
  const status = agentOutput?.status || "idle";

  const statusIcon = {
    idle: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
    thinking: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
    done: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
    error: <XCircle className="w-3.5 h-3.5 text-destructive" />,
  }[status];

  const statusLabel = {
    idle: "Waiting",
    thinking: "Working…",
    done: "Done",
    error: "Error",
  }[status];

  const outputPreview = agentOutput?.output
    ? agentOutput.output.slice(0, 300) + (agentOutput.output.length > 300 ? "…" : "")
    : null;

  return (
    <div
      className={`flex flex-col border rounded-xl bg-card overflow-hidden transition-all ${
        isActive ? "border-primary/50 shadow-sm" : "border-border"
      }`}
      data-testid={`agent-tab-${index}`}
    >
      {/* Tab Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${config.color}`}>
          {config.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-card-foreground">{config.label}</span>
            {status === "thinking" && (
              <span className="text-xs text-muted-foreground animate-pulse">Processing…</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{config.description}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {statusIcon}
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>
      </div>

      {/* Website Link Bar */}
      <div className="px-3 py-1.5 bg-background/40 border-b border-border flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-border" />
        <span className="text-xs text-muted-foreground flex-1 truncate">{config.site}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={() => window.open(config.site, "_blank")}
          data-testid={`button-open-site-${index}`}
        >
          <ExternalLink className="w-3 h-3" />
          {config.siteLabel}
        </Button>
      </div>

      {/* Output Area */}
      <div className="flex-1 min-h-0">
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-2 text-center">
            <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">Waiting for task assignment</p>
          </div>
        )}

        {status === "thinking" && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-3 text-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <div>
              <p className="text-sm font-medium text-card-foreground">Agent is working…</p>
              <p className="text-xs text-muted-foreground mt-1">Generating research output</p>
            </div>
            {agentOutput?.receivedInput && (
              <div className="mt-2 w-full text-left bg-muted/30 rounded-lg p-2">
                <p className="text-xs text-muted-foreground font-medium mb-1">Received input:</p>
                <p className="text-xs text-foreground/70 line-clamp-3">{agentOutput.receivedInput.slice(0, 150)}…</p>
              </div>
            )}
          </div>
        )}

        {(status === "done" || status === "error") && agentOutput?.output && (
          <div className="flex flex-col h-full">
            <div
              className="px-3 py-2 border-b border-border flex items-center justify-between cursor-pointer hover-elevate"
              onClick={() => setOutputExpanded(!outputExpanded)}
            >
              <span className="text-xs font-medium text-muted-foreground">
                {status === "done" ? "Agent Output" : "Error"}
              </span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                {outputExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>

            {outputExpanded ? (
              <ScrollArea className="flex-1 p-3">
                <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                  {agentOutput.output}
                </pre>
              </ScrollArea>
            ) : (
              <div className="p-3 flex-1">
                <p className="text-xs text-foreground/80 leading-relaxed line-clamp-6">
                  {outputPreview}
                </p>
                <button
                  className="text-xs text-primary mt-2 hover:underline"
                  onClick={() => setOutputExpanded(true)}
                >
                  Show full output
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
