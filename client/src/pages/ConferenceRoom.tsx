import { useState, useMemo, useEffect } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import RoomSidebar from "@/components/RoomSidebar";
import ControlHeader from "@/components/ControlHeader";
import ViewerGrid from "@/components/ViewerGrid";
import CommentCenter from "@/components/CommentCenter";

export default function ConferenceRoom() {
  const roomId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("room") || "demo";
  }, []);

  const uid = useMemo(() => {
    let storedUid = localStorage.getItem("autoserGPT_uid");
    if (!storedUid) {
      storedUid = `user-${Date.now()}`;
      localStorage.setItem("autoserGPT_uid", storedUid);
    }
    return storedUid;
  }, []);

  const displayName = useMemo(() => {
    const stored = localStorage.getItem("autoserGPT_displayName");
    return stored || `User-${uid.slice(-6)}`;
  }, [uid]);

  const {
    connected,
    room,
    members,
    messages,
    roomState,
    sendMessage,
    joinRoom,
  } = useWebSocket();

  const [safeMode, setSafeMode] = useState(true);
  const [localUrls, setLocalUrls] = useState(["", "", "", ""]);
  const [localCollapsed, setLocalCollapsed] = useState([false, false, false, false]);

  useEffect(() => {
    if (connected) {
      joinRoom(roomId, uid, displayName);
    }
  }, [connected, roomId, uid, displayName, joinRoom]);

  useEffect(() => {
    if (roomState) {
      setLocalUrls(roomState.urls || ["", "", "", ""]);
      setLocalCollapsed(roomState.collapsed || [false, false, false, false]);
    }
  }, [roomState]);

  const handleUrlChange = (index: number, url: string) => {
    const newUrls = [...localUrls];
    newUrls[index] = url;
    setLocalUrls(newUrls);

    sendMessage({
      type: "state",
      roomId,
      state: {
        urls: newUrls,
        inputs: newUrls,
        collapsed: localCollapsed,
        forceEmbed: [false, false, false, false],
        allowList: [],
      },
      updatedBy: uid,
    });
  };

  const handleCollapsedChange = (index: number, isCollapsed: boolean) => {
    const newCollapsed = [...localCollapsed];
    newCollapsed[index] = isCollapsed;
    setLocalCollapsed(newCollapsed);

    sendMessage({
      type: "state",
      roomId,
      state: {
        urls: localUrls,
        inputs: localUrls,
        collapsed: newCollapsed,
        forceEmbed: [false, false, false, false],
        allowList: [],
      },
      updatedBy: uid,
    });
  };

  const handleMinimizeAll = () => {
    const newCollapsed = [true, true, true, true];
    setLocalCollapsed(newCollapsed);

    sendMessage({
      type: "state",
      roomId,
      state: {
        urls: localUrls,
        inputs: localUrls,
        collapsed: newCollapsed,
        forceEmbed: [false, false, false, false],
        allowList: [],
      },
      updatedBy: uid,
    });
  };

  const handleRestoreAll = () => {
    const newCollapsed = [false, false, false, false];
    setLocalCollapsed(newCollapsed);

    sendMessage({
      type: "state",
      roomId,
      state: {
        urls: localUrls,
        inputs: localUrls,
        collapsed: newCollapsed,
        forceEmbed: [false, false, false, false],
        allowList: [],
      },
      updatedBy: uid,
    });
  };

  const handleSendMessage = async (text: string) => {
    sendMessage({
      type: "chat",
      roomId,
      authorUid: uid,
      text,
      isAI: false,
    });

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...messages.slice(-10).map(m => ({
              role: m.authorUid === uid ? "user" : "assistant",
              content: m.text,
            })),
            { role: "user", content: text },
          ],
        }),
      });

      const data = await response.json();
      if (data.text) {
        sendMessage({
          type: "chat",
          roomId,
          authorUid: "ai",
          text: data.text,
          isAI: true,
        });
      }
    } catch (error) {
      console.error("AI chat error:", error);
    }
  };

  const handleToggleLock = () => {
    if (room && room.ownerUid === uid) {
      sendMessage({
        type: "lock",
        roomId,
        isOpen: !room.isOpen,
      });
    }
  };

  const handleLoadPreset = (urls: string[]) => {
    setLocalUrls(urls);
    sendMessage({
      type: "state",
      roomId,
      state: {
        urls,
        inputs: urls,
        collapsed: localCollapsed,
        forceEmbed: [false, false, false, false],
        allowList: [],
      },
      updatedBy: uid,
    });
  };

  const isOwner = room?.ownerUid === uid;
  const membersOnline = members.filter(m => {
    const lastSeen = new Date(m.lastSeen).getTime();
    return Date.now() - lastSeen < 60000;
  }).length;

  return (
    <div className="flex h-screen bg-background">
      <RoomSidebar roomId={roomId} membersOnline={membersOnline} />
      
      <div className="flex-1 flex flex-col">
        <ControlHeader
          roomId={roomId}
          isOwner={isOwner}
          roomOpen={room?.isOpen ?? true}
          onToggleLock={handleToggleLock}
          onMinimizeAll={handleMinimizeAll}
          onRestoreAll={handleRestoreAll}
          onLoadPreset={handleLoadPreset}
          safeMode={safeMode}
          onSafeModeChange={setSafeMode}
        />
        
        <div className="flex-1 overflow-hidden">
          <ViewerGrid
            urls={localUrls}
            collapsed={localCollapsed}
            safeMode={safeMode}
            onUrlChange={handleUrlChange}
            onCollapsedChange={handleCollapsedChange}
          />
        </div>
      </div>

      <CommentCenter
        messages={messages.map(m => ({
          id: m.id,
          authorUid: m.authorUid,
          text: m.text,
          isAI: m.isAI ?? false,
        }))}
        currentUserId={uid}
        onSendMessage={handleSendMessage}
        aiEnabled={true}
      />
    </div>
  );
}
