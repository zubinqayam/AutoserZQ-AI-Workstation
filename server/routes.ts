import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { generateResearchResponse } from "./gemini";
import { z } from "zod";
import {
  insertRoomSchema,
  insertMemberSchema,
  insertChatMessageSchema,
  insertRoomStateSchema,
} from "@shared/schema";

const MAX_MEMBERS = 4;

interface WSClient extends WebSocket {
  roomId?: string;
  uid?: string;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // WebSocket message types
  const wsMessageSchema = z.union([
    z.object({ type: z.literal("join"), roomId: z.string(), uid: z.string(), displayName: z.string() }),
    z.object({ type: z.literal("chat"), roomId: z.string(), authorUid: z.string(), text: z.string(), isAI: z.boolean().optional() }),
    z.object({ type: z.literal("state"), roomId: z.string(), state: z.any(), updatedBy: z.string() }),
    z.object({ type: z.literal("heartbeat"), roomId: z.string(), uid: z.string() }),
    z.object({ type: z.literal("lock"), roomId: z.string(), isOpen: z.boolean() }),
  ]);

  // Broadcast to all clients in a room
  const broadcastToRoom = (roomId: string, message: any, excludeUid?: string) => {
    wss.clients.forEach((client) => {
      const wsClient = client as WSClient;
      if (wsClient.roomId === roomId && wsClient.readyState === WebSocket.OPEN) {
        if (!excludeUid || wsClient.uid !== excludeUid) {
          wsClient.send(JSON.stringify(message));
        }
      }
    });
  };

  // WebSocket connection handler
  wss.on("connection", (ws: WSClient) => {
    ws.on("message", async (data: Buffer) => {
      try {
        const message = wsMessageSchema.parse(JSON.parse(data.toString()));

        switch (message.type) {
          case "join": {
            const { roomId, uid, displayName } = message;
            
            // Get or create room
            let room = await storage.getRoom(roomId);
            if (!room) {
              room = await storage.createRoom({
                id: roomId,
                ownerUid: uid,
                isOpen: true,
                memberCount: 0,
              });
            }

            // Check if room is full or locked
            if (!room.isOpen) {
              ws.send(JSON.stringify({ type: "error", message: "Room is locked" }));
              return;
            }

            const members = await storage.getRoomMembers(roomId);
            if (members.length >= MAX_MEMBERS && !members.some(m => m.uid === uid)) {
              ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
              return;
            }

            // Create or update member
            const existingMember = await storage.getMember(roomId, uid);
            if (existingMember) {
              await storage.updateMember(existingMember.id, { lastSeen: new Date() });
            } else {
              const isOwner = room.ownerUid === uid;
              await storage.createMember({
                roomId,
                uid,
                role: isOwner ? "owner" : "member",
                displayName,
              });
              await storage.updateRoom(roomId, { memberCount: members.length + 1 });
            }

            // Assign room and uid to WebSocket client
            ws.roomId = roomId;
            ws.uid = uid;

            // Send initial data
            const roomState = await storage.getRoomState(roomId);
            const chatMessages = await storage.getChatMessages(roomId);
            const updatedMembers = await storage.getRoomMembers(roomId);

            ws.send(JSON.stringify({
              type: "init",
              room,
              state: roomState,
              messages: chatMessages,
              members: updatedMembers,
            }));

            // Broadcast member join
            broadcastToRoom(roomId, {
              type: "member-update",
              members: updatedMembers,
            });

            break;
          }

          case "chat": {
            const { roomId, authorUid, text, isAI } = message;
            const chatMessage = await storage.createChatMessage({
              roomId,
              authorUid,
              text,
              isAI,
            });

            broadcastToRoom(roomId, {
              type: "chat",
              message: chatMessage,
            });
            break;
          }

          case "state": {
            const { roomId, state, updatedBy } = message;
            const roomState = await storage.createOrUpdateRoomState({
              roomId,
              ...state,
              updatedBy,
            });

            broadcastToRoom(roomId, {
              type: "state",
              state: roomState,
            }, updatedBy);
            break;
          }

          case "heartbeat": {
            const { roomId, uid } = message;
            const member = await storage.getMember(roomId, uid);
            if (member) {
              await storage.updateMember(member.id, { lastSeen: new Date() });
              const members = await storage.getRoomMembers(roomId);
              broadcastToRoom(roomId, {
                type: "member-update",
                members,
              });
            }
            break;
          }

          case "lock": {
            const { roomId, isOpen } = message;
            await storage.updateRoom(roomId, { isOpen });
            broadcastToRoom(roomId, {
              type: "room-update",
              room: await storage.getRoom(roomId),
            });
            break;
          }
        }
      } catch (error) {
        console.error("WebSocket error:", error);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    ws.on("close", async () => {
      if (ws.roomId && ws.uid) {
        const member = await storage.getMember(ws.roomId, ws.uid);
        if (member) {
          await storage.updateMember(member.id, { lastSeen: new Date() });
          const members = await storage.getRoomMembers(ws.roomId);
          broadcastToRoom(ws.roomId, {
            type: "member-update",
            members,
          });
        }
      }
    });
  });

  // REST API routes
  app.get("/api/room/:roomId", async (req, res) => {
    const room = await storage.getRoom(req.params.roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    res.json(room);
  });

  app.post("/api/room", async (req, res) => {
    try {
      const roomData = insertRoomSchema.parse(req.body);
      const room = await storage.createRoom(roomData);
      res.json(room);
    } catch (error) {
      res.status(400).json({ error: "Invalid room data" });
    }
  });

  app.get("/api/room/:roomId/members", async (req, res) => {
    const members = await storage.getRoomMembers(req.params.roomId);
    res.json(members);
  });

  app.get("/api/room/:roomId/messages", async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 500;
    const messages = await storage.getChatMessages(req.params.roomId, limit);
    res.json(messages);
  });

  app.get("/api/room/:roomId/state", async (req, res) => {
    const state = await storage.getRoomState(req.params.roomId);
    res.json(state || null);
  });

  // AI proxy endpoint
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages must be an array" });
      }

      const response = await generateResearchResponse(messages);
      res.json({ text: response });
    } catch (error: any) {
      console.error("AI chat error:", error);
      res.status(500).json({ error: error.message || "AI service unavailable" });
    }
  });

  return httpServer;
}
