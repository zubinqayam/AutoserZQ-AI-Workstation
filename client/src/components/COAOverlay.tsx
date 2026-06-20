import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  X, Minus, Maximize2, Send, Mic, MicOff,
  Sparkles, Eye, Volume2, VolumeX, Loader2, Brain, HelpCircle,
  Shield, Map, Zap, CheckCircle, Layers, Sword, Activity,
  Users, Key, Save, Trash2, CheckCircle2, AlertCircle,
} from "lucide-react";
import type { RerTask, RerAgentOutput } from "@shared/schema";

// ── Agent roster ──────────────────────────────────────────────────────────────
export const AGENTS = [
  { id: "thinker",    name: "Thinker",             color: "#818cf8", Icon: Brain,       tagline: "Cognitive reasoning" },
  { id: "mrq",        name: "Mr.Q",                color: "#f472b6", Icon: HelpCircle,  tagline: "Adversarial questioning" },
  { id: "alga",       name: "ALGA",                color: "#34d399", Icon: Shield,      tagline: "Legitimacy & compliance" },
  { id: "drm",        name: "DRM",                 color: "#fb923c", Icon: Map,         tagline: "Scenario analysis" },
  { id: "keyhole",    name: "Keyhole",              color: "#60a5fa", Icon: Eye,         tagline: "State introspection & API keys" },
  { id: "sparker",    name: "Insight Sparker",      color: "#fbbf24", Icon: Zap,         tagline: "Analogies & engagement" },
  { id: "checker",    name: "Fundamentals Checker", color: "#a78bfa", Icon: CheckCircle, tagline: "Verification & errors" },
  { id: "synthesis",  name: "Synthesis Expert",     color: "#2dd4bf", Icon: Layers,      tagline: "Integration & networks" },
  { id: "challenger", name: "Critical Challenger",  color: "#f87171", Icon: Sword,       tagline: "Cognitive tension" },
  { id: "evaluator",  name: "Evaluation Agent",     color: "#94a3b8", Icon: Activity,    tagline: "Assessment & scoring" },
] as const;

type AgentId = typeof AGENTS[number]["id"];

// ── API key definitions managed by Keyhole ────────────────────────────────────
const API_KEYS_CONFIG = [
  { id: "openai",     label: "OpenAI / GPT-4",      hint: "sk-...",         tab: "Tab 2 — Reviewer" },
  { id: "perplexity", label: "Perplexity AI",        hint: "pplx-...",       tab: "Tab 3 — Enhancer" },
  { id: "anthropic",  label: "Anthropic / Claude",   hint: "sk-ant-...",     tab: "Optional" },
  { id: "gemini",     label: "Google Gemini",        hint: "AIza...",        tab: "Tab 1 & 4 — active" },
  { id: "github",     label: "GitHub Token",         hint: "ghp_...",        tab: "Version control" },
  { id: "serpapi",    label: "SerpAPI (web search)", hint: "xxxxxxx...",     tab: "Deep research" },
];

interface COAMsg {
  id: string; role: "user" | "agent"; agentId?: AgentId;
  text: string; ts: Date; isProactive?: boolean;
}

interface COAOverlayProps {
  rerTasks: (RerTask & { agentOutputs?: RerAgentOutput[] })[];
}

const TAB_LABELS = ["Researcher", "Reviewer", "Enhancer", "Reporter"];

const QUICK = [
  { label: "What's happening?", msg: "What's happening right now in the pipeline?" },
  { label: "Rate research",     msg: "@evaluator Rate the research quality so far" },
  { label: "Challenge it",      msg: "@challenger What are the weaknesses?" },
  { label: "Synthesize",        msg: "@synthesis Connect all the findings so far" },
  { label: "Suggest more",      msg: "@sparker Suggest follow-up research topics" },
  { label: "Verify",            msg: "@checker Check for errors or weak claims" },
];

