import { useState, useMemo, useEffect, useCallback } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import RoomSidebar from "@/components/RoomSidebar";
import AgentTab from "@/components/AgentTab";
import CommandCenter from "@/components/CommandCenter";
import COAOverlay from "@/components/COAOverlay";
import { Button } from "@/components/ui/button";
import { Share2, Lock, Unlock, Wifi, WifiOff, ArrowRight, Play, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ConferenceRoom() {
  const { toast } = useToast();

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

  // Per-tab credentials (stored locally)
  const [tabCreds, setTabCreds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("zq_tabCreds") || "null") || ["","","",""]; }
    catch { return ["","","",""]; }
  });

  const updateCreds = (i: number, val: string) => {
    const next = [...tabCreds];
    next[i] = val;
    setTabCreds(next);
    localStorage.setItem("zq_tabCreds", JSON.stringify(next));
  };

  useEffect(() => {
    if (connected) joinRoom(roomId, uid, displayName);
  }, [connected, roomId, uid, displayName, joinRoom]);

  const handleSendMessage = useCallback(async (text: string) => {
    sendMessage({ type: "chat", roomId, authorUid: uid, text, isAI: false });
    try {
      const history = messages.slice(-8).map(m => ({
        role: m.authorUid === uid ? "user" : "assistant",
        content: m.text,
      }));
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content: text }] }),
      });
      const data = await res.json();
      if (data.text) sendMessage({ type: "chat", roomId, authorUid: "supervisor-ai", text: data.text, isAI: true });
    } catch (err) { console.error("Supervisor AI error:", err); }
  }, [sendMessage, roomId, uid, messages]);

  const handleStartRer = useCallback(async (topic: string, mode: "sequential" | "parallel") => {
    const modeDesc = mode === "sequential"
      ? "Tab 1 researches → passes report to Tab 2 → Tab 2 reviews & researches → passes to Tab 3 → Tab 3 synthesizes → passes to Tab 4 → Tab 4 produces final report"
      : "All 4 tabs research simultaneously → exchange all outputs → each produces enhanced cross-referenced report";

    sendMessage({
      type: "chat", roomId, authorUid: "supervisor-ai",
      text: `Starting **${mode === "sequential" ? "Sequential" : "Parallel"}** RER Pipeline\n\nTopic: "${topic}"\n\n${modeDesc}\n\nEach tab runs its own full cycle: Review received input → Deep Research → Enhance → Report`,
      isAI: true,
    });
    try {
      const res = await fetch("/api/rer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, topic, mode }),
      });
      if (!res.ok) throw new Error("Failed to start");
    } catch {
      toast({ title: "Failed to start pipeline", variant: "destructive" });
    }
  }, [sendMessage, roomId, toast]);

  const handleShare = async () => {
    const url = `${window.location.origin}?room=${encodeURIComponent(roomId)}`;
    try { await navigator.clipboard.writeText(url); toast({ title: "Room link copied!" }); }
    catch { toast({ title: "Share link", description: url }); }
  };

  const isOwner = room?.ownerUid === uid;
  const onlineCount = members.filter(m => Date.now() - new Date(m.lastSeen).getTime() < 60000).length;

  const activeTask = rerTasks.find(t => t.status === "running");
  const latestTask = rerTasks[0];
  const agentOutputs = latestTask?.agentOutputs ?? [];

  // Which tab is currently active (thinking)
  const activeTabIndex = activeTask
    ? agentOutputs.findIndex(o => o.status === "thinking")
    : -1;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <RoomSidebar roomId={roomId} membersOnline={onlineCount} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="px-4 py-2.5 border-b border-border bg-card flex items-center gap-3 flex-shrink-0 flex-wrap gap-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-card-foreground">ZQ Workstation</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-xs text-muted-foreground font-mono">{roomId}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {connected
              ? <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              : <WifiOff className="w-3.5 h-3.5 text-destructive" />}
            <span className="text-xs text-muted-foreground">{onlineCount} online</span>
          </div>
          {activeTask && (
            <div className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
              <Play className="w-3 h-3" />
              Pipeline running — Tab {activeTask.currentStep + 1}/4
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
                data-testid="button-lock"
              >
                {room?.isOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </header>

        {/* Pipeline flow header */}
        <div className="px-4 py-2 border-b border-border bg-card/50 flex-shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-2">
              RER Pipeline:
            </span>
            {["Tab 1 Research", "Tab 2 Review", "Tab 3 Enhance", "Tab 4 Final Report"].map((label, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  agentOutputs[i]?.status === "done"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : agentOutputs[i]?.status === "thinking"
                    ? "bg-primary/10 text-primary border-primary/20 animate-pulse"
                    : "bg-muted text-muted-foreground border-border"
                }`}>
                  {label}
                </span>
                {i < 3 && <ArrowRight className="w-3 h-3 text-muted-foreground/40" />}
              </div>
            ))}
            {latestTask && (
              <span className="ml-auto text-xs text-muted-foreground truncate max-w-[200px]">
                {latestTask.topic}
              </span>
            )}
          </div>
        </div>

        {/* 4 Agent Tabs */}
        <div className="flex-1 grid grid-cols-2 gap-3 p-3 overflow-auto min-h-0">
          {[0, 1, 2, 3].map((i) => (
            <AgentTab
              key={i}
              index={i}
              agentOutput={agentOutputs[i] ?? null}
              isActive={activeTabIndex === i}
              credentials={tabCreds[i]}
              onCredentialsChange={(creds) => updateCreds(i, creds)}
            />
          ))}
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

      {/* ZQ Cognitive Overlay Agent — always-on-top floating chat */}
      <COAOverlay rerTasks={rerTasks} />
    </div>
  );
}
