import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Settings, FlaskConical, BookOpen, FolderPlus, ChevronRight, ChevronDown,
  Folder, FileText, LayoutDashboard, Plus, MoreHorizontal, LogOut, User,
  GitBranch, History, Gauge, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RoomSidebarProps {
  roomId: string;
  membersOnline: number;
  activeNav: string;
  onNavChange: (nav: string) => void;
}

interface UsageData {
  geminiCalls: number; rerLaunches: number; coaCalls: number;
}
interface UsageLimits {
  geminiPerDay: number; rerPerDay: number; coaPerDay: number;
}
interface UsageState {
  usage: UsageData; tier: string; limits: UsageLimits;
}

interface FolderNode {
  id: string; name: string; type: "folder" | "file"; children?: FolderNode[];
}

const DEFAULT_FOLDERS: FolderNode[] = [
  { id: "1", name: "Research Papers", type: "folder", children: [
    { id: "1-1", name: "AI & Machine Learning", type: "folder", children: [] },
    { id: "1-2", name: "Literature Review", type: "folder", children: [] },
    { id: "1-3", name: "survey_draft.md", type: "file" },
  ]},
  { id: "2", name: "Data Analysis", type: "folder", children: [
    { id: "2-1", name: "datasets", type: "folder", children: [] },
    { id: "2-2", name: "notes.md", type: "file" },
  ]},
  { id: "3", name: "Reports", type: "folder", children: [] },
];

