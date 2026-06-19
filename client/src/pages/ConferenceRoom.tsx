import { useState, useMemo, useEffect, useCallback } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import RoomSidebar from "@/components/RoomSidebar";
import AgentTab from "@/components/AgentTab";
import CommandCenter from "@/components/CommandCenter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Share2, Lock, Unlock, Wifi, WifiOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ConferenceRoom() {
  const { toast } = useToast();

  const roomId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("room") || "zq-demo";
  }, []);

  const uid = useMemo(() => {
    let stored = localStorage.getItem("zq_uid");
    if (!stored) {
      stored = `user-${Date.now()}`;
      localStorage.setItem("zq_uid", stored);
    }
    return stored;
  }, []);

  const displayName = useMemo(() => {
    return localStorage.getItem("zq_displayName") || `User-${uid.slice(-4)}`;
  }, [uid]);

  const { connected, room, members, messages, roomState, rerTasks, sendMessage, joinRoom } = useWebSocket();

  useEffect(() => {
    if (connected) joinRoom(roomId, uid, displayName);
  }, [connected, roomId, uid, displayName, joinRoom]);

  const handleSendMessage = useCallback(async (text: string) => {
    // Add user message
    sendMessage({ type: "chat", roomId, authorUid: uid, text, isAI: false });

    // Get AI supervisor response
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
      if (data.text) {
        sendMessage({ type: "chat", roomId, authorUid: "supervisor-ai", text: data.text, isAI: true });
      }
    } catch (err) {
      console.error("Supervisor AI error:", err);
    }
  }, [sendMessage, roomId, uid, messages]);

  const handleStartRer = useCallback(async (topic: string, mode: "sequential" | "parallel") => {
    // Notify chat
    sendMessage({
      type: "chat", roomId, authorUid: "supervisor-ai",
      text: `Starting ${mode === "sequential" ? "Sequential" : "Parallel"} RER pipeline for: "${topic}"\n\n${
        mode === "sequential"
          ? "Tab 1 (Researcher) → Tab 2 (Reviewer) → Tab 3 (Enhancer) → Tab 4 (Reporter)"
          : "All 4 agents will research in parallel, then cross-enhance each other's findings."
      }`,
      isAI: true,
    });

    try {
      const res = await fetch("/api/rer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, topic, mode }),
      });
      if (!res.ok) throw new Error("Failed to start RER");
    } catch (err) {
      toast({ title: "Failed to start pipeline", variant: "destructive" });
    }
  }, [sendMessage, roomId, toast]);

  const handleShare = async () => {
    const url = `${window.location.origin}?room=${encodeURIComponent(roomId)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Room link copied!" });
    } catch {
      toast({ title: "Share link", description: url });
    }
  };

  const handleToggleLock = () => {
    if (room?.ownerUid === uid) {
      sendMessage({ type: "lock", roomId, isOpen: !room.isOpen });
    }
  };

  const isOwner = room?.ownerUid === uid;
  const onlineCount = members.filter(m => Date.now() - new Date(m.lastSeen).getTime() < 60000).length;

  // Find the active RER task to highlight which agent tab is currently running
  const activeTask = rerTasks.find(t => t.status === "running");
  const latestTask = rerTasks[0];
  const agentOutputs = latestTask?.agentOutputs || [];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left Sidebar */}
      <RoomSidebar roomId={roomId} membersOnline={onlineCount} />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top Bar */}
        <header className="px-4 py-2.5 border-b border-border bg-card flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-card-foreground">ZQ Workstation</span>
            <span className="text-muted-foreground text-xs">/</span>
            <span className="text-xs text-muted-foreground font-mono">{roomId}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {connected
              ? <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              : <WifiOff className="w-3.5 h-3.5 text-destructive" />}
            <span className="text-xs text-muted-foreground">{onlineCount} online</span>
          </div>

          {activeTask && (
            <Badge variant="secondary" className="text-xs gap-1 animate-pulse">
              RER running — {activeTask.mode} · step {activeTask.currentStep}/{activeTask.totalSteps}
            </Badge>
          )}

          {latestTask?.status === "done" && (
            <Badge className="text-xs bg-emerald-500/15 text-emerald-600 border-emerald-500/20">
              Last RER complete
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleShare} data-testid="button-share">
              <Share2 className="w-4 h-4" />
            </Button>
            {isOwner && (
              <Button variant="ghost" size="icon" onClick={handleToggleLock} data-testid="button-lock">
                {room?.isOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </header>

        {/* RER Label */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Review · Enhance · Report — Agent Tabs
          </h2>
          {latestTask && (
            <span className="text-xs text-muted-foreground truncate max-w-xs">
              Topic: {latestTask.topic}
            </span>
          )}
        </div>

        {/* 4 Agent Tabs Grid */}
        <div className="flex-1 grid grid-cols-2 gap-3 p-3 overflow-auto">
          {[0, 1, 2, 3].map((i) => (
            <AgentTab
              key={i}
              index={i}
              agentOutput={agentOutputs[i] || null}
              isActive={activeTask?.currentStep === i && activeTask.status === "running"}
            />
          ))}
        </div>
      </div>

      {/* Right: Command Center */}
      <CommandCenter
        messages={messages}
        currentUserId={uid}
        roomId={roomId}
        rerTasks={rerTasks}
        onSendMessage={handleSendMessage}
        onStartRer={handleStartRer}
      />
    </div>
  );
}
