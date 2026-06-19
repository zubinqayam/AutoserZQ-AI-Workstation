import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { runAgentStep, generateResearchResponse } from "./gemini";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  insertRoomSchema, insertMemberSchema, insertChatMessageSchema, insertRoomStateSchema,
  TAB_ROLES,
} from "@shared/schema";

const MAX_MEMBERS = 10;

interface WSClient extends WebSocket {
  roomId?: string;
  uid?: string;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const broadcastToRoom = (roomId: string, message: any, excludeUid?: string) => {
    wss.clients.forEach((client) => {
      const ws = client as WSClient;
      if (ws.roomId === roomId && ws.readyState === WebSocket.OPEN) {
        if (!excludeUid || ws.uid !== excludeUid) {
          ws.send(JSON.stringify(message));
        }
      }
    });
  };

  const broadcastToAll = (roomId: string, message: any) => {
    wss.clients.forEach((client) => {
      const ws = client as WSClient;
      if (ws.roomId === roomId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  };

  const wsSchema = z.union([
    z.object({ type: z.literal("join"), roomId: z.string(), uid: z.string(), displayName: z.string() }),
    z.object({ type: z.literal("chat"), roomId: z.string(), authorUid: z.string(), text: z.string(), isAI: z.boolean().optional() }),
    z.object({ type: z.literal("state"), roomId: z.string(), state: z.any(), updatedBy: z.string() }),
    z.object({ type: z.literal("heartbeat"), roomId: z.string(), uid: z.string() }),
    z.object({ type: z.literal("lock"), roomId: z.string(), isOpen: z.boolean() }),
  ]);

  wss.on("connection", (ws: WSClient) => {
    ws.on("message", async (data: Buffer) => {
      try {
        const message = wsSchema.parse(JSON.parse(data.toString()));

        switch (message.type) {
          case "join": {
            const { roomId, uid, displayName } = message;
            let room = await storage.getRoom(roomId);
            if (!room) {
              room = await storage.createRoom({ id: roomId, ownerUid: uid, isOpen: true, memberCount: 0 });
            }
            if (!room.isOpen) {
              ws.send(JSON.stringify({ type: "error", message: "Room is locked" }));
              return;
            }
            const existing = await storage.getMember(roomId, uid);
            if (existing) {
              await storage.updateMember(existing.id, { lastSeen: new Date() });
            } else {
              const members = await storage.getRoomMembers(roomId);
              await storage.createMember({ roomId, uid, role: room.ownerUid === uid ? "owner" : "member", displayName });
              await storage.updateRoom(roomId, { memberCount: members.length + 1 });
            }
            ws.roomId = roomId;
            ws.uid = uid;

            const [roomState, chatMessages, members, rerTasks] = await Promise.all([
              storage.getRoomState(roomId),
              storage.getChatMessages(roomId),
              storage.getRoomMembers(roomId),
              storage.getRoomRerTasks(roomId),
            ]);

            const tasksWithOutputs = await Promise.all(
              rerTasks.slice(0, 5).map(async (t) => ({
                ...t,
                agentOutputs: await storage.getTaskAgentOutputs(t.id),
              }))
            );

            ws.send(JSON.stringify({ type: "init", room, state: roomState, messages: chatMessages, members, rerTasks: tasksWithOutputs }));
            broadcastToRoom(roomId, { type: "member-update", members }, uid);
            break;
          }

          case "chat": {
            const { roomId, authorUid, text, isAI } = message;
            const msg = await storage.createChatMessage({ roomId, authorUid, text, isAI });
            broadcastToAll(roomId, { type: "chat", message: msg });
            break;
          }

          case "state": {
            const { roomId, state, updatedBy } = message;
            const roomState = await storage.createOrUpdateRoomState({ roomId, ...state, updatedBy });
            broadcastToRoom(roomId, { type: "state", state: roomState }, updatedBy);
            break;
          }

          case "heartbeat": {
            const { roomId, uid } = message;
            const member = await storage.getMember(roomId, uid);
            if (member) {
              await storage.updateMember(member.id, { lastSeen: new Date() });
              const members = await storage.getRoomMembers(roomId);
              broadcastToAll(roomId, { type: "member-update", members });
            }
            break;
          }

          case "lock": {
            const { roomId, isOpen } = message;
            await storage.updateRoom(roomId, { isOpen });
            const room = await storage.getRoom(roomId);
            broadcastToAll(roomId, { type: "room-update", room });
            break;
          }
        }
      } catch (err) {
        console.error("WS error:", err);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      }
    });

    ws.on("close", async () => {
      if (ws.roomId && ws.uid) {
        const member = await storage.getMember(ws.roomId, ws.uid);
        if (member) {
          await storage.updateMember(member.id, { lastSeen: new Date() });
          const members = await storage.getRoomMembers(ws.roomId);
          broadcastToAll(ws.roomId, { type: "member-update", members });
        }
      }
    });
  });

  // REST: room endpoints
  app.get("/api/room/:roomId", async (req, res) => {
    const room = await storage.getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  });

  app.post("/api/room", async (req, res) => {
    try {
      const data = insertRoomSchema.parse(req.body);
      res.json(await storage.createRoom(data));
    } catch { res.status(400).json({ error: "Invalid room data" }); }
  });

  app.get("/api/room/:roomId/members", async (req, res) => {
    res.json(await storage.getRoomMembers(req.params.roomId));
  });

  app.get("/api/room/:roomId/messages", async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 500;
    res.json(await storage.getChatMessages(req.params.roomId, limit));
  });

  app.get("/api/room/:roomId/state", async (req, res) => {
    res.json((await storage.getRoomState(req.params.roomId)) || null);
  });

  // AI chat (supervisor)
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages)) return res.status(400).json({ error: "Messages must be array" });
      const text = await generateResearchResponse(messages);
      res.json({ text });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "AI unavailable" });
    }
  });

  // RER: start a pipeline task
  app.post("/api/rer/start", async (req, res) => {
    try {
      const { roomId, topic, mode = "sequential" } = req.body;
      if (!roomId || !topic) return res.status(400).json({ error: "roomId and topic required" });

      const taskId = randomUUID();
      const task = await storage.createRerTask({
        id: taskId, roomId, topic, mode, status: "running", currentStep: 0, totalSteps: 4,
      });

      // Create placeholder outputs for all 4 agents
      const agentOutputs = await Promise.all(
        TAB_ROLES.map((role, i) =>
          storage.createRerAgentOutput({ taskId, tabIndex: i, role, status: "idle", output: null, receivedInput: null })
        )
      );

      // Broadcast task created
      const broadcast = (msg: any) => {
        wss.clients.forEach((client) => {
          const ws = client as WSClient;
          if (ws.roomId === roomId && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        });
      };

      broadcast({ type: "rer-task-update", task: { ...task, agentOutputs } });

      res.json({ taskId, task, agentOutputs });

      // Run the pipeline asynchronously
      if (mode === "sequential") {
        runSequentialPipeline(taskId, roomId, topic, agentOutputs.map(o => o.id), broadcast);
      } else {
        runParallelPipeline(taskId, roomId, topic, agentOutputs.map(o => o.id), broadcast);
      }
    } catch (err: any) {
      console.error("RER start error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // RER: get task details
  app.get("/api/rer/:taskId", async (req, res) => {
    const task = await storage.getRerTask(req.params.taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const agentOutputs = await storage.getTaskAgentOutputs(req.params.taskId);
    res.json({ ...task, agentOutputs });
  });

  app.get("/api/room/:roomId/rer", async (req, res) => {
    const tasks = await storage.getRoomRerTasks(req.params.roomId);
    const withOutputs = await Promise.all(
      tasks.map(async t => ({ ...t, agentOutputs: await storage.getTaskAgentOutputs(t.id) }))
    );
    res.json(withOutputs);
  });

  return httpServer;
}

async function runSequentialPipeline(
  taskId: string, roomId: string, topic: string,
  outputIds: string[], broadcast: (msg: any) => void
) {
  let prevOutput: string | undefined;

  for (let i = 0; i < TAB_ROLES.length; i++) {
    const role = TAB_ROLES[i];
    const outputId = outputIds[i];

    // Mark as thinking
    const thinking = await storage.updateRerAgentOutput(outputId, { status: "thinking", receivedInput: prevOutput || null });
    await storage.updateRerTask(taskId, { currentStep: i });
    const task = await storage.getRerTask(taskId);
    const allOutputs = await storage.getTaskAgentOutputs(taskId);
    broadcast({ type: "rer-task-update", task: { ...task, agentOutputs: allOutputs } });

    try {
      const result = await runAgentStep(role, topic, prevOutput);
      const done = await storage.updateRerAgentOutput(outputId, { status: "done", output: result });
      prevOutput = result;

      await storage.updateRerTask(taskId, { currentStep: i + 1 });
      const updatedTask = await storage.getRerTask(taskId);
      const updatedOutputs = await storage.getTaskAgentOutputs(taskId);
      broadcast({ type: "rer-task-update", task: { ...updatedTask, agentOutputs: updatedOutputs } });
    } catch (err: any) {
      await storage.updateRerAgentOutput(outputId, { status: "error", output: `Error: ${err.message}` });
      await storage.updateRerTask(taskId, { status: "error" });
      const updatedTask = await storage.getRerTask(taskId);
      const updatedOutputs = await storage.getTaskAgentOutputs(taskId);
      broadcast({ type: "rer-task-update", task: { ...updatedTask, agentOutputs: updatedOutputs } });
      return;
    }
  }

  await storage.updateRerTask(taskId, { status: "done", completedAt: new Date(), currentStep: 4 });
  const finalTask = await storage.getRerTask(taskId);
  const finalOutputs = await storage.getTaskAgentOutputs(taskId);
  broadcast({ type: "rer-task-update", task: { ...finalTask, agentOutputs: finalOutputs } });
  broadcast({ type: "rer-complete", taskId, roomId });
}

async function runParallelPipeline(
  taskId: string, roomId: string, topic: string,
  outputIds: string[], broadcast: (msg: any) => void
) {
  // All 4 agents research simultaneously first (cycle 1)
  const markThinking = outputIds.map((id, i) =>
    storage.updateRerAgentOutput(id, { status: "thinking", receivedInput: `Topic: ${topic}` })
  );
  await Promise.all(markThinking);
  await storage.updateRerTask(taskId, { currentStep: 1 });
  const task1 = await storage.getRerTask(taskId);
  const out1 = await storage.getTaskAgentOutputs(taskId);
  broadcast({ type: "rer-task-update", task: { ...task1, agentOutputs: out1 } });

  // Run all 4 agents in parallel
  const results = await Promise.allSettled(
    TAB_ROLES.map((role) => runAgentStep(role, topic))
  );

  const outputs: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      await storage.updateRerAgentOutput(outputIds[i], { status: "done", output: r.value });
      outputs.push(r.value);
    } else {
      await storage.updateRerAgentOutput(outputIds[i], { status: "error", output: `Error: ${r.reason}` });
      outputs.push("");
    }
  }

  await storage.updateRerTask(taskId, { currentStep: 2 });

  // Cycle 2: Each agent now enhances based on all other agents' outputs
  const combined = outputs.filter(Boolean).join("\n\n---\n\n");
  const cycle2Prompt = `All agents have completed their initial research. Here are all outputs:\n\n${combined}\n\nNow synthesize and enhance based on ALL of the above.`;

  const enhance = outputIds.map(async (id, i) => {
    const role = TAB_ROLES[i];
    await storage.updateRerAgentOutput(id, { status: "thinking", receivedInput: cycle2Prompt });
    const task2 = await storage.getRerTask(taskId);
    const out2 = await storage.getTaskAgentOutputs(taskId);
    broadcast({ type: "rer-task-update", task: { ...task2, agentOutputs: out2 } });

    try {
      const result = await runAgentStep(role, topic, cycle2Prompt);
      await storage.updateRerAgentOutput(id, { status: "done", output: result });
    } catch (err: any) {
      await storage.updateRerAgentOutput(id, { status: "error", output: `Error: ${err.message}` });
    }
  });

  await Promise.all(enhance);

  await storage.updateRerTask(taskId, { status: "done", completedAt: new Date(), currentStep: 4 });
  const finalTask = await storage.getRerTask(taskId);
  const finalOutputs = await storage.getTaskAgentOutputs(taskId);
  broadcast({ type: "rer-task-update", task: { ...finalTask, agentOutputs: finalOutputs } });
  broadcast({ type: "rer-complete", taskId, roomId });
}
