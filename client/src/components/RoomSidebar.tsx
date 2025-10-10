import { Users, Settings, Home, FlaskConical, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RoomSidebarProps {
  roomId: string;
  membersOnline: number;
}

export default function RoomSidebar({ roomId, membersOnline }: RoomSidebarProps) {
  return (
    <div className="h-screen border-r border-border bg-sidebar flex flex-col">
      <div className="p-4 border-b border-sidebar-border">
        <h1 className="text-sm font-semibold tracking-wide text-sidebar-foreground">AutoserGPT</h1>
        <p className="text-xs text-muted-foreground mt-1">AI Workstation</p>
      </div>

      <div className="p-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Room</p>
            <p className="text-sm font-medium text-sidebar-foreground truncate">{roomId}</p>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-status-online animate-pulse" />
            <span className="text-xs text-muted-foreground">{membersOnline}</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 hover-elevate active-elevate-2"
          data-testid="nav-control-panel"
        >
          <Home className="w-4 h-4" />
          <span className="text-sm">Control Panel</span>
        </Button>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 hover-elevate active-elevate-2"
          data-testid="nav-rer-tab"
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-sm">RER Tab</span>
        </Button>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 hover-elevate active-elevate-2"
          data-testid="nav-research"
        >
          <FlaskConical className="w-4 h-4" />
          <span className="text-sm">Research</span>
        </Button>
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start gap-3 hover-elevate active-elevate-2"
          data-testid="nav-settings"
        >
          <Settings className="w-4 h-4" />
          <span className="text-sm">Settings</span>
        </Button>
      </div>
    </div>
  );
}
