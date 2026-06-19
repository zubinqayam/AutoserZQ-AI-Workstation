import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X, Minus, Maximize2, Send, Mic, MicOff, GripVertical,
  Sparkles, Eye, Volume2, VolumeX, Loader2, Brain, HelpCircle,
  Shield, Map, Zap, CheckCircle, Layers, Sword, Activity,
  ChevronDown, ChevronUp, Users,
} from "lucide-react";
import type { RerTask, RerAgentOutput } from "@shared/schema";

// ── Agent definitions (must match server/gemini.ts COA_AGENTS) ───────────────
export const AGENTS = [
  { id: "thinker",    name: "Thinker",              color: "#818cf8", Icon: Brain,       tagline: "Cognitive reasoning" },
  { id: "mrq",        name: "Mr.Q",                 color: "#f472b6", Icon: HelpCircle,  tagline: "Adversarial questioning" },
  { id: "alga",       name: "ALGA",                 color: "#34d399", Icon: Shield,      tagline: "Legitimacy & compliance" },
  { id: "drm",        name: "DRM",                  color: "#fb923c", Icon: Map,         tagline: "Scenario analysis" },
  { id: "keyhole",    name: "Keyhole",               color: "#60a5fa", Icon: Eye,         tagline: "State introspection" },
  { id: "sparker",    name: "Insight Sparker",       color: "#fbbf24", Icon: Zap,         tagline: "Analogies & engagement" },
  { id: "checker",    name: "Fundamentals Checker",  color: "#a78bfa", Icon: CheckCircle, tagline: "Verification & errors" },
  { id: "synthesis",  name: "Synthesis Expert",      color: "#2dd4bf", Icon: Layers,      tagline: "Integration & networks" },
  { id: "challenger", name: "Critical Challenger",   color: "#f87171", Icon: Sword,       tagline: "Cognitive tension" },
  { id: "evaluator",  name: "Evaluation Agent",      color: "#94a3b8", Icon: Activity,    tagline: "Assessment & scoring" },
] as const;

type AgentId = typeof AGENTS[number]["id"];

interface COAMsg {
  id: string;
  role: "user" | "agent";
  agentId?: AgentId;
  text: string;
  ts: Date;
  isProactive?: boolean;
}

interface COAOverlayProps {
  rerTasks: (RerTask & { agentOutputs?: RerAgentOutput[] })[];
}

const TAB_LABELS = ["Researcher", "Reviewer", "Enhancer", "Reporter"];

const QUICK = [
  { label: "What's happening?", msg: "What's happening right now in the pipeline?" },
  { label: "Rate research", msg: "@evaluator Rate the research quality so far" },
  { label: "Challenge it", msg: "@challenger What are the weaknesses?" },
  { label: "Synthesize", msg: "@synthesis Connect all the findings so far" },
  { label: "Suggest more", msg: "@sparker Suggest follow-up research topics" },
  { label: "Verify", msg: "@checker Check for errors or weak claims" },
];

