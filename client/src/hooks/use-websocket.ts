import { useEffect, useRef, useState, useCallback } from "react";
import type { Room, Member, ChatMessage, RoomState, RerTask, RerAgentOutput } from "@shared/schema";

export interface RerTaskWithOutputs extends RerTask {
  agentOutputs: RerAgentOutput[];
}

interface UseWebSocketReturn {
  connected: boolean;
  room: Room | null;
  members: Member[];
  messages: ChatMessage[];
  roomState: RoomState | null;
  rerTasks: RerTaskWithOutputs[];
  sendMessage: (message: any) => void;
  joinRoom: (roomId: string, uid: string, displayName: string) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [rerTasks, setRerTasks] = useState<RerTaskWithOutputs[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout>();
  const heartbeatRef = useRef<NodeJS.Timeout>();
  const roomInfoRef = useRef<{ roomId: string; uid: string; displayName: string } | null>(null);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const updateRerTask = useCallback((updatedTask: RerTaskWithOutputs) => {
    setRerTasks(prev => {
      const idx = prev.findIndex(t => t.id === updatedTask.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedTask;
        return next;
      }
      return [updatedTask, ...prev];
    });
  }, []);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setConnected(true);
      if (roomInfoRef.current) {
        const { roomId, uid, displayName } = roomInfoRef.current;
        ws.send(JSON.stringify({ type: "join", roomId, uid, displayName }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "init":
            setRoom(data.room);
            setMembers(data.members);
            setMessages(data.messages);
            setRoomState(data.state);
            setRerTasks(data.rerTasks || []);
            break;
          case "chat":
            setMessages(prev => [...prev, data.message]);
            break;
          case "state":
            setRoomState(data.state);
            break;
          case "member-update":
            setMembers(data.members);
            break;
          case "room-update":
            setRoom(data.room);
            break;
          case "rer-task-update":
            updateRerTask(data.task);
            break;
          case "rer-complete":
            setRerTasks(prev =>
              prev.map(t => t.id === data.taskId ? { ...t, status: "done" } : t)
            );
            break;
          case "error":
            console.error("WS server error:", data.message);
            break;
        }
      } catch (e) {
        console.error("WS parse error:", e);
      }
    };

    ws.onerror = (e) => console.error("WS error:", e);

    ws.onclose = () => {
      setConnected(false);
      clearInterval(heartbeatRef.current);
      reconnectRef.current = setTimeout(() => connect(), 3000);
    };

    wsRef.current = ws;
  }, [updateRerTask]);

  const joinRoom = useCallback((roomId: string, uid: string, displayName: string) => {
    roomInfoRef.current = { roomId, uid, displayName };
    sendMessage({ type: "join", roomId, uid, displayName });

    clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      sendMessage({ type: "heartbeat", roomId, uid });
    }, 20000);
  }, [sendMessage]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      clearInterval(heartbeatRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, room, members, messages, roomState, rerTasks, sendMessage, joinRoom };
}
