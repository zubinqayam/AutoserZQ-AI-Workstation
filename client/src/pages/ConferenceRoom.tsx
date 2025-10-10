import { useState, useMemo } from "react";
import RoomSidebar from "@/components/RoomSidebar";
import ControlHeader from "@/components/ControlHeader";
import ViewerGrid from "@/components/ViewerGrid";
import CommentCenter from "@/components/CommentCenter";

export default function ConferenceRoom() {
  const roomId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("room") || "demo";
  }, []);

  const [safeMode, setSafeMode] = useState(true);
  const [roomOpen, setRoomOpen] = useState(true);
  const [membersOnline] = useState(1);
  
  const [urls, setUrls] = useState([
    "https://www.example.com",
    "",
    "",
    ""
  ]);
  
  const [collapsed, setCollapsed] = useState([false, false, false, false]);
  
  const [messages, setMessages] = useState([
    { id: '1', authorUid: 'system', text: 'Welcome to AutoserGPT AI Workstation! Share this room link to collaborate.', isAI: true }
  ]);

  const handleUrlChange = (index: number, url: string) => {
    const newUrls = [...urls];
    newUrls[index] = url;
    setUrls(newUrls);
  };

  const handleCollapsedChange = (index: number, isCollapsed: boolean) => {
    const newCollapsed = [...collapsed];
    newCollapsed[index] = isCollapsed;
    setCollapsed(newCollapsed);
  };

  const handleMinimizeAll = () => {
    setCollapsed([true, true, true, true]);
  };

  const handleRestoreAll = () => {
    setCollapsed([false, false, false, false]);
  };

  const handleSendMessage = (text: string) => {
    setMessages([...messages, {
      id: Date.now().toString(),
      authorUid: 'me',
      text,
      isAI: false
    }]);
  };

  return (
    <div className="flex h-screen bg-background">
      <RoomSidebar roomId={roomId} membersOnline={membersOnline} />
      
      <div className="flex-1 flex flex-col">
        <ControlHeader
          roomId={roomId}
          isOwner={true}
          roomOpen={roomOpen}
          onToggleLock={() => setRoomOpen(!roomOpen)}
          onMinimizeAll={handleMinimizeAll}
          onRestoreAll={handleRestoreAll}
          safeMode={safeMode}
          onSafeModeChange={setSafeMode}
        />
        
        <div className="flex-1 overflow-hidden">
          <ViewerGrid
            urls={urls}
            collapsed={collapsed}
            safeMode={safeMode}
            onUrlChange={handleUrlChange}
            onCollapsedChange={handleCollapsedChange}
          />
        </div>
      </div>

      <CommentCenter
        messages={messages}
        currentUserId="me"
        onSendMessage={handleSendMessage}
        aiEnabled={true}
      />
    </div>
  );
}
