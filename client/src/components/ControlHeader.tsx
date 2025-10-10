import { useState } from "react";
import { Share2, Lock, Unlock, Minimize2, Maximize2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ControlHeaderProps {
  roomId: string;
  isOwner: boolean;
  roomOpen: boolean;
  onToggleLock?: () => void;
  onMinimizeAll?: () => void;
  onRestoreAll?: () => void;
  onLoadPreset?: (urls: string[]) => void;
  safeMode: boolean;
  onSafeModeChange?: (value: boolean) => void;
}

const URL_PRESETS = {
  research: [
    "https://scholar.google.com",
    "https://www.semanticscholar.org",
    "https://arxiv.org",
    "https://www.researchgate.net"
  ],
  ai: [
    "https://gemini.google.com",
    "https://chat.openai.com",
    "https://claude.ai",
    "https://www.perplexity.ai"
  ],
  news: [
    "https://news.google.com",
    "https://www.bbc.com/news",
    "https://www.reuters.com",
    "https://www.nytimes.com"
  ],
};

export default function ControlHeader({
  roomId,
  isOwner,
  roomOpen,
  onToggleLock,
  onMinimizeAll,
  onRestoreAll,
  onLoadPreset,
  safeMode,
  onSafeModeChange,
}: ControlHeaderProps) {
  const { toast } = useToast();

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Share link copied to clipboard" });
    } catch {
      toast({ title: "Share link", description: shareUrl });
    }
  };

  return (
    <div className="px-4 py-3 border-b border-border bg-card sticky top-0 z-20">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold tracking-wide mr-2 text-card-foreground">Control Panel</div>
        <div className="flex-1 flex items-center gap-2">
          <Input
            placeholder={`Room: ${roomId}  •  Search…`}
            className="flex-1 bg-background/50"
            data-testid="input-search"
          />
          <Button size="sm" data-testid="button-new-task">+ New Task</Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-presets">
                <BookOpen className="w-4 h-4 mr-1" />
                Presets
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onLoadPreset?.(URL_PRESETS.research)}>
                Research Tools
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onLoadPreset?.(URL_PRESETS.ai)}>
                AI Assistants
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onLoadPreset?.(URL_PRESETS.news)}>
                News Sources
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <label className="px-3 py-2 rounded-md bg-background/50 border border-border hover-elevate text-xs flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={safeMode}
              onChange={(e) => onSafeModeChange?.(e.target.checked)}
              className="w-3 h-3"
              data-testid="checkbox-safe-mode"
            />
            Safe Mode
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            data-testid="button-share"
          >
            <Share2 className="w-4 h-4" />
          </Button>
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleLock}
              data-testid="button-toggle-lock"
            >
              {roomOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onMinimizeAll}
            data-testid="button-minimize-all"
          >
            <Minimize2 className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRestoreAll}
            data-testid="button-restore-all"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
