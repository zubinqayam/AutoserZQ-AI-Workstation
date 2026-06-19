import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Play, Zap, GitBranch, ChevronDown, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { ChatMessage } from "@shared/schema";
import type { RerTaskWithOutputs } from "@/hooks/use-websocket";

interface CommandCenterProps {
  messages: ChatMessage[];
  currentUserId: string;
  roomId: string;
  rerTasks: RerTaskWithOutputs[];
  onSendMessage: (text: string) => void;
  onStartRer: (topic: string, mode: "sequential" | "parallel") => void;
}

export default function CommandCenter({
  messages,
  currentUserId,
  roomId,
  rerTasks,
  onSendMessage,
  onStartRer,
}: CommandCenterProps) {
  const [input, setInput] = useState("");
  const [rerMode, setRerMode] = useState<"sequential" | "parallel">("sequential");
  const [activeTab, setActiveTab] = useState<"chat" | "tasks">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleStartRer = () => {
    if (!input.trim()) return;
    onStartRer(input.trim(), rerMode);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeTask = rerTasks.find(t => t.status === "running");
  const doneTasks = rerTasks.filter(t => t.status === "done");

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
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Running
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Supervisor AI — assign tasks, monitor agents</p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        <button
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === "chat"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("chat")}
          data-testid="tab-chat"
        >
          Chat
        </button>
        <button
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === "tasks"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("tasks")}
          data-testid="tab-tasks"
        >
          Tasks {rerTasks.length > 0 && `(${rerTasks.length})`}
        </button>
      </div>

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
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.authorUid === currentUserId ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${msg.id}`}
                >
                  {msg.authorUid !== currentUserId && (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {msg.isAI ? <Bot className="w-3 h-3 text-primary" /> : <User className="w-3 h-3 text-muted-foreground" />}
                    </div>
                  )}
                  <div
                    className={`px-3 py-2 rounded-xl max-w-[85%] text-xs leading-relaxed ${
                      msg.authorUid === currentUserId
                        ? "bg-primary text-primary-foreground"
                        : msg.isAI
                        ? "bg-muted text-foreground"
                        : "bg-background border border-border text-foreground"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="p-3 border-t border-border space-y-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter research topic or chat with supervisor…"
              className="resize-none text-xs min-h-[72px] bg-background/50"
              data-testid="input-command"
            />
            <div className="flex items-center gap-2">
              {/* RER Mode toggle */}
              <div className="flex items-center gap-1 border border-border rounded-md p-0.5 bg-background/50">
                <button
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    rerMode === "sequential" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setRerMode("sequential")}
                  data-testid="mode-sequential"
                >
                  <GitBranch className="w-3 h-3" />
                  Seq
                </button>
                <button
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    rerMode === "parallel" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setRerMode("parallel")}
                  data-testid="mode-parallel"
                >
                  <Zap className="w-3 h-3" />
                  Para
                </button>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 text-xs"
                onClick={handleStartRer}
                disabled={!input.trim() || !!activeTask}
                data-testid="button-run-rer"
              >
                <Play className="w-3 h-3" />
                Run RER
              </Button>

              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim()}
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-start gap-1">
              <p className="text-xs text-muted-foreground">
                {rerMode === "sequential"
                  ? "Sequential: Tab 1→2→3→4 each enhancing the last"
                  : "Parallel: All 4 tabs research simultaneously, then exchange"}
              </p>
            </div>
          </div>
        </>
      )}

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
            {rerTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: RerTaskWithOutputs }) {
  const [expanded, setExpanded] = useState(task.status === "running");

  const statusColor = {
    pending: "text-muted-foreground",
    running: "text-primary",
    done: "text-emerald-500",
    error: "text-destructive",
  }[task.status] || "text-muted-foreground";

  const progress = task.totalSteps > 0 ? Math.round((task.currentStep / task.totalSteps) * 100) : 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background/40">
      <div
        className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover-elevate"
        onClick={() => setExpanded(!expanded)}
      >
        {task.status === "running" ? (
          <Loader2 className={`w-3.5 h-3.5 animate-spin ${statusColor} flex-shrink-0`} />
        ) : task.status === "done" ? (
          <CheckCircle2 className={`w-3.5 h-3.5 ${statusColor} flex-shrink-0`} />
        ) : (
          <div className={`w-3.5 h-3.5 rounded-full border-2 border-current ${statusColor} flex-shrink-0`} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-card-foreground truncate">{task.topic}</p>
          <p className="text-xs text-muted-foreground">
            {task.mode === "sequential" ? "Sequential" : "Parallel"} · Step {task.currentStep}/{task.totalSteps}
          </p>
        </div>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>

      {/* Progress bar */}
      {task.status === "running" && (
        <div className="h-0.5 bg-border">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {expanded && task.agentOutputs.length > 0 && (
        <div className="border-t border-border divide-y divide-border">
          {task.agentOutputs.map((out) => (
            <div key={out.id} className="px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium capitalize text-muted-foreground">{out.role}</span>
                <span className={`text-xs ml-auto ${
                  out.status === "done" ? "text-emerald-500" :
                  out.status === "thinking" ? "text-primary" :
                  out.status === "error" ? "text-destructive" :
                  "text-muted-foreground"
                }`}>
                  {out.status === "thinking" ? "Working…" : out.status}
                </span>
              </div>
              {out.output && (
                <p className="text-xs text-foreground/70 line-clamp-2">{out.output.slice(0, 120)}…</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
