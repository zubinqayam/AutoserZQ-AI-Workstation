import { useState, useMemo, useEffect, useCallback } from "react";
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content: text }] }),
      });
      const data = await res.json();
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, topic, mode }),
      });
      if (!res.ok) throw new Error("Failed to start");
      // Auto-switch to RER view when pipeline starts
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
