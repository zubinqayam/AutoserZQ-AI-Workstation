import { useState } from "react";
import { Users, Settings, Home, FlaskConical, BookOpen, FolderPlus, ChevronRight, ChevronDown, Folder, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface RoomSidebarProps {
  roomId: string;
  membersOnline: number;
}

interface FolderNode {
  id: string;
  name: string;
  type: "folder" | "file";
  children?: FolderNode[];
}

export default function RoomSidebar({ roomId, membersOnline }: RoomSidebarProps) {
  const [folders, setFolders] = useState<FolderNode[]>([
    {
      id: "1",
      name: "Research Papers",
      type: "folder",
      children: [
        { id: "1-1", name: "AI Models", type: "folder", children: [] },
        { id: "1-2", name: "Literature Review", type: "folder", children: [] },
      ],
    },
    {
      id: "2",
      name: "Data Analysis",
      type: "folder",
      children: [],
    },
  ]);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const handleAddFolder = () => {
    if (newFolderName.trim()) {
      setFolders([...folders, {
        id: Date.now().toString(),
        name: newFolderName,
        type: "folder",
        children: [],
      }]);
      setNewFolderName("");
      setShowNewFolder(false);
    }
  };

  return (
    <div className="h-screen border-r border-border bg-sidebar flex flex-col">
      <div className="p-4 border-b border-sidebar-border">
        <h1 className="text-sm font-semibold tracking-wide text-sidebar-foreground">ZQ Workstation</h1>
        <p className="text-xs text-muted-foreground mt-1">Research Platform</p>
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

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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

        <div className="pt-3 mt-3 border-t border-sidebar-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Projects</span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={() => setShowNewFolder(!showNewFolder)}
              data-testid="button-add-folder"
            >
              <FolderPlus className="w-3 h-3" />
            </Button>
          </div>

          {showNewFolder && (
            <div className="flex gap-1 mb-2">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="h-7 text-xs"
                onKeyPress={(e) => e.key === "Enter" && handleAddFolder()}
                data-testid="input-new-folder"
              />
              <Button 
                size="sm" 
                className="h-7 px-2" 
                onClick={handleAddFolder}
                data-testid="button-create-folder"
              >
                Add
              </Button>
            </div>
          )}

          <div className="space-y-1">
            {folders.map((folder) => (
              <FolderItem key={folder.id} node={folder} level={0} />
            ))}
          </div>
        </div>
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

function FolderItem({ node, level }: { node: FolderNode; level: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;

  if (node.type === "file") {
    return (
      <div 
        className="flex items-center gap-2 px-2 py-1 rounded-md text-xs hover-elevate active-elevate-2 cursor-pointer"
        style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
        data-testid={`file-${node.id}`}
      >
        <File className="w-3 h-3 text-muted-foreground" />
        <span className="text-sidebar-foreground">{node.name}</span>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div 
          className="flex items-center gap-2 px-2 py-1 rounded-md text-xs hover-elevate active-elevate-2"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          data-testid={`folder-${node.id}`}
        >
          {hasChildren ? (
            isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          ) : (
            <div className="w-3" />
          )}
          <Folder className="w-3 h-3 text-muted-foreground" />
          <span className="text-sidebar-foreground">{node.name}</span>
        </div>
      </CollapsibleTrigger>
      {hasChildren && (
        <CollapsibleContent>
          {node.children?.map((child) => (
            <FolderItem key={child.id} node={child} level={level + 1} />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
