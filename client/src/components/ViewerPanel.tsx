import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ViewerPanelProps {
  index: number;
  url: string;
  collapsed: boolean;
  safeMode: boolean;
  onUrlChange?: (url: string) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function ViewerPanel({
  index,
  url,
  collapsed,
  safeMode,
  onUrlChange,
  onCollapsedChange,
}: ViewerPanelProps) {
  const [inputUrl, setInputUrl] = useState(url);

  const handleGo = () => {
    onUrlChange?.(inputUrl);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGo();
    }
  };

  return (
    <div className="flex flex-col border border-border rounded-xl bg-card overflow-hidden">
      <div className="bg-card/50 px-3 py-2 border-b border-card-border flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Panel {index + 1}</span>
        <div className="flex-1 flex items-center gap-1">
          <Input
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="https://example.com"
            className="flex-1 h-7 text-xs bg-background/50"
            data-testid={`input-url-${index}`}
          />
          <Button
            size="sm"
            onClick={handleGo}
            className="h-7 px-2"
            data-testid={`button-go-${index}`}
          >
            Go
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onCollapsedChange?.(!collapsed)}
          data-testid={`button-collapse-${index}`}
        >
          {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </Button>
      </div>

      {!collapsed && (
        <div className="flex-1 bg-background relative min-h-[200px]">
          {url ? (
            <iframe
              src={url}
              className="w-full h-full"
              sandbox={safeMode ? "allow-scripts allow-same-origin" : undefined}
              title={`Panel ${index + 1}`}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <ExternalLink className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Enter URL above</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
