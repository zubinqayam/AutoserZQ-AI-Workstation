import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import RoomSidebar from "@/components/RoomSidebar";
import AgentTab from "@/components/AgentTab";
import CommandCenter from "@/components/CommandCenter";
import COAOverlay from "@/components/COAOverlay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Share2, Lock, Unlock, Wifi, WifiOff, ArrowRight, Play, Zap,
  History, FlaskConical, GitBranch, Clock, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, Settings, BookOpen,
  Shield, Eye, Activity, Search, Brain, Cpu, Gauge,
  Monitor, ChevronLeft, ChevronRight, RefreshCw, Globe,
  RotateCcw, Terminal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { RerTask, RerAgentOutput } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";

const TAB_LABELS  = ["Researcher", "Reviewer", "Enhancer", "Reporter"];
const TAB_COLORS  = ["text-indigo-500", "text-orange-500", "text-emerald-500", "text-purple-500"];
const TAB_BORDER  = ["border-indigo-500/30", "border-orange-500/30", "border-emerald-500/30", "border-purple-500/30"];
const TAB_BG      = ["bg-indigo-500/5", "bg-orange-500/5", "bg-emerald-500/5", "bg-purple-500/5"];

export default function ConferenceRoom() {
  const { toast } = useToast();
  const [activeNav, setActiveNav] = useState("workspace");

  const roomId = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("room") || "zq-demo";
  }, []);

  const uid = useMemo(() => {
    let s = localStorage.getItem("zq_uid");
    if (!s) { s = `user-${Date.now()}`; localStorage.setItem("zq_uid", s); }
    return s;
  }, []);

  const displayName = useMemo(() =>
    localStorage.getItem("zq_displayName") || `User-${uid.slice(-4)}`, [uid]);

  const { connected, room, members, messages, roomState, rerTasks, sendMessage, joinRoom } = useWebSocket();

  const [tabCreds, setTabCreds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("zq_tabCreds") || "null") || ["","","",""]; }
    catch { return ["","","",""]; }
  });

  const updateCreds = (i: number, val: string) => {
    const next = [...tabCreds]; next[i] = val; setTabCreds(next);
    localStorage.setItem("zq_tabCreds", JSON.stringify(next));
  };

  useEffect(() => {
    if (connected) joinRoom(roomId, uid, displayName);
  }, [connected, roomId, uid, displayName, joinRoom]);

  const handleSendMessage = useCallback(async (text: string) => {
    sendMessage({ type: "chat", roomId, authorUid: uid, text, isAI: false });
    try {
      const history = messages.slice(-8).map(m => ({ role: m.authorUid === uid ? "user" : "assistant", content: m.text }));
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-uid": uid },
        body: JSON.stringify({ messages: [...history, { role: "user", content: text }] }),
      });
      const data = await res.json();
      if (res.status === 429) {
        toast({ title: "Daily limit reached", description: data.error || "Too many requests today. Resets tomorrow.", variant: "destructive" });
        return;
      }
      if (res.status === 401) {
        toast({ title: "Login required", description: "Please log in to use AI features.", variant: "destructive" });
        return;
      }
      if (data.text) sendMessage({ type: "chat", roomId, authorUid: "supervisor-ai", text: data.text, isAI: true });
    } catch (err) { console.error("Supervisor AI error:", err); }
  }, [sendMessage, roomId, uid, messages]);

  const handleStartRer = useCallback(async (topic: string, mode: "sequential" | "parallel") => {
    sendMessage({
      type: "chat", roomId, authorUid: "supervisor-ai",
      text: `Starting **${mode === "sequential" ? "Sequential" : "Parallel"}** RER Pipeline\n\nTopic: "${topic}"\n\nEach tab runs its own full cycle: Review → Deep Research → Enhance → Report`,
      isAI: true,
    });
    try {
      const res = await fetch("/api/rer/start", {
        method: "POST", headers: { "Content-Type": "application/json", "x-uid": uid },
        body: JSON.stringify({ roomId, topic, mode }),
      });
      const data = await res.json();
      if (res.status === 429) {
        toast({ title: "Daily limit reached", description: data.error || "Too many RER launches today.", variant: "destructive" });
        return;
      }
      if (res.status === 401) {
        toast({ title: "Login required", description: "Please log in to run the pipeline.", variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error("Failed to start");
      setActiveNav("rer");
    } catch { toast({ title: "Failed to start pipeline", variant: "destructive" }); }
  }, [sendMessage, roomId, toast]);

  const handleShare = async () => {
    const url = `${window.location.origin}/workspace?room=${encodeURIComponent(roomId)}`;
    try { await navigator.clipboard.writeText(url); toast({ title: "Room link copied!" }); }
    catch { toast({ title: "Share link", description: url }); }
  };

  const isOwner = room?.ownerUid === uid;
  const onlineCount = members.filter(m => Date.now() - new Date(m.lastSeen).getTime() < 60000).length;
  const activeTask = rerTasks.find(t => t.status === "running");
  const latestTask = rerTasks[0];
  const agentOutputs = latestTask?.agentOutputs ?? [];
  const activeTabIndex = activeTask
    ? agentOutputs.findIndex(o => o.status === "thinking") : -1;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <RoomSidebar
        roomId={roomId}
        membersOnline={onlineCount}
        activeNav={activeNav}
        onNavChange={setActiveNav}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="px-4 py-2.5 border-b border-border bg-card flex items-center gap-3 flex-shrink-0 flex-wrap gap-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-card-foreground">ZQ Workstation</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-xs text-muted-foreground font-mono">{roomId}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {connected ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5 text-destructive" />}
            <span className="text-xs text-muted-foreground">{onlineCount} online</span>
          </div>
          {activeTask && (
            <div className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
              <Play className="w-3 h-3" /> Pipeline running — Tab {activeTask.currentStep + 1}/4
            </div>
          )}
          {latestTask?.status === "done" && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Pipeline complete
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={handleShare} data-testid="button-share">
              <Share2 className="w-4 h-4" />
            </Button>
            {isOwner && (
              <Button variant="ghost" size="icon"
                onClick={() => sendMessage({ type: "lock", roomId, isOpen: !room?.isOpen })}
                data-testid="button-lock">
                {room?.isOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </header>

        {/* Main content area — switches based on activeNav */}
        <div className="flex-1 overflow-hidden min-h-0">
          {activeNav === "workspace" && (
            <WorkspaceView
              agentOutputs={agentOutputs}
              activeTabIndex={activeTabIndex}
              tabCreds={tabCreds}
              updateCreds={updateCreds}
              latestTask={latestTask}
            />
          )}
          {activeNav === "rer" && (
            <RerPipelineView
              rerTasks={rerTasks}
              onStartRer={handleStartRer}
              onNavChange={setActiveNav}
            />
          )}
          {activeNav === "conferenceroom" && <ConferenceRoomBrowserView />}
          {activeNav === "history" && <HistoryView rerTasks={rerTasks} />}
          {activeNav === "reports" && <ReportsView rerTasks={rerTasks} />}
          {activeNav === "github" && <GitHubView />}
          {activeNav === "settings" && <SettingsView />}
        </div>
      </div>

      <CommandCenter
        messages={messages}
        currentUserId={uid}
        roomId={roomId}
        rerTasks={rerTasks}
        onSendMessage={handleSendMessage}
        onStartRer={handleStartRer}
      />

      <COAOverlay rerTasks={rerTasks} />
    </div>
  );
}

// ── ALGA Intelligence Matrix ──────────────────────────────────────────────────
function AlgaMatrix({ agentOutputs, latestTask }: {
  agentOutputs: RerAgentOutput[];
  latestTask?: RerTask & { agentOutputs?: RerAgentOutput[] };
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 2000);
    return () => clearInterval(t);
  }, []);

  const isRunning = agentOutputs.some(a => a.status === "thinking");
  const doneCount = agentOutputs.filter(a => a.status === "done").length;

  const MATRIX_NODES = [
    { id: "legitimacy",  label: "Legitimacy Check",     Icon: Shield,   col: "#22c55e" },
    { id: "compliance",  label: "Compliance Scan",      Icon: CheckCircle2, col: "#3b82f6" },
    { id: "sourcing",    label: "Source Integrity",     Icon: Search,   col: "#a855f7" },
    { id: "bias",        label: "Bias Detection",       Icon: Eye,      col: "#f59e0b" },
    { id: "coherence",   label: "Coherence Score",      Icon: Brain,    col: "#06b6d4" },
    { id: "depth",       label: "Depth Analysis",       Icon: Activity, col: "#ec4899" },
  ];

  const getNodeStatus = (idx: number) => {
    if (!isRunning && doneCount === 0) return "idle";
    if (isRunning && doneCount <= idx) return "scanning";
    return "clear";
  };

  return (
    <div className="border border-border rounded-xl bg-card/60 p-3 flex-shrink-0" data-testid="alga-matrix">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "#22c55e20", border: "1px solid #22c55e40" }}>
          <Cpu className="w-3 h-3" style={{ color: "#22c55e" }} />
        </div>
        <span className="text-xs font-bold text-card-foreground tracking-wide">ALGA · Intelligence Matrix</span>
        <span className="text-[9px] font-mono text-muted-foreground/50 ml-1">Algorithmic Legitimacy & Governance Auditor</span>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-500 animate-pulse">
            <Activity className="w-3 h-3" />monitoring
          </span>
        )}
        {!isRunning && doneCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-500">
            <CheckCircle2 className="w-3 h-3" />audit complete
          </span>
        )}
        {!isRunning && doneCount === 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <Gauge className="w-3 h-3" />standby
          </span>
        )}
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {MATRIX_NODES.map((node, idx) => {
          const status = getNodeStatus(idx);
          return (
            <div key={node.id}
              className="flex flex-col items-center gap-1 p-1.5 rounded-lg border"
              style={{
                background: status === "idle" ? "transparent" : `${node.col}10`,
                borderColor: status === "idle" ? "var(--border)" : `${node.col}30`,
              }}
              data-testid={`alga-node-${node.id}`}
            >
              <div className="relative">
                <node.Icon
                  className="w-3.5 h-3.5"
                  style={{ color: status === "idle" ? "var(--muted-foreground)" : node.col, opacity: status === "idle" ? 0.3 : 1 }}
                />
                {status === "scanning" && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full animate-ping"
                    style={{ background: node.col }} />
                )}
              </div>
              <span className="text-[8px] font-medium text-center leading-tight"
                style={{ color: status === "idle" ? "var(--muted-foreground)" : node.col, opacity: status === "idle" ? 0.4 : 0.8 }}>
                {node.label}
              </span>
              <span className="text-[8px] font-mono"
                style={{ color: status === "idle" ? "var(--muted-foreground)" : node.col, opacity: status === "idle" ? 0.3 : 0.6 }}>
                {status === "idle" ? "—" : status === "scanning" ? "SCAN" : "PASS"}
              </span>
            </div>
          );
        })}
      </div>
      {latestTask && (
        <div className="mt-2 flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/30">
          <Eye className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">
            <span className="font-medium text-foreground/60">Monitoring:</span> {latestTask.topic}
          </span>
          {doneCount > 0 && (
            <span className="ml-auto text-[10px] text-emerald-500 font-mono flex-shrink-0">{doneCount}/4 verified</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Workspace View (4 agent tabs) ────────────────────────────────────────────
function WorkspaceView({ agentOutputs, activeTabIndex, tabCreds, updateCreds, latestTask }: {
  agentOutputs: RerAgentOutput[];
  activeTabIndex: number;
  tabCreds: string[];
  updateCreds: (i: number, v: string) => void;
  latestTask?: RerTask & { agentOutputs?: RerAgentOutput[] };
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Pipeline flow header */}
      <div className="px-4 py-2 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-2">RER Pipeline:</span>
          {["Tab 1 Research", "Tab 2 Review", "Tab 3 Enhance", "Tab 4 Final Report"].map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                agentOutputs[i]?.status === "done"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : agentOutputs[i]?.status === "thinking"
                  ? "bg-primary/10 text-primary border-primary/20 animate-pulse"
                  : "bg-muted text-muted-foreground border-border"
              }`}>{label}</span>
              {i < 3 && <ArrowRight className="w-3 h-3 text-muted-foreground/40" />}
            </div>
          ))}
          {latestTask && (
            <span className="ml-auto text-xs text-muted-foreground truncate max-w-[200px]">{latestTask.topic}</span>
          )}
        </div>
      </div>
      {/* ALGA Intelligence Matrix */}
      <div className="px-3 pt-2 flex-shrink-0">
        <AlgaMatrix agentOutputs={agentOutputs} latestTask={latestTask} />
      </div>
      <div className="flex-1 grid grid-cols-2 gap-3 p-3 overflow-auto min-h-0">
        {[0, 1, 2, 3].map((i) => (
          <AgentTab key={i} index={i} agentOutput={agentOutputs[i] ?? null}
            isActive={activeTabIndex === i} credentials={tabCreds[i]}
            onCredentialsChange={(c) => updateCreds(i, c)} />
        ))}
      </div>
    </div>
  );
}

// ── RER Pipeline View (dedicated page-like view) ─────────────────────────────
function RerPipelineView({ rerTasks, onStartRer, onNavChange }: {
  rerTasks: (RerTask & { agentOutputs?: RerAgentOutput[] })[];
  onStartRer: (topic: string, mode: "sequential" | "parallel") => void;
  onNavChange: (nav: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<"sequential" | "parallel">("sequential");
  const activeTask = rerTasks.find(t => t.status === "running");
  const latestTask = rerTasks[0];
  const agentOutputs = latestTask?.agentOutputs ?? [];

  const launch = () => {
    if (!topic.trim()) return;
    onStartRer(topic.trim(), mode);
    setTopic("");
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-card-foreground">RER Pipeline</h2>
            <Badge variant="secondary" className="text-[10px]">Review · Enhance · Report</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Four sequential AI agents, each running a complete research cycle — passing their full report forward.
          </p>
        </div>

        {/* Launch card */}
        <div className="border border-border rounded-xl bg-card p-5 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Launch new pipeline</p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
              placeholder="Enter research topic…"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === "Enter" && launch()}
              data-testid="input-rer-topic"
            />
            <Button onClick={launch} disabled={!topic.trim() || !!activeTask} className="gap-2" data-testid="btn-rer-launch">
              <Play className="w-3.5 h-3.5" /> Run RER
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {(["sequential", "parallel"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${mode === m ? "bg-primary text-white border-primary" : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"}`}
                data-testid={`btn-mode-${m}`}>
                {m === "sequential" ? "Sequential (1→2→3→4)" : "Parallel (all at once)"}
              </button>
            ))}
          </div>
          {activeTask && (
            <div className="flex items-center gap-2 text-xs text-primary">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Pipeline running — "{activeTask.topic}" — Tab {activeTask.currentStep + 1}/4
            </div>
          )}
        </div>

        {/* Current pipeline state */}
        {latestTask && (
          <div className="border border-border rounded-xl bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {activeTask ? "Pipeline Running" : "Latest Pipeline"}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                latestTask.status === "done" ? "bg-emerald-500/10 text-emerald-500"
                : latestTask.status === "running" ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
              }`}>{latestTask.status}</span>
            </div>
            <p className="text-sm font-semibold text-card-foreground">"{latestTask.topic}"</p>

            {/* 4-tab pipeline flow */}
            <div className="space-y-2">
              {[0,1,2,3].map(i => {
                const out = agentOutputs[i];
                const status = out?.status ?? "idle";
                const wc = out?.output?.split(/\s+/).filter(Boolean).length ?? 0;
                return (
                  <div key={i} className={`rounded-xl border p-3 transition-all ${TAB_BORDER[i]} ${TAB_BG[i]}`}>
                    <div className="flex items-center gap-3">
                      <div className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${TAB_BORDER[i]} ${TAB_BG[i]} ${TAB_COLORS[i]}`}>
                        TAB {String(i+1).padStart(2,"0")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${TAB_COLORS[i]}`}>{TAB_LABELS[i]}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {i === 0 ? "Receives raw topic" : `Receives Tab ${i} full report`}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {status === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        {status === "thinking" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                        {status === "error" && <AlertCircle className="w-4 h-4 text-destructive" />}
                        {(status === "idle" || !out) && <Clock className="w-4 h-4 text-muted-foreground/30" />}
                      </div>
                    </div>
                    {status === "thinking" && (
                      <div className="mt-2 flex gap-1">
                        {["Review","Deep Research","Enhance","Report"].map((s,j) => (
                          <div key={j} className="flex-1 h-1 rounded-full bg-primary/20 overflow-hidden">
                            <div className="h-full bg-primary/60 rounded-full w-1/2 animate-pulse" />
                          </div>
                        ))}
                      </div>
                    )}
                    {status === "done" && out?.output && (
                      <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                        {out.output.slice(0, 200)}…
                        <span className="text-primary ml-1">({wc.toLocaleString()} words)</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {latestTask.status === "done" && (
              <Button variant="outline" size="sm" className="text-xs gap-2" onClick={() => onNavChange("history")}>
                <History className="w-3.5 h-3.5" /> View full report in History
              </Button>
            )}
          </div>
        )}

        {/* How it works */}
        <div className="border border-border rounded-xl bg-card p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How RER works</p>
          <div className="space-y-2">
            {[
              { n: "01", title: "Researcher", desc: "Tab 1 receives your raw topic and runs a full Review → Research → Enhance → Report cycle. Produces: a complete initial research report." },
              { n: "02", title: "Reviewer", desc: "Tab 2 receives Tab 1's complete report. It critiques, gap-fills, and runs its own research cycle building on what it received." },
              { n: "03", title: "Enhancer", desc: "Tab 3 receives Tab 2's enhanced report. It synthesizes all findings, resolves conflicts, and deepens the analysis." },
              { n: "04", title: "Reporter", desc: "Tab 4 receives Tab 3's synthesis. It produces the final comprehensive report: structured, verified, and complete." },
            ].map(({ n, title, desc }, i) => (
              <div key={n} className="flex gap-3">
                <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 h-fit ${TAB_BORDER[i]} ${TAB_COLORS[i]} ${TAB_BG[i]}`}>{n}</div>
                <div>
                  <p className={`text-xs font-semibold ${TAB_COLORS[i]}`}>{title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

// ── History View ─────────────────────────────────────────────────────────────
function HistoryView({ rerTasks }: { rerTasks: (RerTask & { agentOutputs?: RerAgentOutput[] })[] }) {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const selected = rerTasks.find(t => t.id === selectedTask);

  if (rerTasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <History className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">No history yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Run your first RER pipeline to see results here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex min-h-0">
      {/* Task list */}
      <div className="w-64 border-r border-border flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Research History</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{rerTasks.length} pipeline{rerTasks.length !== 1 ? "s" : ""}</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {rerTasks.map(task => {
              const outputs = task.agentOutputs ?? [];
              const done = outputs.filter(o => o.status === "done").length;
              return (
                <button key={task.id}
                  className={`w-full text-left rounded-lg p-2.5 text-xs transition-colors hover-elevate ${selectedTask === task.id ? "bg-sidebar-accent" : ""}`}
                  onClick={() => setSelectedTask(task.id)}
                  data-testid={`history-task-${task.id}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {task.status === "done" && <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                    {task.status === "running" && <Loader2 className="w-3 h-3 text-primary animate-spin flex-shrink-0" />}
                    {task.status === "error" && <AlertCircle className="w-3 h-3 text-destructive flex-shrink-0" />}
                    <span className={`text-[10px] ${task.status === "done" ? "text-emerald-500" : task.status === "running" ? "text-primary" : "text-muted-foreground"}`}>
                      {task.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{done}/4 tabs</span>
                  </div>
                  <p className="font-semibold text-card-foreground truncate">{task.topic}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{task.mode} · {new Date(task.createdAt).toLocaleDateString()}</p>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Task detail */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Select a research session</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-card-foreground">"{selected.topic}"</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {selected.mode} mode · Started {new Date(selected.createdAt).toLocaleString()}
                  {selected.completedAt && ` · Completed ${new Date(selected.completedAt).toLocaleString()}`}
                </p>
              </div>
              {(selected.agentOutputs ?? []).map((output, i) => (
                <div key={i} className={`rounded-xl border p-4 ${TAB_BORDER[i]} ${TAB_BG[i]}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${TAB_BORDER[i]} ${TAB_COLORS[i]}`}>TAB {String(i+1).padStart(2,"0")}</span>
                    <span className={`text-xs font-bold ${TAB_COLORS[i]}`}>{TAB_LABELS[i]}</span>
                    {output.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {output.output && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {output.output.split(/\s+/).filter(Boolean).length.toLocaleString()} words
                      </span>
                    )}
                  </div>
                  {output.output ? (
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{output.output}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground/40 italic">No output</p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// ── Reports View ─────────────────────────────────────────────────────────────
function ReportsView({ rerTasks }: { rerTasks: (RerTask & { agentOutputs?: RerAgentOutput[] })[] }) {
  const completed = rerTasks.filter(t => t.status === "done");
  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div>
          <h2 className="text-lg font-bold text-card-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" /> Final Reports
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Complete Tab 4 final reports from all pipeline runs.</p>
        </div>
        {completed.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No completed pipelines yet</p>
          </div>
        ) : completed.map(task => {
          const finalOutput = (task.agentOutputs ?? [])[3];
          return (
            <div key={task.id} className="border border-border rounded-xl bg-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-card-foreground">"{task.topic}"</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{task.mode} · {new Date(task.createdAt).toLocaleDateString()}</p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              </div>
              {finalOutput?.output ? (
                <div>
                  <p className="text-[10px] font-semibold text-purple-400 mb-2 uppercase tracking-wide">Tab 04 — Reporter — Final Report</p>
                  <div className="max-h-48 overflow-hidden text-xs text-muted-foreground leading-relaxed relative">
                    <p className="whitespace-pre-wrap">{finalOutput.output.slice(0, 600)}</p>
                    {finalOutput.output.length > 600 && (
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent" />
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 mt-2">
                    {finalOutput.output.split(/\s+/).filter(Boolean).length.toLocaleString()} words total
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/40 italic">Final report not available</p>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ── GitHub Integration View ───────────────────────────────────────────────────
function GitHubView() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-sm text-center space-y-4">
        <div className="w-14 h-14 bg-card border border-border rounded-2xl flex items-center justify-center mx-auto">
          <GitBranch className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-bold text-card-foreground">GitHub Integration</h3>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Connect your GitHub account to version-control research reports, track changes across pipeline runs, and export findings to repositories.
          </p>
        </div>
        <div className="space-y-2 text-left bg-card border border-border rounded-xl p-4">
          {[
            "Auto-commit completed RER reports",
            "Branch per research topic",
            "Diff view across pipeline runs",
            "PR-based review workflow",
          ].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" /> {f}
            </div>
          ))}
        </div>
        <Button className="gap-2 w-full" onClick={() => window.open("https://github.com/settings/tokens", "_blank")}>
          <GitBranch className="w-4 h-4" /> Connect GitHub Account
          <ExternalLink className="w-3 h-3" />
        </Button>
        <p className="text-[10px] text-muted-foreground/40">
          Set GITHUB_TOKEN in environment secrets to enable full integration.
        </p>
      </div>
    </div>
  );
}

// ── ZQ Conference Room Browser View ───────────────────────────────────────────
const SEARCH_ENGINES: Record<string, string> = {
  duckduckgo: "https://duckduckgo.com/?q=",
  bing:       "https://www.bing.com/search?q=",
  wikipedia:  "https://en.wikipedia.org/wiki/Special:Search?search=",
  google:     "https://www.google.com/search?q=",
};
const DEFAULT_SEARCH = "duckduckgo";

const TAB_DEFAULTS = [
  { label: "Tab 1", url: "https://duckduckgo.com", color: "#6366f1" },
  { label: "Tab 2", url: "https://en.wikipedia.org/wiki/Main_Page", color: "#f97316" },
  { label: "Tab 3", url: "https://www.bing.com", color: "#10b981" },
  { label: "Tab 4", url: "https://duckduckgo.com", color: "#a855f7" },
];

interface BrowserTab {
  label: string;
  url: string;
  inputUrl: string;
  history: string[];
  histIdx: number;
  color: string;
  loading: boolean;
}

function toUrl(raw: string, engine: string = DEFAULT_SEARCH): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.\w{2,}(\/|$)/i.test(t)) return `https://${t}`;
  return (SEARCH_ENGINES[engine] || SEARCH_ENGINES.duckduckgo) + encodeURIComponent(t);
}

function ConferenceRoomBrowserView() {
  const [tabs, setTabs] = useState<BrowserTab[]>(
    TAB_DEFAULTS.map(d => ({ ...d, inputUrl: d.url, history: [d.url], histIdx: 0, loading: false }))
  );
  const [engine, setEngine] = useState<string>(DEFAULT_SEARCH);
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const iframeRefs = [
    useRef<HTMLIFrameElement>(null),
    useRef<HTMLIFrameElement>(null),
    useRef<HTMLIFrameElement>(null),
    useRef<HTMLIFrameElement>(null),
  ];

  const navigate = (tabIdx: number, rawUrl: string, fromCmd = false) => {
    const url = toUrl(rawUrl, engine);
    if (!url) return;
    setTabs(prev => prev.map((t, i) => {
      if (i !== tabIdx) return t;
      const hist = t.history.slice(0, t.histIdx + 1);
      return { ...t, url, inputUrl: url, history: [...hist, url], histIdx: hist.length, loading: true };
    }));
    if (fromCmd) {
      setLog(l => [`[${new Date().toLocaleTimeString()}] Tab ${tabIdx + 1} → ${url}`, ...l].slice(0, 50));
    }
  };

  const navigateAll = (rawUrl: string) => {
    const url = toUrl(rawUrl, engine);
    if (!url) return;
    setTabs(prev => prev.map(t => {
      const hist = t.history.slice(0, t.histIdx + 1);
      return { ...t, url, inputUrl: url, history: [...hist, url], histIdx: hist.length, loading: true };
    }));
    setLog(l => [`[${new Date().toLocaleTimeString()}] ALL TABS → ${url}`, ...l].slice(0, 50));
  };

  const goBack  = (i: number) => setTabs(prev => prev.map((t, idx) => {
    if (idx !== i || t.histIdx <= 0) return t;
    const ni = t.histIdx - 1;
    return { ...t, histIdx: ni, url: t.history[ni], inputUrl: t.history[ni], loading: true };
  }));
  const goFwd   = (i: number) => setTabs(prev => prev.map((t, idx) => {
    if (idx !== i || t.histIdx >= t.history.length - 1) return t;
    const ni = t.histIdx + 1;
    return { ...t, histIdx: ni, url: t.history[ni], inputUrl: t.history[ni], loading: true };
  }));
  const refresh = (i: number) => {
    setTabs(prev => prev.map((t, idx) => idx !== i ? t : { ...t, loading: true }));
    const ref = iframeRefs[i].current;
    if (ref) { try { ref.src = tabs[i].url; } catch {} }
  };
  const onLoad  = (i: number) => setTabs(prev => prev.map((t, idx) => idx !== i ? t : { ...t, loading: false }));

  const setLabel = (i: number, label: string) =>
    setTabs(prev => prev.map((t, idx) => idx !== i ? t : { ...t, label }));

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") navigate(i, tabs[i].inputUrl);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const { tab, url } = (e as CustomEvent).detail as { tab: number | "all"; url: string };
      if (tab === "all") { navigateAll(url); }
      else if (typeof tab === "number" && tab >= 1 && tab <= 4) { navigate(tab - 1, url, true); }
    };
    window.addEventListener("zq-tab-navigate", handler);
    return () => window.removeEventListener("zq-tab-navigate", handler);
  }, [engine]);

  const COLORS = ["indigo", "orange", "emerald", "purple"];
  const COLOR_HEX = ["#6366f1", "#f97316", "#10b981", "#a855f7"];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border bg-card/50 flex-shrink-0 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-xs font-bold text-card-foreground tracking-wide">ZQ Conference Room</span>
          <span className="text-[9px] text-muted-foreground font-mono">Execution Layer · 4 live browser panels</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Search engine:</span>
          <select
            className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground"
            value={engine}
            onChange={e => setEngine(e.target.value)}
            data-testid="select-search-engine"
          >
            <option value="duckduckgo">DuckDuckGo</option>
            <option value="bing">Bing</option>
            <option value="wikipedia">Wikipedia</option>
            <option value="google">Google</option>
          </select>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowLog(v => !v)} title="Command log">
            <Terminal className="w-3 h-3" />
          </Button>
        </div>
        <div className="w-full text-[9px] text-muted-foreground/50">
          Command Center: type <span className="font-mono bg-muted px-1 rounded">@tab1 google.com</span>, <span className="font-mono bg-muted px-1 rounded">@tab2 AI news</span>, or <span className="font-mono bg-muted px-1 rounded">@all wikipedia</span> to navigate panels simultaneously
        </div>
      </div>

      {showLog && log.length > 0 && (
        <div className="flex-shrink-0 border-b border-border bg-muted/30 px-4 py-2 max-h-24 overflow-y-auto">
          {log.map((l, i) => <p key={i} className="text-[9px] font-mono text-muted-foreground">{l}</p>)}
        </div>
      )}

      {/* 2×2 Browser Grid */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 p-2 min-h-0 overflow-hidden">
        {tabs.map((tab, i) => (
          <div key={i}
            className="flex flex-col rounded-xl border overflow-hidden min-h-0"
            style={{ borderColor: `${COLOR_HEX[i]}30` }}
            data-testid={`conference-tab-${i + 1}`}
          >
            {/* Tab toolbar */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b flex-shrink-0"
              style={{ background: `${COLOR_HEX[i]}08`, borderColor: `${COLOR_HEX[i]}20` }}>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md text-white flex-shrink-0"
                  style={{ background: COLOR_HEX[i] }}>
                  TAB {i + 1}
                </span>
                <input
                  value={tab.label}
                  onChange={e => setLabel(i, e.target.value)}
                  className="text-[9px] font-semibold bg-transparent border-none outline-none w-16 text-muted-foreground"
                  data-testid={`input-tab-label-${i + 1}`}
                />
              </div>
              <div className="flex items-center gap-0.5">
                <button onClick={() => goBack(i)} disabled={tab.histIdx <= 0}
                  className="p-0.5 rounded disabled:opacity-20 hover:bg-muted transition-colors">
                  <ChevronLeft className="w-3 h-3 text-muted-foreground" />
                </button>
                <button onClick={() => goFwd(i)} disabled={tab.histIdx >= tab.history.length - 1}
                  className="p-0.5 rounded disabled:opacity-20 hover:bg-muted transition-colors">
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </button>
                <button onClick={() => refresh(i)}
                  className="p-0.5 rounded hover:bg-muted transition-colors">
                  {tab.loading
                    ? <RotateCcw className="w-3 h-3 text-muted-foreground animate-spin" />
                    : <RefreshCw className="w-3 h-3 text-muted-foreground" />}
                </button>
              </div>
              <div className="flex-1 flex items-center gap-1 bg-background/80 border border-border/50 rounded-lg px-2 min-w-0">
                <Globe className="w-2.5 h-2.5 text-muted-foreground/40 flex-shrink-0" />
                <input
                  value={tab.inputUrl}
                  onChange={e => setTabs(prev => prev.map((t, idx) => idx !== i ? t : { ...t, inputUrl: e.target.value }))}
                  onKeyDown={e => handleKey(i, e)}
                  placeholder="Enter URL or search…"
                  className="flex-1 text-[9px] bg-transparent border-none outline-none text-muted-foreground min-w-0"
                  data-testid={`input-url-${i + 1}`}
                />
              </div>
              <button onClick={() => window.open(tab.url, "_blank")}
                className="p-0.5 rounded hover:bg-muted transition-colors flex-shrink-0"
                title="Open in real browser tab">
                <ExternalLink className="w-3 h-3 text-muted-foreground/60" />
              </button>
            </div>
            {/* Iframe */}
            <div className="flex-1 relative min-h-0">
              <iframe
                ref={iframeRefs[i]}
                src={tab.url}
                className="w-full h-full border-none"
                title={tab.label}
                onLoad={() => onLoad(i)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
                data-testid={`iframe-tab-${i + 1}`}
              />
              {tab.loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 pointer-events-none">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: COLOR_HEX[i] }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings View ─────────────────────────────────────────────────────────────
function SettingsView() {
  const user = (() => { try { return JSON.parse(localStorage.getItem("zq_user") || "null"); } catch { return null; } })();
  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-lg mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-bold text-card-foreground flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" /> Settings
          </h2>
        </div>
        <div className="border border-border rounded-xl bg-card p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">{(user?.displayName || "G").slice(0,1).toUpperCase()}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-card-foreground">{user?.displayName || "Guest"}</p>
              <p className="text-xs text-muted-foreground">{user?.email || "Guest session"}</p>
              <p className="text-[10px] text-muted-foreground/50">{user?.isGuest ? "Guest" : "Email"} account</p>
            </div>
          </div>
        </div>
        <div className="border border-border rounded-xl bg-card p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Services</p>
          {[
            { label: "Tab 1 — Researcher", service: "Gemini 2.5 Flash", status: "active" },
            { label: "Tab 2 — Reviewer",   service: "ChatGPT / GPT-4",  status: "pending" },
            { label: "Tab 3 — Enhancer",   service: "Perplexity AI",    status: "pending" },
            { label: "Tab 4 — Reporter",   service: "Gemini 2.5 Flash", status: "active" },
          ].map(({ label, service, status }) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <div>
                <p className="font-medium text-card-foreground">{label}</p>
                <p className="text-muted-foreground text-[10px]">{service}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
