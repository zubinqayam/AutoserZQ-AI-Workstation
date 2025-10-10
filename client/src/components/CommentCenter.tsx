import { useState } from "react";
import { Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  id: string;
  authorUid: string;
  text: string;
  isAI?: boolean;
}

interface CommentCenterProps {
  messages: Message[];
  currentUserId: string;
  onSendMessage?: (text: string) => void;
  aiEnabled?: boolean;
}

export default function CommentCenter({
  messages,
  currentUserId,
  onSendMessage,
  aiEnabled = true,
}: CommentCenterProps) {
  const [inputText, setInputText] = useState("");

  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage?.(inputText);
      setInputText("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen border-l border-border bg-card flex flex-col">
      <div className="p-4 border-b border-card-border">
        <h2 className="text-sm font-semibold tracking-wide text-card-foreground">Comment Center</h2>
        <div className="flex items-center gap-2 mt-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              defaultChecked={aiEnabled}
              className="w-3 h-3"
              data-testid="checkbox-ai-assist"
            />
            AI Assist
          </label>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.authorUid === currentUserId ? 'justify-end' : 'justify-start'}`}
            >
              {msg.authorUid !== currentUserId && (
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {msg.isAI ? (
                    <Bot className="w-3 h-3 text-primary" />
                  ) : (
                    <User className="w-3 h-3 text-primary" />
                  )}
                </div>
              )}
              <div
                className={`px-3 py-2 rounded-xl max-w-[80%] ${
                  msg.authorUid === currentUserId
                    ? 'bg-primary text-primary-foreground'
                    : msg.isAI
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-background/50 text-foreground'
                }`}
                data-testid={`message-${msg.id}`}
              >
                <p className="text-sm">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-card-border">
        <div className="flex gap-2">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 bg-background/50"
            data-testid="input-comment"
          />
          <Button
            size="icon"
            onClick={handleSend}
            data-testid="button-send-comment"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