export default function COAOverlay({ rerTasks }: COAOverlayProps) {
  const [open, setOpen]           = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "agents">("chat");
  const [pos, setPos]             = useState({ x: 500, y: 500 });
  const [posReady, setPosReady]   = useState(false);

  useEffect(() => {
    setPos({ x: Math.max(220, window.innerWidth - 640), y: Math.max(60, window.innerHeight - 80) });
    setPosReady(true);
  }, []);

  const dragging   = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [msgs, setMsgs]         = useState<COAMsg[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [voiceOn, setVoiceOn]   = useState(false);
  const [tts, setTts]           = useState(false);
  const [unread, setUnread]     = useState(0);
  const [activeAgents, setActiveAgents] = useState<Set<AgentId>>(new Set());
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const lastKey = useRef("");

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
        const snip = (o.output ?? "").slice(0, 200).replace(/\n/g, " ");
        return `  Tab ${i+1} (${lbl}): ${o.status}${wc > 0 ? `, ${wc} words` : ""}${snip ? ` — "${snip}…"` : ""}`;
      }),
    ].join("\n");
  }, [activeTask]);

  // Proactive messages on pipeline state changes
  useEffect(() => {
    if (!activeTask) return;
    const key = `${activeTask.id}-${activeTask.status}-${activeTask.currentStep}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const step = activeTask.currentStep;

    let agentId: AgentId = "keyhole";
    let text = "";
    if (activeTask.status === "running" && step === 0) {
      text = `**Pipeline launched** for "${activeTask.topic}". Tab 1 (Researcher) is now in its full cycle: Review → Deep Research → Enhance → Report. I'm observing every step.`;
    } else if (activeTask.status === "running" && step > 0 && step < 4) {
      agentId = "thinker";
      text = `**Tab ${step} (${TAB_LABELS[step-1]}) complete.** Tab ${step+1} (${TAB_LABELS[step]}) now receives that full report and runs its own independent cycle. Each pass adds a new cognitive layer.`;
    } else if (activeTask.status === "done") {
      agentId = "evaluator";
      text = `**Pipeline complete.** Four full research cycles executed. Ask me to **rate the research**, **@challenger critique it**, **@synthesis connect all findings**, or **@sparker suggest follow-up topics**.`;
    }

    if (text) {
      setMsgs(p => [...p, { id: `auto${Date.now()}`, role: "agent", agentId, text, ts: new Date(), isProactive: true }]);
      if (!open) setUnread(u => u + 1);
    }
  }, [activeTask?.id, activeTask?.status, activeTask?.currentStep]);

  useEffect(() => { scrollEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (open) setUnread(0); }, [open]);

  // Drag
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-drag], button, textarea, input")) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };
  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dragOffset.current.x)), y: Math.max(0, Math.min(window.innerHeight - 48, e.clientY - dragOffset.current.y)) });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, []);

  // Voice
  const recRef = useRef<any>(null);
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
    const utt = new SpeechSynthesisUtterance(text.replace(/\*\*/g, "").replace(/#+/g, ""));
    utt.rate = 1.05; window.speechSynthesis.cancel(); window.speechSynthesis.speak(utt);
  }, [tts]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: COAMsg = { id: `u${Date.now()}`, role: "user", text: text.trim(), ts: new Date() };
    setMsgs(p => [...p, userMsg]);
    setInput(""); setLoading(true);

    const history = msgs.slice(-10).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    const ctx = buildContext();

    try {
      const r = await fetch("/api/coa/multi-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history, workspaceContext: ctx }),
      });
      const data: { responses: { agentId: AgentId; text: string }[] } = await r.json();
      const newMsgs = (data.responses || []).map(res => ({
        id: `a${Date.now()}-${res.agentId}`,
        role: "agent" as const,
        agentId: res.agentId,
        text: res.text,
        ts: new Date(),
      }));
      setMsgs(p => [...p, ...newMsgs]);
      setActiveAgents(new Set(newMsgs.map(m => m.agentId).filter(Boolean) as AgentId[]));
      newMsgs.forEach(m => speak(m.text));
    } catch {
      setMsgs(p => [...p, { id: `e${Date.now()}`, role: "agent", agentId: "keyhole", text: "Connection error — try again.", ts: new Date() }]);
    } finally { setLoading(false); }
  }, [msgs, loading, buildContext, speak]);

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } };

  if (!posReady) return null;

  const panelW = expanded ? 560 : 380;
  const panelH = minimized ? 48 : (expanded ? 640 : 480);

  // ── Closed pill button ──────────────────────────────────────────────────────
  const closedBtn = (
    <button
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 99999 }}
      className="flex items-center gap-2 bg-card border border-border rounded-2xl shadow-lg px-3 py-2 cursor-pointer hover-elevate active-elevate-2"
      onClick={() => { setOpen(true); setUnread(0); }}
      onMouseDown={onMouseDown}
      data-testid="button-coa-open"
    >
      <div className="relative">
        <Sparkles className="w-4 h-4 text-primary" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-destructive text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
            {unread}
          </span>
        )}
      </div>
      <span className="text-xs font-semibold text-card-foreground">ZQ COA</span>
      <span className="text-[10px] text-muted-foreground">{AGENTS.length} agents</span>
    </button>
  );

  // ── Open panel ──────────────────────────────────────────────────────────────
  const openPanel = (
    <div
      style={{ position: "fixed", left: pos.x, top: pos.y, width: panelW, height: panelH, zIndex: 99999, transition: "height .18s ease, width .18s ease" }}
      className="flex flex-col bg-card border border-border rounded-2xl shadow-xl overflow-hidden select-none"
      data-testid="coa-overlay"
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/90 cursor-grab flex-shrink-0" onMouseDown={onMouseDown}>
        <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-bold text-card-foreground flex-1 truncate">ZQ Cognitive Overlay Agent</span>
        {activeTask?.status === "running" && (
          <span className="flex items-center gap-1 text-[10px] text-primary animate-pulse flex-shrink-0">
            <Eye className="w-2.5 h-2.5" />live
          </span>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0" data-no-drag>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTts(v => !v)} title="Voice">
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
            <button
              className={`flex-1 py-1.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${activeView === "chat" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveView("chat")}
            >
              <Sparkles className="w-3 h-3" />Chat
            </button>
            <button
              className={`flex-1 py-1.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${activeView === "agents" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveView("agents")}
            >
              <Users className="w-3 h-3" />Agents ({AGENTS.length})
            </button>
          </div>

          {/* Context strip */}
          {activeTask && (
            <div className="px-3 py-1.5 border-b border-border bg-muted/15 flex items-center gap-2 flex-shrink-0 text-xs">
              <Eye className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground truncate flex-1">
                <span className="font-medium text-foreground/70">"{activeTask.topic}"</span>
                {" — "}
                {activeTask.status === "running"
                  ? <span className="text-primary">Tab {activeTask.currentStep + 1}/4 running</span>
                  : activeTask.status === "done"
                  ? <span className="text-emerald-500">complete</span>
                  : activeTask.status}
              </span>
            </div>
          )}

          {/* ── AGENTS VIEW ─────────────────────────────────────────────────── */}
          {activeView === "agents" && (
            <ScrollArea className="flex-1 min-h-0" data-no-drag>
              <div className="p-3">
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  The COA houses <span className="font-semibold text-foreground">10 specialized cognitive agents</span>. Use <span className="font-mono bg-muted px-1 rounded">@name</span> in chat to address one directly, or let the system auto-route your message.
                </p>
                <div className="space-y-1.5">
                  {AGENTS.map(agent => {
                    const isActive = activeAgents.has(agent.id);
                    return (
                      <button
                        key={agent.id}
                        className="w-full flex items-start gap-3 p-2 rounded-xl border border-border bg-background/40 text-left hover-elevate active-elevate-2 transition-all"
                        onClick={() => { setActiveView("chat"); setInput(`@${agent.id} `); }}
                        data-testid={`btn-agent-${agent.id}`}
                      >
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${agent.color}20`, border: `1px solid ${agent.color}40` }}>
                          <agent.Icon className="w-3.5 h-3.5" style={{ color: agent.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-card-foreground">{agent.name}</span>
                            <span className="text-[9px] font-mono text-muted-foreground/60">@{agent.id}</span>
                            {isActive && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">last active</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{agent.tagline}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-3 text-center">Click an agent to chat with them directly</p>
              </div>
            </ScrollArea>
          )}

          {/* ── CHAT VIEW ───────────────────────────────────────────────────── */}
          {activeView === "chat" && (
            <>
              <ScrollArea className="flex-1 min-h-0" data-no-drag>
                <div className="p-3 space-y-3">
                  {msgs.length === 0 && (
                    <div className="flex flex-col items-center py-6 gap-3 text-center">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-card-foreground">10 agents are standing by</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[240px] leading-relaxed">
                          Ask anything, or use <span className="font-mono bg-muted px-1 rounded">@agent</span> to address a specialist. Switch to the Agents tab to see all 10 roles.
                        </p>
                      </div>
                    </div>
                  )}

                  {msgs.map(msg => {
                    const agentDef = msg.agentId ? AGENTS.find(a => a.id === msg.agentId) : null;
                    return (
                      <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        {msg.role === "agent" && agentDef && (
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: `${agentDef.color}20`, border: `1px solid ${agentDef.color}40` }}
                            title={agentDef.name}
                          >
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
                        {[0, 150, 300].map(d => (
                          <span key={d} className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={scrollEndRef} />
                </div>
              </ScrollArea>

              {/* Quick actions */}
              <div className="px-2.5 py-1.5 border-t border-border flex gap-1.5 overflow-x-auto flex-shrink-0" data-no-drag>
                {QUICK.map(q => (
                  <button
                    key={q.label}
                    className="text-[10px] whitespace-nowrap px-2 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground flex-shrink-0 hover-elevate"
                    onClick={() => send(q.msg)}
                  >
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
                  placeholder="Ask any agent… use @thinker, @mrq, @alga… (Enter sends)"
                  className="resize-none text-xs min-h-[36px] max-h-[80px] flex-1"
                  rows={1}
                  data-testid="input-coa"
                />
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant={voiceOn ? "default" : "ghost"} className="h-7 w-7"
                    onClick={voiceOn ? stopVoice : startVoice} data-testid="btn-coa-voice">
                    {voiceOn ? <MicOff className="w-3 h-3 animate-pulse" /> : <Mic className="w-3 h-3" />}
                  </Button>
                  <Button size="icon" className="h-7 w-7" onClick={() => send(input)}
                    disabled={!input.trim() || loading} data-testid="btn-coa-send">
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

  return createPortal(open ? openPanel : closedBtn, document.body);
}

function renderBold(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
      : p
  );
}
