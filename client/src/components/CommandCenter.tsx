import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, Play, Zap, GitBranch, ChevronDown, ChevronRight,
  CheckCircle2, Loader2, Mic, MicOff, Camera, Paperclip, Link2,
  Upload, FolderOpen, X, ChevronLeft, ChevronRight as ChevronRightIcon,
  File, Image as ImageIcon, AlertCircle, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { ChatMessage } from "@shared/schema";
import type { RerTaskWithOutputs } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";

interface CommandCenterProps {
  messages: ChatMessage[];
  currentUserId: string;
  roomId: string;
  rerTasks: RerTaskWithOutputs[];
  onSendMessage: (text: string) => void;
  onStartRer: (topic: string, mode: "sequential" | "parallel") => void;
}

interface Attachment {
  id: string;
  name: string;
  type: "file" | "image" | "link" | "camera";
  preview?: string;
  url?: string;
  size?: number;
  content?: string;
  loading?: boolean;
  error?: string;
}

export default function CommandCenter({
  messages, currentUserId, roomId, rerTasks, onSendMessage, onStartRer,
}: CommandCenterProps) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [rerMode, setRerMode] = useState<"sequential" | "parallel">("sequential");
  const [activeTab, setActiveTab] = useState<"chat" | "tasks">("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ── Conference Room tab routing ───────────────────────────────────────────────
  const tryTabRoute = (raw: string): boolean => {
    const t = raw.trim();
    // @tab1 <url/search>  |  @tab2 …  |  @tab3 …  |  @tab4 …  |  @all <url/search>
    const m = t.match(/^@(tab[1-4]|all)\s+(.+)$/i);
    if (!m) return false;
    const target = m[1].toLowerCase();
    const dest   = m[2].trim();
    if (target === "all") {
      window.dispatchEvent(new CustomEvent("zq-tab-navigate", { detail: { tab: "all", url: dest } }));
    } else {
      const tabNum = parseInt(target.replace("tab", ""), 10);
      window.dispatchEvent(new CustomEvent("zq-tab-navigate", { detail: { tab: tabNum, url: dest } }));
    }
    toast({ title: `Conference Room`, description: `${target.toUpperCase()} → ${dest}` });
    return true;
  };

  const handleSend = () => {
    if (!input.trim() && attachments.length === 0) return;
    if (attachments.some(a => a.loading)) {
      toast({ title: "Still reading…", description: "Wait for files/URLs to finish loading before sending." });
      return;
    }
    // Check for @tab routing first
    if (input.trim() && tryTabRoute(input.trim())) {
      setInput(""); setAttachments([]);
      return;
    }
    let text = input.trim();
    if (attachments.length > 0) {
      const attStr = attachments.map(a => {
        if (a.content) {
          const label = a.type === "link" ? `URL: ${a.url}` : `File: ${a.name}`;
          return `\n\n--- ${label} ---\n${a.content}\n--- end ---`;
        }
        if (a.error) return `[${a.name}: ${a.error}]`;
        if (a.type === "image") return `[Image attached: ${a.name}]`;
        return `[${a.name}]`;
      }).join("");
      text = text ? `${text}${attStr}` : attStr.trim();
    }
    onSendMessage(text);
    setInput(""); setAttachments([]);
  };

  const handleStartRer = () => {
    if (!input.trim()) return;
    onStartRer(input.trim(), rerMode);
    setInput(""); setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Voice ────────────────────────────────────────────────────────────────────
  const toggleVoice = () => {
    if (voiceOn) { recRef.current?.stop(); setVoiceOn(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "Voice not supported in this browser" }); return; }
    const r = new SR(); r.continuous = false; r.interimResults = false; r.lang = "en-US";
    r.onresult = (e: any) => { setInput(p => p + (p ? " " : "") + e.results[0][0].transcript); setVoiceOn(false); };
    r.onerror = () => setVoiceOn(false); r.onend = () => setVoiceOn(false);
    recRef.current = r; r.start(); setVoiceOn(true);
  };

  // ── Camera ───────────────────────────────────────────────────────────────────
  const captureCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream; video.play();
      await new Promise(r => video.onplaying = r);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setAttachments(p => [...p, { id: Date.now().toString(), name: "camera-capture.jpg", type: "camera", preview: dataUrl }]);
      toast({ title: "Camera capture added" });
    } catch { toast({ title: "Camera access denied", variant: "destructive" }); }
  }, [toast]);

  // ── File / Folder ────────────────────────────────────────────────────────────
  const TEXT_TYPES = ["text/", "application/json", "application/xml", "application/javascript",
    "application/typescript", "application/markdown", "application/x-yaml", "application/csv"];
  const TEXT_EXTS = [".txt", ".md", ".json", ".csv", ".xml", ".js", ".ts", ".py", ".yaml", ".yml",
    ".html", ".css", ".sh", ".log", ".sql", ".r", ".tex", ".rst"];

  const processFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const isImg = file.type.startsWith("image/");
      const isText = TEXT_TYPES.some(t => file.type.startsWith(t)) ||
        TEXT_EXTS.some(ext => file.name.toLowerCase().endsWith(ext));

      if (isImg) {
        const reader = new FileReader();
        reader.onload = e => setAttachments(p => [...p, {
          id: Date.now().toString(), name: file.name, type: "image",
          preview: e.target?.result as string, size: file.size,
        }]);
        reader.readAsDataURL(file);
      } else if (isText) {
        const id = Date.now().toString() + Math.random();
        setAttachments(p => [...p, { id, name: file.name, type: "file", size: file.size, loading: true }]);
        const reader = new FileReader();
        reader.onload = e => {
          const text = (e.target?.result as string || "").slice(0, 12000);
          setAttachments(p => p.map(a => a.id === id ? { ...a, content: text, loading: false } : a));
        };
        reader.onerror = () => {
          setAttachments(p => p.map(a => a.id === id ? { ...a, error: "Read failed", loading: false } : a));
        };
        reader.readAsText(file);
      } else {
        setAttachments(p => [...p, {
          id: Date.now().toString(), name: file.name, type: "file", size: file.size,
          error: "Binary file — only text/code files can be read",
        }]);
      }
    });
  };

  // ── Drag and Drop ────────────────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length) { processFiles(e.dataTransfer.files); return; }
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (url?.startsWith("http")) setAttachments(p => [...p, { id: Date.now().toString(), name: url, type: "link", url }]);
  };

  const addLink = async () => {
    const url = linkUrl.trim();
    if (!url) return;
    const id = Date.now().toString() + Math.random();
    const label = url.length > 40 ? url.slice(0, 38) + "…" : url;
    setAttachments(p => [...p, { id, name: label, type: "link", url, loading: true }]);
    setLinkUrl(""); setLinkMode(false);
    try {
      const res = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.content) {
        setAttachments(p => p.map(a => a.id === id ? { ...a, content: data.content, loading: false } : a));
        toast({ title: "URL content loaded", description: `${data.content.length.toLocaleString()} characters read` });
      } else {
        setAttachments(p => p.map(a => a.id === id ? { ...a, error: data.error || "Failed to read", loading: false } : a));
        toast({ title: "Could not read URL", description: data.error, variant: "destructive" });
      }
    } catch {
      setAttachments(p => p.map(a => a.id === id ? { ...a, error: "Network error", loading: false } : a));
    }
  };

  const removeAttachment = (id: string) => setAttachments(p => p.filter(a => a.id !== id));

  const activeTask = rerTasks.find(t => t.status === "running");

  // ── Collapsed state — just show a vertical tab ───────────────────────────────
  if (collapsed) {
    return (
      <div className="h-full flex flex-col items-center justify-between bg-card border-l border-border py-3" style={{ width: "40px", minWidth: "40px" }}>
        <button
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 hover-elevate"
          onClick={() => setCollapsed(false)}
          title="Expand Command Center"
          data-testid="btn-expand-cc"
        >
          <ChevronLeft className="w-4 h-4 text-primary" />
        </button>
        <div className="flex flex-col items-center gap-2">
          <div className="w-1 h-16 rounded-full bg-border" />
          <span className="text-[9px] text-muted-foreground font-mono" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            COMMAND CENTER
          </span>
          <div className="w-1 h-16 rounded-full bg-border" />
        </div>
        {activeTask && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
        <div className="w-2" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card border-l border-border" style={{ width: "340px", minWidth: "340px" }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-card-foreground">Command Center</span>
          {activeTask && (
            <Badge variant="secondary" className="text-xs gap-1 ml-auto">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Running
            </Badge>
          )}
          <Button
            variant="ghost" size="icon" className="h-6 w-6 ml-auto flex-shrink-0"
            onClick={() => setCollapsed(true)}
            title="Minimize"
            data-testid="btn-collapse-cc"
          >
            <ChevronRightIcon className="w-3.5 h-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Supervisor AI — assign tasks, monitor agents</p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border flex-shrink-0">
        {(["chat", "tasks"] as const).map(t => (
          <button key={t}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActiveTab(t)} data-testid={`tab-${t}`}>
            {t === "tasks" ? `Tasks${rerTasks.length > 0 ? ` (${rerTasks.length})` : ""}` : "Chat"}
          </button>
        ))}
      </div>

      {/* ── CHAT TAB ──────────────────────────────────────────────────────────── */}
      {activeTab === "chat" && (
        <>
          <ScrollArea className="flex-1" ref={scrollRef as any}>
            <div className="p-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">Supervisor AI is ready.</p>
                  <p className="text-xs text-muted-foreground mt-1">Type a research topic and hit Run RER to start the pipeline.</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id}
                  className={`flex gap-2 ${msg.authorUid === currentUserId ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${msg.id}`}>
                  {msg.authorUid !== currentUserId && (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {msg.isAI ? <Bot className="w-3 h-3 text-primary" /> : <User className="w-3 h-3 text-muted-foreground" />}
                    </div>
                  )}
                  <div className={`px-3 py-2 rounded-xl max-w-[85%] text-xs leading-relaxed ${
                    msg.authorUid === currentUserId
                      ? "bg-primary text-primary-foreground"
                      : msg.isAI
                      ? "bg-muted text-foreground"
                      : "bg-background border border-border text-foreground"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* ── Input Area ─────────────────────────────────────────────────────── */}
          <div className="border-t border-border flex-shrink-0">
            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                {attachments.map(a => (
                  <div key={a.id}
                    title={a.content ? `${a.content.length.toLocaleString()} chars read` : a.error || a.name}
                    className={`relative flex items-center gap-1 rounded-lg pl-1.5 pr-6 py-1 text-[10px] max-w-[160px] border ${
                      a.error ? "bg-destructive/10 border-destructive/30 text-destructive"
                      : a.content ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : a.loading ? "bg-muted border-border text-muted-foreground"
                      : "bg-muted border-border text-muted-foreground"
                    }`}>
                    {a.loading
                      ? <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin" />
                      : a.error
                      ? <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      : a.content
                      ? <FileText className="w-3 h-3 flex-shrink-0" />
                      : a.type === "image" || a.type === "camera"
                      ? a.preview
                        ? <img src={a.preview} className="w-4 h-4 rounded object-cover flex-shrink-0" />
                        : <ImageIcon className="w-3 h-3 flex-shrink-0" />
                      : a.type === "link"
                      ? <Link2 className="w-3 h-3 flex-shrink-0" />
                      : <File className="w-3 h-3 flex-shrink-0" />}
                    <span className="truncate">{a.name.length > 18 ? a.name.slice(0,16)+"…" : a.name}</span>
                    {a.content && <span className="text-[8px] opacity-60 flex-shrink-0">✓read</span>}
                    {a.loading && <span className="text-[8px] opacity-60 flex-shrink-0">reading…</span>}
                    <button className="absolute right-1 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100" onClick={() => removeAttachment(a.id)}>
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Link input */}
            {linkMode && (
              <div className="flex gap-1 px-3 pt-2">
                <input
                  className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary/50"
                  placeholder="Paste URL…"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addLink()}
                  autoFocus
                  data-testid="input-link"
                />
                <Button size="sm" className="h-7 px-2 text-xs" onClick={addLink}>Add</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setLinkMode(false)}>Cancel</Button>
              </div>
            )}

            {/* Drop zone + textarea */}
            <div
              className={`relative mx-3 mt-2 rounded-xl border transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border"}`}
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            >
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10 pointer-events-none">
                  <p className="text-xs text-primary font-semibold">Drop files or links here</p>
                </div>
              )}
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Research topic, question, or drop files…"
                className="resize-none text-xs min-h-[64px] bg-transparent border-0 focus-visible:ring-0 rounded-xl"
                data-testid="input-command"
              />
            </div>

            {/* Media toolbar */}
            <div className="flex items-center gap-0.5 px-3 pt-1.5 pb-1">
              {/* Hidden file inputs */}
              <input ref={fileInputRef} type="file" className="hidden" multiple
                onChange={e => processFiles(e.target.files)} data-testid="input-file" />
              <input ref={folderInputRef} type="file" className="hidden" multiple
                {...{ webkitdirectory: "" } as any}
                onChange={e => processFiles(e.target.files)} data-testid="input-folder" />

              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" title="Attach file"
                onClick={() => fileInputRef.current?.click()} data-testid="btn-attach">
                <Paperclip className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" title="Upload folder"
                onClick={() => folderInputRef.current?.click()} data-testid="btn-folder">
                <FolderOpen className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" title="Add link"
                onClick={() => setLinkMode(v => !v)} data-testid="btn-link">
                <Link2 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" title="Upload"
                onClick={() => fileInputRef.current?.click()} data-testid="btn-upload">
                <Upload className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className={`h-7 w-7 flex-shrink-0 ${voiceOn ? "text-primary" : ""}`}
                title="Voice input" onClick={toggleVoice} data-testid="btn-voice">
                {voiceOn ? <MicOff className="w-3.5 h-3.5 animate-pulse text-primary" /> : <Mic className="w-3.5 h-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" title="Camera capture"
                onClick={captureCamera} data-testid="btn-camera">
                <Camera className="w-3.5 h-3.5" />
              </Button>

              <div className="flex-1" />

              {/* RER Mode + action buttons */}
              <div className="flex items-center gap-1 border border-border rounded-md p-0.5 bg-background/50 flex-shrink-0">
                <button
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${rerMode === "sequential" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setRerMode("sequential")} data-testid="mode-sequential">
                  <GitBranch className="w-3 h-3" /> Seq
                </button>
                <button
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${rerMode === "parallel" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setRerMode("parallel")} data-testid="mode-parallel">
                  <Zap className="w-3 h-3" /> Para
                </button>
              </div>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1 flex-shrink-0"
                onClick={handleStartRer} disabled={!input.trim() || !!activeTask} data-testid="button-run-rer">
                <Play className="w-3 h-3" /> Run RER
              </Button>
              <Button size="icon" className="h-7 w-7 flex-shrink-0"
                onClick={handleSend} disabled={!input.trim() && attachments.length === 0} data-testid="button-send">
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground px-3 pb-2">
              {rerMode === "sequential" ? "Sequential: Tab 1→2→3→4 each enhancing the last" : "Parallel: All 4 tabs research simultaneously, then exchange"}
            </p>
          </div>
        </>
      )}

      {/* ── TASKS TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === "tasks" && (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {rerTasks.length === 0 && (
              <div className="text-center py-8">
                <Play className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">No tasks yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Use the Chat tab to assign a research task.</p>
              </div>
            )}
            {rerTasks.map(task => <TaskCard key={task.id} task={task} />)}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: RerTaskWithOutputs }) {
  const [expanded, setExpanded] = useState(task.status === "running");

  const statusColor = {
    pending: "text-muted-foreground", running: "text-primary",
    done: "text-emerald-500", error: "text-destructive",
  }[task.status] || "text-muted-foreground";

  const progress = task.totalSteps > 0 ? Math.round((task.currentStep / task.totalSteps) * 100) : 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background/40">
      <div className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover-elevate" onClick={() => setExpanded(!expanded)}>
        {task.status === "running"
          ? <Loader2 className={`w-3.5 h-3.5 animate-spin ${statusColor} flex-shrink-0`} />
          : task.status === "done"
          ? <CheckCircle2 className={`w-3.5 h-3.5 ${statusColor} flex-shrink-0`} />
          : <div className={`w-3.5 h-3.5 rounded-full border-2 border-current ${statusColor} flex-shrink-0`} />}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-card-foreground truncate">{task.topic}</p>
          <p className="text-xs text-muted-foreground">{task.mode} · Step {task.currentStep}/{task.totalSteps}</p>
        </div>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>
      {task.status === "running" && (
        <div className="h-0.5 bg-border">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}
      {expanded && task.agentOutputs.length > 0 && (
        <div className="border-t border-border divide-y divide-border">
          {task.agentOutputs.map(out => (
            <div key={out.id} className="px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium capitalize text-muted-foreground">{out.role}</span>
                <span className={`text-xs ml-auto ${out.status === "done" ? "text-emerald-500" : out.status === "thinking" ? "text-primary" : out.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                  {out.status === "thinking" ? "Working…" : out.status}
                </span>
              </div>
              {out.output && <p className="text-xs text-foreground/70 line-clamp-2">{out.output.slice(0,120)}…</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