export default function COAOverlay({ rerTasks }: COAOverlayProps) {
  const [open, setOpen]           = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "agents" | "keys">("chat");
  const [pos, setPos]             = useState({ x: 200, y: 200 });
  const [posReady, setPosReady]   = useState(false);

  // Ensure initial position is set only once after mount
  useEffect(() => {
    setPos({
      x: Math.max(10, window.innerWidth - 420),
      y: Math.max(10, window.innerHeight - 560),
    });
    setPosReady(true);
  }, []);

  // ── Drag state ────────────────────────────────────────────────────────────
  const isDragging = useRef(false);
  const dragStart  = useRef({ mouseX: 0, mouseY: 0, panelX: 0, panelY: 0 });

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("button, input, textarea, [data-no-drag]")) return;
    e.preventDefault();
    isDragging.current = true;
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, panelX: pos.x, panelY: pos.y };
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 80, dragStart.current.panelX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 48, dragStart.current.panelY + dy)),
      });
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []); // empty deps — dragStart ref is always fresh

  // ── Chat state ────────────────────────────────────────────────────────────
  const [msgs, setMsgs]       = useState<COAMsg[]>([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [tts, setTts]         = useState(false);
  const [unread, setUnread]   = useState(0);
  const [activeAgents, setActiveAgents] = useState<Set<AgentId>>(new Set());
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const lastKey      = useRef("");
  const recRef       = useRef<any>(null);

  // ── API Keys state (Keyhole) ──────────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("zq_apiKeys") || "{}"); } catch { return {}; }
  });
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [editKey, setEditKey] = useState<Record<string, string>>({});

  const saveKey = (id: string) => {
    const val = editKey[id] ?? apiKeys[id] ?? "";
    const next = { ...apiKeys, [id]: val };
    setApiKeys(next);
    localStorage.setItem("zq_apiKeys", JSON.stringify(next));
    setEditKey(p => { const n = {...p}; delete n[id]; return n; });
  };
  const clearKey = (id: string) => {
    const next = { ...apiKeys }; delete next[id];
    setApiKeys(next); localStorage.setItem("zq_apiKeys", JSON.stringify(next));
    setEditKey(p => { const n = {...p}; delete n[id]; return n; });
  };

  // ── Active task context ───────────────────────────────────────────────────
  const activeTask = rerTasks.find(t => t.status === "running") || rerTasks[0];

  const buildContext = useCallback((): string => {
    if (!activeTask) return "Workspace is idle — no active pipeline task.";
    const outputs = activeTask.agentOutputs ?? [];
    return [
      `Research topic: "${activeTask.topic}"`,
      `Pipeline mode: ${activeTask.mode}, status: ${activeTask.status}, step: ${activeTask.currentStep}/4`,
      ...TAB_LABELS.map((lbl, i) => {
        const o = outputs[i];
        if (!o) return `  Tab ${i+1} (${lbl}): not started`;
        const wc = o.output?.split(/\s+/).filter(Boolean).length ?? 0;
        const snip = (o.output ?? "").slice(0,200).replace(/\n/g," ");
        return `  Tab ${i+1} (${lbl}): ${o.status}${wc>0?`, ${wc} words`:""}${snip?` — "${snip}…"`:""}`;
      }),
    ].join("\n");
  }, [activeTask]);

  // ── Proactive auto-messages ───────────────────────────────────────────────
  useEffect(() => {
    if (!activeTask) return;
    const key = `${activeTask.id}-${activeTask.status}-${activeTask.currentStep}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const step = activeTask.currentStep;
    let agentId: AgentId = "keyhole", text = "";
    if (activeTask.status === "running" && step === 0)
      text = `**Pipeline launched** for "${activeTask.topic}". Tab 1 (Researcher) is running its full cycle: Review → Deep Research → Enhance → Report.`;
    else if (activeTask.status === "running" && step > 0 && step < 4)
      { agentId = "thinker"; text = `**Tab ${step} (${TAB_LABELS[step-1]}) complete.** Tab ${step+1} (${TAB_LABELS[step]}) now receives that full report and runs its own cycle.`; }
    else if (activeTask.status === "done")
      { agentId = "evaluator"; text = `**Pipeline complete.** Four full cycles done. Ask me to **rate the research**, **@challenger critique it**, **@synthesis connect findings**, or **@sparker suggest topics**.`; }
    if (text) {
      setMsgs(p => [...p, { id: `auto${Date.now()}`, role: "agent", agentId, text, ts: new Date(), isProactive: true }]);
      if (!open) setUnread(u => u + 1);
    }
  }, [activeTask?.id, activeTask?.status, activeTask?.currentStep]);

  useEffect(() => { scrollEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (open) setUnread(0); }, [open]);

  // ── Voice ─────────────────────────────────────────────────────────────────
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.continuous = false; r.interimResults = false; r.lang = "en-US";
    r.onresult = (e: any) => { setInput(e.results[0][0].transcript); setVoiceOn(false); };
    r.onerror = () => setVoiceOn(false); r.onend = () => setVoiceOn(false);
    recRef.current = r; r.start(); setVoiceOn(true);
  };
  const stopVoice = () => { recRef.current?.stop(); setVoiceOn(false); };

  const speak = useCallback((text: string) => {
    if (!tts || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g,"").replace(/#+/g,""));
    u.rate = 1.05; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  }, [tts]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: COAMsg = { id: `u${Date.now()}`, role: "user", text: text.trim(), ts: new Date() };
    setMsgs(p => [...p, userMsg]);
    setInput(""); setLoading(true);
    const history = msgs.slice(-10).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    try {
      const r = await fetch("/api/coa/multi-agent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history, workspaceContext: buildContext() }),
      });
      const data: { responses: { agentId: AgentId; text: string }[] } = await r.json();
      const newMsgs = (data.responses || []).map(res => ({
        id: `a${Date.now()}-${res.agentId}`,
        role: "agent" as const, agentId: res.agentId, text: res.text, ts: new Date(),
      }));
      setMsgs(p => [...p, ...newMsgs]);
      setActiveAgents(new Set(newMsgs.map(m => m.agentId).filter(Boolean) as AgentId[]));
      newMsgs.forEach(m => speak(m.text));
    } catch {
      setMsgs(p => [...p, { id: `e${Date.now()}`, role: "agent", agentId: "keyhole", text: "Connection error — try again.", ts: new Date() }]);
    } finally { setLoading(false); }
  }, [msgs, loading, buildContext, speak]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  if (!posReady) return null;

  const panelW = expanded ? 520 : 370;
  const panelH = minimized ? 46 : (expanded ? 620 : 480);

  // ── Closed pill ───────────────────────────────────────────────────────────
  const pill = (
    <button
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 99999, cursor: isDragging.current ? "grabbing" : "grab" }}
      className="flex items-center gap-2 bg-card border border-border rounded-2xl shadow-lg px-3 py-2"
      onClick={() => { setOpen(true); setUnread(0); }}
      onMouseDown={onHeaderMouseDown}
      data-testid="button-coa-open"
    >
      <div className="relative">
        <Sparkles className="w-4 h-4 text-primary" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-destructive text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
            {unread}
          </span>
        )}
      </div>
      <span className="text-xs font-semibold text-card-foreground">ZQ COA</span>
      <span className="text-[10px] text-muted-foreground">10 agents</span>
    </button>
  );

  // ── Open panel ────────────────────────────────────────────────────────────
  const panel = (
    <div
      style={{ position: "fixed", left: pos.x, top: pos.y, width: panelW, zIndex: 99999, transition: "width .15s ease" }}
      className="flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden select-none"
      data-testid="coa-overlay"
    >
      {/* Title bar — draggable area */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/95 flex-shrink-0"
        style={{ cursor: "grab", userSelect: "none" }}
        onMouseDown={onHeaderMouseDown}
      >
        <Sparkles className="w-3.5 h-3.5 text-primary pointer-events-none flex-shrink-0" />
        <span className="text-xs font-bold text-card-foreground flex-1 truncate pointer-events-none">ZQ Cognitive Overlay Agent</span>
        {activeTask?.status === "running" && (
          <span className="flex items-center gap-1 text-[10px] text-primary animate-pulse flex-shrink-0 pointer-events-none">
            <Eye className="w-2.5 h-2.5" />live
          </span>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0" data-no-drag>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTts(v => !v)} title="TTS">
            {tts ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3 text-muted-foreground/50" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(v => !v)}>
            <Maximize2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMinimized(v => !v)}>
            <Minus className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* View tabs */}
          <div className="flex border-b border-border flex-shrink-0" data-no-drag>
            {([
              { id: "chat",   label: "Chat",          Icon: Sparkles },
              { id: "agents", label: `Agents (10)`,   Icon: Users },
              { id: "keys",   label: "API Keys",      Icon: Key },
            ] as const).map(({ id, label, Icon }) => (
              <button key={id}
                className={`flex-1 py-1.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${activeView === id ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setActiveView(id)}>
                <Icon className="w-3 h-3" />{label}
              </button>
            ))}
          </div>

          {/* Context strip */}
          {activeTask && (
            <div className="px-3 py-1.5 border-b border-border bg-muted/10 flex items-center gap-2 flex-shrink-0 text-xs">
              <Eye className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground truncate flex-1">
                <span className="font-medium text-foreground/70">"{activeTask.topic}"</span>
                {" — "}
                {activeTask.status === "running"
                  ? <span className="text-primary">Tab {activeTask.currentStep + 1}/4 running</span>
                  : <span className="text-emerald-500">{activeTask.status}</span>}
              </span>
            </div>
          )}

          {/* ── AGENTS VIEW ──────────────────────────────────────────────── */}
          {activeView === "agents" && (
            <ScrollArea className="flex-1 min-h-0" style={{ height: panelH - 130 }}>
              <div className="p-3">
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  Use <span className="font-mono bg-muted px-1 rounded">@name</span> in Chat to address a specific agent, or let the system auto-route your message.
                </p>
                <div className="space-y-1.5">
                  {AGENTS.map(agent => (
                    <button key={agent.id}
                      className="w-full flex items-start gap-3 p-2 rounded-xl border border-border bg-background/40 text-left hover-elevate active-elevate-2"
                      onClick={() => { setActiveView("chat"); setInput(`@${agent.id} `); }}
                      data-testid={`btn-agent-${agent.id}`}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: `${agent.color}20`, border: `1px solid ${agent.color}40` }}>
                        <agent.Icon className="w-3.5 h-3.5" style={{ color: agent.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-card-foreground">{agent.name}</span>
                          <span className="text-[9px] font-mono text-muted-foreground/60">@{agent.id}</span>
                          {activeAgents.has(agent.id) && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">last active</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{agent.tagline}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}

          {/* ── API KEYS VIEW (Keyhole) ───────────────────────────────────── */}
          {activeView === "keys" && (
            <ScrollArea className="flex-1 min-h-0" style={{ height: panelH - 130 }}>
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <Eye className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-blue-300">Keyhole · API Key Manager</p>
                    <p className="text-[10px] text-blue-400/60 leading-relaxed mt-0.5">
                      Keys are stored locally in your browser only. Never sent to our servers. Each key unlocks the corresponding AI service for the pipeline.
                    </p>
                  </div>
                </div>

                {API_KEYS_CONFIG.map(cfg => {
                  const saved = apiKeys[cfg.id] || "";
                  const editing = editKey[cfg.id] !== undefined;
                  const val = editing ? editKey[cfg.id] : saved;
                  const isSet = !!saved && saved.length > 4;

                  return (
                    <div key={cfg.id} className="border border-border rounded-xl bg-background/40 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-card-foreground">{cfg.label}</p>
                          <p className="text-[10px] text-muted-foreground">{cfg.tab}</p>
                        </div>
                        {isSet
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0" />}
                      </div>
                      <div className="flex gap-1">
                        <div className="relative flex-1">
                          <Input
                            type={showKey[cfg.id] ? "text" : "password"}
                            placeholder={isSet ? "••••••••••••••••" : cfg.hint}
                            value={val}
                            onChange={e => setEditKey(p => ({ ...p, [cfg.id]: e.target.value }))}
                            className="text-xs h-7 pr-2 bg-background/60 font-mono"
                            data-testid={`input-key-${cfg.id}`}
                          />
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
                          onClick={() => setShowKey(p => ({ ...p, [cfg.id]: !p[cfg.id] }))}
                          title={showKey[cfg.id] ? "Hide" : "Show"}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        {editing && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-primary"
                            onClick={() => saveKey(cfg.id)} title="Save" data-testid={`btn-save-key-${cfg.id}`}>
                            <Save className="w-3 h-3" />
                          </Button>
                        )}
                        {isSet && !editing && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-destructive/60"
                            onClick={() => clearKey(cfg.id)} title="Remove" data-testid={`btn-clear-key-${cfg.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}

                <p className="text-[10px] text-muted-foreground/40 text-center pt-1">
                  Keys persist in localStorage across sessions. Clear browser data to remove all.
                </p>
              </div>
            </ScrollArea>
          )}

          {/* ── CHAT VIEW ────────────────────────────────────────────────── */}
          {activeView === "chat" && (
            <>
              <ScrollArea className="flex-1 min-h-0" style={{ height: panelH - 170 }} data-no-drag>
                <div className="p-3 space-y-3">
                  {msgs.length === 0 && (
                    <div className="flex flex-col items-center py-6 gap-3 text-center">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-card-foreground">10 agents standing by</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[240px] leading-relaxed">
                          Ask anything, or use <span className="font-mono bg-muted px-1 rounded">@agent</span> to address a specialist.
                        </p>
                      </div>
                    </div>
                  )}
                  {msgs.map(msg => {
                    const agentDef = msg.agentId ? AGENTS.find(a => a.id === msg.agentId) : null;
                    return (
                      <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        {msg.role === "agent" && agentDef && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: `${agentDef.color}20`, border: `1px solid ${agentDef.color}40` }}>
                            <agentDef.Icon className="w-3 h-3" style={{ color: agentDef.color }} />
                          </div>
                        )}
                        <div className={`max-w-[84%] rounded-xl px-2.5 py-2 text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : msg.isProactive
                            ? "bg-muted/60 border border-border text-foreground rounded-tl-sm"
                            : "bg-muted text-foreground rounded-tl-sm"
                        }`}>
                          {agentDef && (
                            <p className="text-[9px] font-bold mb-1 opacity-70 uppercase tracking-wide" style={{ color: agentDef.color }}>
                              {agentDef.name}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap">{renderBold(msg.text)}</p>
                          <p className="text-[10px] opacity-40 mt-1 text-right">
                            {msg.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {msg.isProactive && " · auto"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {loading && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Loader2 className="w-3 h-3 text-primary animate-spin" />
                      </div>
                      <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2.5 flex gap-1">
                        {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay:`${d}ms` }} />)}
                      </div>
                    </div>
                  )}
                  <div ref={scrollEndRef} />
                </div>
              </ScrollArea>

              {/* Quick actions */}
              <div className="px-2.5 py-1.5 border-t border-border flex gap-1.5 overflow-x-auto flex-shrink-0" data-no-drag>
                {QUICK.map(q => (
                  <button key={q.label}
                    className="text-[10px] whitespace-nowrap px-2 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground flex-shrink-0 hover-elevate"
                    onClick={() => send(q.msg)}>
                    {q.label}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="px-2.5 pb-2.5 pt-1 flex gap-1.5 items-end flex-shrink-0" data-no-drag>
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Ask any agent… use @thinker, @mrq, @keyhole… (Enter sends)"
                  className="resize-none text-xs min-h-[36px] max-h-[80px] flex-1"
                  rows={1}
                  data-testid="input-coa"
                />
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant={voiceOn ? "default" : "ghost"} className="h-7 w-7"
                    onClick={voiceOn ? stopVoice : startVoice} data-testid="btn-coa-voice">
                    {voiceOn ? <MicOff className="w-3 h-3 animate-pulse" /> : <Mic className="w-3 h-3" />}
                  </Button>
                  <Button size="icon" className="h-7 w-7"
                    onClick={() => send(input)} disabled={!input.trim() || loading} data-testid="btn-coa-send">
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  return createPortal(open ? panel : pill, document.body);
}

function renderBold(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="font-semibold">{p.slice(2,-2)}</strong>
      : p
  );
}