export default function RoomSidebar({ roomId, membersOnline, activeNav, onNavChange }: RoomSidebarProps) {
  const [, navigate] = useLocation();
  const [folders, setFolders] = useState<FolderNode[]>(DEFAULT_FOLDERS);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [usage, setUsage] = useState<UsageState | null>(null);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem("zq_user") || "null"); } catch { return null; }
  })();
  const displayName = localStorage.getItem("zq_displayName") || "User";
  const isGuest = !user?.email;

  useEffect(() => {
    if (isGuest) return;
    const uid = localStorage.getItem("zq_uid") || "";
    fetch("/api/usage", { headers: { "x-uid": uid } })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setUsage(d))
      .catch(() => {});
  }, [isGuest]);

  const addFolder = () => {
    if (!newFolderName.trim()) return;
    setFolders(prev => [...prev, { id: Date.now().toString(), name: newFolderName.trim(), type: "folder", children: [] }]);
    setNewFolderName(""); setShowNewFolder(false);
  };

  const addSubfolder = (parentId: string) => {
    const name = prompt("New subfolder name:");
    if (!name?.trim()) return;
    const insert = (nodes: FolderNode[]): FolderNode[] =>
      nodes.map(n => n.id === parentId
        ? { ...n, children: [...(n.children || []), { id: Date.now().toString(), name: name.trim(), type: "folder", children: [] }] }
        : { ...n, children: n.children ? insert(n.children) : n.children });
    setFolders(insert);
  };

  const deleteNode = (targetId: string) => {
    const remove = (nodes: FolderNode[]): FolderNode[] =>
      nodes.filter(n => n.id !== targetId).map(n => ({ ...n, children: n.children ? remove(n.children) : n.children }));
    setFolders(remove);
  };

  const handleSignOut = () => {
    localStorage.removeItem("zq_user");
    localStorage.removeItem("zq_uid");
    localStorage.removeItem("zq_displayName");
    navigate("/");
  };

  const NAV_ITEMS = [
    { id: "workspace", label: "Workspace",    Icon: LayoutDashboard },
    { id: "rer",       label: "RER Pipeline", Icon: FlaskConical },
    { id: "history",   label: "History",      Icon: History },
    { id: "reports",   label: "Reports",      Icon: BookOpen },
    { id: "github",    label: "GitHub",       Icon: GitBranch },
  ];

  return (
    <div className="h-screen border-r border-border bg-sidebar flex flex-col" style={{ width: "220px", minWidth: "220px" }}>
      {/* Brand */}
      <div className="px-4 py-3.5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
            <FlaskConical className="w-3 h-3 text-white" />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-tight text-sidebar-foreground leading-tight">ZQ Workstation</h1>
            <p className="text-[10px] text-muted-foreground">Research Platform</p>
          </div>
        </div>
      </div>

      {/* Room info */}
      <div className="px-3 py-2 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Room</p>
            <p className="text-xs font-medium text-sidebar-foreground truncate font-mono">{roomId}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">{membersOnline}</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="p-2 border-b border-sidebar-border space-y-0.5">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <Button
            key={id}
            variant="ghost"
            className={`w-full justify-start gap-2.5 h-8 text-xs ${activeNav === id ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
            onClick={() => onNavChange(id)}
            data-testid={`nav-${id}`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            {label}
          </Button>
        ))}
      </nav>

      {/* Projects Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between px-1 mb-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Projects</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowNewFolder(!showNewFolder)} data-testid="button-add-folder">
            <FolderPlus className="w-3 h-3" />
          </Button>
        </div>
        {showNewFolder && (
          <div className="flex gap-1 mb-2 px-1">
            <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              placeholder="Folder name…" className="h-6 text-xs px-2"
              onKeyDown={e => e.key === "Enter" && addFolder()} autoFocus data-testid="input-new-folder" />
            <Button size="sm" className="h-6 px-2 text-xs" onClick={addFolder} data-testid="button-create-folder">Add</Button>
          </div>
        )}
        <div className="space-y-0.5">
          {folders.map(node => (
            <FolderItem key={node.id} node={node} level={0} onAddSubfolder={addSubfolder} onDelete={deleteNode} />
          ))}
        </div>
      </div>

      {/* Usage bar (logged-in users only) */}
      {!isGuest && usage && (
        <div className="px-3 py-2 border-t border-sidebar-border space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Gauge className="w-3 h-3" /> Usage ({usage.tier})
          </div>
          <UsageBar label="AI" used={usage.usage.geminiCalls} max={usage.limits.geminiPerDay} />
          <UsageBar label="RER" used={usage.usage.rerLaunches} max={usage.limits.rerPerDay} />
          <UsageBar label="COA" used={usage.usage.coaCalls} max={usage.limits.coaPerDay} />
        </div>
      )}
      {isGuest && (
        <div className="px-3 py-2 border-t border-sidebar-border">
          <div className="flex items-center gap-1.5 text-[10px] text-amber-500/90">
            <AlertTriangle className="w-3 h-3" /> Guest mode — AI features disabled
          </div>
        </div>
      )}

      {/* User + Settings */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-xs" data-testid="btn-user-menu">
              <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <User className="w-2.5 h-2.5 text-primary" />
              </div>
              <span className="truncate flex-1 text-left">{displayName}</span>
              {isGuest && <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 ml-1">Guest</Badge>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-48 text-xs">
            {user?.email && <DropdownMenuItem className="text-xs text-muted-foreground cursor-default">{user.email}</DropdownMenuItem>}
            <DropdownMenuItem className="text-xs text-destructive" onClick={handleSignOut} data-testid="btn-signout">
              <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-xs" data-testid="nav-settings"
          onClick={() => onNavChange("settings")}>
          <Settings className="w-3.5 h-3.5" /> Settings
        </Button>
      </div>
    </div>
  );
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min((used / max) * 100, 100);
  const color = pct > 80 ? "bg-destructive" : pct > 50 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        <span>{label}</span>
        <span>{used}/{max}</span>
      </div>
      <div className="w-full h-1 rounded-full bg-sidebar-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FolderItem({ node, level, onAddSubfolder, onDelete }: {
  node: FolderNode; level: number;
  onAddSubfolder: (id: string) => void; onDelete: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(level === 0);
  const hasChildren = node.children && node.children.length > 0;
  const indent = level * 12;

  if (node.type === "file") {
    return (
      <div className="flex items-center gap-1.5 py-1 rounded-md text-xs hover-elevate active-elevate-2 cursor-pointer"
        style={{ paddingLeft: `${indent + 8}px` }} data-testid={`file-${node.id}`}>
        <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        <span className="text-sidebar-foreground truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center group rounded-md hover-elevate" style={{ paddingLeft: `${indent}px` }}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1.5 flex-1 py-1 px-2 text-xs rounded-md min-w-0" data-testid={`folder-${node.id}`}>
            {hasChildren || isOpen ? (isOpen ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />) : <div className="w-3 h-3 flex-shrink-0" />}
            <Folder className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="text-sidebar-foreground truncate">{node.name}</span>
          </button>
        </CollapsibleTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 mr-1 flex-shrink-0" data-testid={`folder-menu-${node.id}`}>
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => onAddSubfolder(node.id)}><Plus className="w-3 h-3 mr-2" />New Subfolder</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(node.id)}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CollapsibleContent>
        {node.children?.map(child => <FolderItem key={child.id} node={child} level={level + 1} onAddSubfolder={onAddSubfolder} onDelete={onDelete} />)}
      </CollapsibleContent>
    </Collapsible>
  );
}
