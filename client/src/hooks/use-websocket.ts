import { useEffect, useRef, useState, useCallback } from "react";
import type { Room, Member, ChatMessage, RoomState } from "@shared/schema";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface InitMessage {
  type: "init";
  room: Room;
  state: RoomState | null;
  messages: ChatMessage[];
  members: Member[];
}

interface UseWebSocketReturn {
  connected: boolean;
  room: Room | null;
  members: Member[];
  messages: ChatMessage[];
  roomState: RoomState | null;
  sendMessage: (message: WebSocketMessage) => void;
  joinRoom: (roomId: string, uid: string, displayName: string) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "init":
            const initData = data as InitMessage;
            setRoom(initData.room);
            setMembers(initData.members);
            setMessages(initData.messages);
            setRoomState(initData.state);
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

          case "error":
            console.error("WebSocket error:", data.message);
            break;
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      setConnected(false);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    wsRef.current = ws;
  }, []);

  const joinRoom = useCallback((roomId: string, uid: string, displayName: string) => {
    sendMessage({
      type: "join",
      roomId,
      uid,
      displayName,
    });

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      sendMessage({
        type: "heartbeat",
        roomId,
        uid,
      });
    }, 20000);
  }, [sendMessage]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    connected,
    room,
    members,
    messages,
    roomState,
    sendMessage,
    joinRoom,
  };
}
