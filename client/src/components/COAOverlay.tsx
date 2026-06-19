import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, X, Minus, Maximize2, Send, Mic, MicOff,
  GripVertical, Sparkles, Eye, Volume2, VolumeX,
  Loader2,
} from "lucide-react";
import type { RerTask, RerAgentOutput } from "@shared/schema";

interface COAMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: Date;
  isProactive?: boolean;
}

const TAB_LABELS = ["Researcher", "Reviewer", "Enhancer", "Reporter"];

const QUICK_ACTIONS = [
  "What's happening?",
  "What's next?",
  "Critique research",
  "Suggest follow-ups",
  "Rate so far",
];

interface COAOverlayProps {
  rerTasks: (RerTask & { agentOutputs?: RerAgentOutput[] })[];
}

export default function COAOverlay({ rerTasks }: COAOverlayProps) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState({ x: 500, y: 500 });
  const [posReady, setPosReady] = useState(false);

  useEffect(() => {
    setPos({ x: Math.max(220, window.innerWidth - 620), y: Math.max(60, window.innerHeight - 80) });
    setPosReady(true);
  }, []);

  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const [messages, setMessages] = useState<COAMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const lastPipelineKey = useRef<string>("");

  const activeTask = rerTasks.find(t => t.status === "running") || rerTasks[0];

  const buildContext = useCallback((): string => {
    if (!activeTask) return "Workspace is idle — no active pipeline task.";
    const outputs = activeTask.agentOutputs ?? [];
    const tabLines = TAB_LABELS.map((label, i) => {
      const o = outputs[i];
      if (!o) return `  Tab ${i + 1} (${label}): not started`;
      const wc = o.output?.split(/\s+/).filter(Boolean).length ?? 0;
      const snippet = (o.output ?? "").slice(0, 180).replace(/\n/g, " ");
      return `  Tab ${i + 1} (${label}): ${o.status}${wc > 0 ? `, ${wc} words produced` : ""}${snippet ? ` — "${snippet}…"` : ""}`;
    }).join("\n");
    return [
      `Research topic: "${activeTask.topic}"`,
      `Pipeline mode: ${activeTask.mode}`,
      `Pipeline status: ${activeTask.status}`,
      `Progress: step ${activeTask.currentStep}/4`,
      `Per-tab states:\n${tabLines}`,
    ].join("\n");
  }, [activeTask]);

  // Proactive commentary on pipeline state changes
  useEffect(() => {
    if (!activeTask) return;
    const key = `${activeTask.id}-${activeTask.status}-${activeTask.currentStep}`;
    if (key === lastPipelineKey.current) return;
    lastPipelineKey.current = key;

    let text = "";
    const step = activeTask.currentStep;
    if (activeTask.status === "running" && step === 0) {
      text = `Pipeline launched for **"${activeTask.topic}"**. Tab 1 (Researcher) is now running its full cycle: Review → Deep Research → Enhance → Report. I'm observing.`;
    } else if (activeTask.status === "running" && step > 0 && step < 4) {
      text = `**Tab ${step} (${TAB_LABELS[step - 1]}) completed.** Tab ${step + 1} (${TAB_LABELS[step]}) is now reviewing that report and running its own full research cycle.`;
    } else if (activeTask.status === "done") {
      text = `**Pipeline complete!** All 4 tabs finished their cycles. Ask me to **rate the research**, **summarize any tab**, or **suggest follow-up topics**.`;
    }

    if (text) {
      setMessages(prev => [...prev, {
        id: `auto-${Date.now()}`,
        role: "agent",
        text,
        timestamp: new Date(),
        isProactive: true,
      }]);
      if (!open) setUnread(u => u + 1);
    }
  }, [activeTask?.id, activeTask?.status, activeTask?.currentStep]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // Drag
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-drag], button, textarea, input")) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 48, e.clientY - dragOffset.current.y)),
      });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  // Voice
  const recRef = useRef<any>(null);
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.continuous = false; r.interimResults = false; r.lang = "en-US";
    r.onresult = (e: any) => { setInput(e.results[0][0].transcript); setVoiceActive(false); };
    r.onerror = () => setVoiceActive(false);
    r.onend = () => setVoiceActive(false);
    recRef.current = r; r.start(); setVoiceActive(true);
  };
  const stopVoice = () => { recRef.current?.stop(); setVoiceActive(false); };

  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !("speechSynthesis" in window)) return;
    const utt = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ""));
    utt.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  }, [ttsEnabled]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: COAMessage = { id: `u${Date.now()}`, role: "user", text: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setLoading(true);
    try {
      const history = [...messages.slice(-10), userMsg].map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }));
      const r = await fetch("/api/coa/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, workspaceContext: buildContext() }),
      });
      const data = await r.json();
      const reply: COAMessage = { id: `a${Date.now()}`, role: "agent", text: data.text || "...", timestamp: new Date() };
      setMessages(prev => [...prev, reply]);
      speak(reply.text);
    } catch {
      setMessages(prev => [...prev, { id: `e${Date.now()}`, role: "agent", text: "Connection error.", timestamp: new Date() }]);
    } finally { setLoading(false); }
  }, [messages, loading, buildContext, speak]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  if (!posReady) return null;

  const panelW = expanded ? 520 : 360;
  const panelH = minimized ? 48 : (expanded ? 600 : 440);

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
      <span className="text-xs font-semibold text-card-foreground whitespace-nowrap">ZQ COA</span>
      <Eye className="w-3 h-3 text-muted-foreground" />
    </button>
  );

  const openPanel = (
    <div
      style={{ position: "fixed", left: pos.x, top: pos.y, width: panelW, height: panelH, zIndex: 99999, transition: "height .18s ease, width .18s ease" }}
      className="flex flex-col bg-card border border-border rounded-2xl shadow-xl overflow-hidden select-none"
      data-testid="coa-overlay"
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/80 cursor-grab flex-shrink-0"
        onMouseDown={onMouseDown}
      >
        <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-bold text-card-foreground flex-1 truncate">ZQ Cognitive Overlay Agent</span>
        {activeTask?.status === "running" && (
          <span className="flex items-center gap-1 text-[10px] text-primary animate-pulse flex-shrink-0">
            <Eye className="w-2.5 h-2.5" />watching
          </span>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0" data-no-drag>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTtsEnabled(v => !v)} title="Toggle voice">
            {ttsEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3 text-muted-foreground/50" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(v => !v)} title="Expand">
            <Maximize2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMinimized(v => !v)} title="Minimize">
            <Minus className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)} title="Close">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Context strip */}
          {activeTask && (
            <div className="px-3 py-1.5 border-b border-border bg-muted/20 flex items-center gap-2 flex-shrink-0">
              <Eye className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate flex-1">
                <span className="text-foreground/70 font-medium">"{activeTask.topic}"</span>
                {" — "}
                {activeTask.status === "running"
                  ? <span className="text-primary">Tab {activeTask.currentStep + 1}/4 running</span>
                  : activeTask.status === "done"
                  ? <span className="text-emerald-500">complete</span>
                  : activeTask.status}
              </span>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 min-h-0" data-no-drag>
            <div className="p-3 space-y-2.5">
              {messages.length === 0 && (
                <div className="flex flex-col items-center py-8 gap-3 text-center">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-xs font-semibold text-card-foreground">ZQ COA is watching</p>
                  <p className="text-xs text-muted-foreground max-w-[220px]">
                    I observe your pipeline in real-time. Start a task or ask me anything about your research.
                  </p>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  {msg.role === "agent" && (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${msg.isProactive ? "bg-amber-500/15" : "bg-primary/10"}`}>
                      {msg.isProactive ? <Eye className="w-3 h-3 text-amber-500" /> : <Sparkles className="w-3 h-3 text-primary" />}
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-xl px-2.5 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : msg.isProactive
                      ? "bg-amber-500/8 border border-amber-500/20 text-foreground rounded-tl-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  }`}>
                    <p className="whitespace-pre-wrap">{renderBold(msg.text)}</p>
                    <p className="text-[10px] opacity-50 mt-0.5 text-right">
                      {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {msg.isProactive && " · auto"}
                    </p>
                  </div>
                </div>
              ))}

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
            {QUICK_ACTIONS.map(a => (
              <button
                key={a}
                className="text-[10px] whitespace-nowrap px-2 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground flex-shrink-0 hover-elevate"
                onClick={() => send(a)}
                data-testid={`btn-quick-${a.slice(0, 8)}`}
              >
                {a}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-2.5 pb-2.5 pt-1 flex gap-1.5 items-end flex-shrink-0" data-no-drag>
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask COA… (Enter to send)"
              className="resize-none text-xs min-h-[36px] max-h-[80px] flex-1"
              rows={1}
              data-testid="input-coa"
            />
            <div className="flex flex-col gap-1">
              <Button size="icon" variant={voiceActive ? "default" : "ghost"} className="h-7 w-7"
                onClick={voiceActive ? stopVoice : startVoice} data-testid="btn-coa-voice">
                {voiceActive ? <MicOff className="w-3 h-3 animate-pulse" /> : <Mic className="w-3 h-3" />}
              </Button>
              <Button size="icon" className="h-7 w-7" onClick={() => send(input)}
                disabled={!input.trim() || loading} data-testid="btn-coa-send">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </Button>
            </div>
          </div>
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
