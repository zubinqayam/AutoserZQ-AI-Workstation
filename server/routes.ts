import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { runTabCycle, generateResearchResponse, generateCOAResponse, generateCOAMultiAgentResponse } from "./gemini";
import { z } from "zod";
import { randomUUID } from "crypto";
import { TAB_ROLES, insertRoomSchema } from "@shared/schema";

interface WSClient extends WebSocket {
  roomId?: string;
  uid?: string;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const broadcastToRoom = (roomId: string, message: any) => {
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
        const msg = wsSchema.parse(JSON.parse(data.toString()));

        switch (msg.type) {
          case "join": {
            const { roomId, uid, displayName } = msg;
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
              rerTasks.slice(0, 5).map(async (t) => ({ ...t, agentOutputs: await storage.getTaskAgentOutputs(t.id) }))
            );

            ws.send(JSON.stringify({ type: "init", room, state: roomState, messages: chatMessages, members, rerTasks: tasksWithOutputs }));
            // notify others
            const allMembers = await storage.getRoomMembers(roomId);
            wss.clients.forEach((c) => {
              const wsc = c as WSClient;
              if (wsc.roomId === roomId && wsc !== ws && wsc.readyState === WebSocket.OPEN) {
                wsc.send(JSON.stringify({ type: "member-update", members: allMembers }));
              }
            });
            break;
          }
          case "chat": {
            const saved = await storage.createChatMessage({ roomId: msg.roomId, authorUid: msg.authorUid, text: msg.text, isAI: msg.isAI });
            broadcastToRoom(msg.roomId, { type: "chat", message: saved });
            break;
          }
          case "state": {
            const roomState = await storage.createOrUpdateRoomState({ roomId: msg.roomId, ...msg.state, updatedBy: msg.updatedBy });
            broadcastToRoom(msg.roomId, { type: "state", state: roomState });
            break;
          }
          case "heartbeat": {
            const member = await storage.getMember(msg.roomId, msg.uid);
            if (member) {
              await storage.updateMember(member.id, { lastSeen: new Date() });
              const members = await storage.getRoomMembers(msg.roomId);
              broadcastToRoom(msg.roomId, { type: "member-update", members });
            }
            break;
          }
          case "lock": {
            await storage.updateRoom(msg.roomId, { isOpen: msg.isOpen });
            const room = await storage.getRoom(msg.roomId);
            broadcastToRoom(msg.roomId, { type: "room-update", room });
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
          broadcastToRoom(ws.roomId, { type: "member-update", members });
        }
      }
    });
  });

  // REST: room
  app.get("/api/room/:roomId", async (req, res) => {
    const room = await storage.getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  });
  app.post("/api/room", async (req, res) => {
    try { res.json(await storage.createRoom(insertRoomSchema.parse(req.body))); }
    catch { res.status(400).json({ error: "Invalid room data" }); }
  });
  app.get("/api/room/:roomId/members", async (req, res) => res.json(await storage.getRoomMembers(req.params.roomId)));
  app.get("/api/room/:roomId/messages", async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 500;
    res.json(await storage.getChatMessages(req.params.roomId, limit));
  });
  app.get("/api/room/:roomId/state", async (req, res) => res.json((await storage.getRoomState(req.params.roomId)) || null));

  // ──── Cost protection middleware ──────────────────────────────────────────────
  const LIMITS = {
    free:       { geminiPerDay: 20,  rerPerDay: 3,  coaPerDay: 15,  },
    pro:        { geminiPerDay: 100, rerPerDay: 15, coaPerDay: 50,  },
    enterprise: { geminiPerDay: 500, rerPerDay: 50, coaPerDay: 200, },
  };

  const requireAuth = async (req: any, res: any, next: any) => {
    const uid = req.headers["x-uid"] as string;
    if (!uid) return res.status(401).json({ error: "Login required", code: "AUTH_REQUIRED" });
    const user = await storage.getUserById(uid);
    if (!user) return res.status(401).json({ error: "User not found", code: "AUTH_REQUIRED" });
    req.user = user;
    next();
  };

  const checkRateLimit = (field: "geminiCalls" | "rerLaunches" | "coaCalls") => async (req: any, res: any, next: any) => {
    const uid = req.headers["x-uid"] as string;
    if (!uid) return res.status(401).json({ error: "Login required", code: "AUTH_REQUIRED" });
    const usage = await storage.getUsage(uid);
    const tier = (await storage.getTier(uid)) as "free" | "pro" | "enterprise";
    const limit = LIMITS[tier][field];
    const used = usage[field];
    if (used >= limit) {
      return res.status(429).json({
        error: `Daily ${field} limit reached (${used}/${limit}). Resets tomorrow.`,
        code: "RATE_LIMITED",
        tier,
        limit,
        used,
        upgradeUrl: "/upgrade",
      });
    }
    await storage.incrementUsage(uid, field);
    next();
  };

  // AI supervisor chat
  app.post("/api/ai/chat", requireAuth, checkRateLimit("geminiCalls"), async (req, res) => {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages)) return res.status(400).json({ error: "messages required" });
      res.json({ text: await generateResearchResponse(messages) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "AI unavailable" });
    }
  });

  // Usage endpoint
  app.get("/api/usage", async (req, res) => {
    const uid = req.headers["x-uid"] as string;
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const usage = await storage.getUsage(uid);
    const tier = await storage.getTier(uid);
    res.json({ usage, tier, limits: LIMITS[tier as any] });
  });

  // ZQ COA (Cognitive Overlay Agent) chat
  // ── Auth routes ─────────────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, displayName } = req.body;
      if (!email || !password || !displayName) return res.status(400).json({ error: "email, password, displayName required" });
      if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
      const user = await storage.createUser(email, displayName, password);
      res.json({ user });
    } catch (err: any) { res.status(400).json({ error: err.message || "Registration failed" }); }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "email and password required" });
      const user = await storage.loginUser(email, password);
      if (!user) return res.status(401).json({ error: "Invalid email or password" });
      res.json({ user });
    } catch (err: any) { res.status(400).json({ error: err.message || "Login failed" }); }
  });

  app.get("/api/auth/me", async (req, res) => {
    const uid = req.headers["x-uid"] as string;
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const user = await storage.getUserById(uid);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  });

  app.post("/api/coa/chat", requireAuth, checkRateLimit("coaCalls"), async (req, res) => {
    try {
      const { messages, workspaceContext } = req.body;
      if (!Array.isArray(messages)) return res.status(400).json({ error: "messages required" });
      const context = typeof workspaceContext === "string" ? workspaceContext : "No workspace context provided.";
      res.json({ text: await generateCOAResponse(messages, context) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "COA unavailable" });
    }
  });

  // ZQ COA multi-agent endpoint
  app.post("/api/coa/multi-agent", requireAuth, checkRateLimit("coaCalls"), async (req, res) => {
    try {
      const { message, history, workspaceContext } = req.body;
      if (!message) return res.status(400).json({ error: "message required" });
      const ctx = typeof workspaceContext === "string" ? workspaceContext : "No context.";
      const responses = await generateCOAMultiAgentResponse(message, Array.isArray(history) ? history : [], ctx);
      res.json({ responses });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Multi-agent unavailable" });
    }
  });

  // RER: start pipeline
  app.post("/api/rer/start", requireAuth, checkRateLimit("rerLaunches"), async (req, res) => {
    try {
      const { roomId, topic, mode = "sequential" } = req.body;
      if (!roomId || !topic) return res.status(400).json({ error: "roomId and topic required" });

      const taskId = randomUUID();
      const task = await storage.createRerTask({ id: taskId, roomId, topic, mode, status: "running", currentStep: 0, totalSteps: 4 });

      // Create 4 placeholder agent outputs
      const agentOutputs = await Promise.all(
        TAB_ROLES.map((role, i) =>
          storage.createRerAgentOutput({ taskId, tabIndex: i, role, status: "idle", output: null, receivedInput: null })
        )
      );

      const broadcast = (msg: any) => broadcastToRoom(roomId, msg);
      broadcast({ type: "rer-task-update", task: { ...task, agentOutputs } });
      res.json({ taskId, task, agentOutputs });

      // Run pipeline async
      if (mode === "sequential") {
        runSequentialPipeline(taskId, roomId, topic, agentOutputs.map(o => o.id), broadcast);
      } else {
        runParallelPipeline(taskId, roomId, topic, agentOutputs.map(o => o.id), broadcast);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/rer/:taskId", async (req, res) => {
    const task = await storage.getRerTask(req.params.taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ ...task, agentOutputs: await storage.getTaskAgentOutputs(req.params.taskId) });
  });

  app.get("/api/room/:roomId/rer", async (req, res) => {
    const tasks = await storage.getRoomRerTasks(req.params.roomId);
    res.json(await Promise.all(tasks.map(async t => ({ ...t, agentOutputs: await storage.getTaskAgentOutputs(t.id) }))));
  });

  return httpServer;
}

// ─── SEQUENTIAL: Tab1 → Tab2 → Tab3 → Tab4, each gets previous tab's full report ───
async function runSequentialPipeline(
  taskId: string, roomId: string, topic: string,
  outputIds: string[], broadcast: (m: any) => void
) {
  let previousReport: string | null = null;

  for (let i = 0; i < 4; i++) {
    const tabNumber = i + 1;
    const outputId = outputIds[i];

    // Show what this tab received
    const receivedSummary = previousReport
      ? `Received Tab ${i}'s report (${previousReport.split(/\s+/).length} words)`
      : `Starting fresh on topic: "${topic}"`;

    await storage.updateRerAgentOutput(outputId, { status: "thinking", receivedInput: receivedSummary });
    await storage.updateRerTask(taskId, { currentStep: i });
    await broadcastState(taskId, broadcast);

    try {
      // Each tab gets the PREVIOUS tab's full report as input
      const result = await runTabCycle(tabNumber, topic, previousReport);

      await storage.updateRerAgentOutput(outputId, { status: "done", output: result });
      await storage.updateRerTask(taskId, { currentStep: i + 1 });
      await broadcastState(taskId, broadcast);

      // This tab's report becomes the next tab's input
      previousReport = result;
    } catch (err: any) {
      console.error(`Tab ${tabNumber} error:`, err);
      await storage.updateRerAgentOutput(outputId, {
        status: "error",
        output: `Tab ${tabNumber} encountered an error: ${err.message}`,
      });
      await storage.updateRerTask(taskId, { status: "error" });
      await broadcastState(taskId, broadcast);
      return;
    }
  }

  await storage.updateRerTask(taskId, { status: "done", completedAt: new Date(), currentStep: 4 });
  await broadcastState(taskId, broadcast);
  broadcast({ type: "rer-complete", taskId, roomId });
}

// ─── PARALLEL: All 4 tabs run simultaneously on topic, then do cross-enhancement ───
async function runParallelPipeline(
  taskId: string, roomId: string, topic: string,
  outputIds: string[], broadcast: (m: any) => void
) {
  // Round 1: All tabs research the topic independently
  await Promise.all(outputIds.map(id =>
    storage.updateRerAgentOutput(id, { status: "thinking", receivedInput: `Topic: "${topic}" — Initial independent research` })
  ));
  await storage.updateRerTask(taskId, { currentStep: 1 });
  await broadcastState(taskId, broadcast);

  const round1 = await Promise.allSettled(
    [1, 2, 3, 4].map(tabNum => runTabCycle(tabNum, topic, null))
  );

  const round1Results: (string | null)[] = [];
  for (let i = 0; i < 4; i++) {
    const r = round1[i];
    if (r.status === "fulfilled") {
      await storage.updateRerAgentOutput(outputIds[i], { status: "done", output: r.value });
      round1Results.push(r.value);
    } else {
      await storage.updateRerAgentOutput(outputIds[i], { status: "error", output: `Error: ${r.reason}` });
      round1Results.push(null);
    }
  }

  await storage.updateRerTask(taskId, { currentStep: 2 });
  await broadcastState(taskId, broadcast);

  // Round 2: Each tab reviews ALL other tabs' outputs and produces enhanced version
  const validOutputs = round1Results.filter(Boolean) as string[];
  const combinedContext = validOutputs.map((o, i) =>
    `=== TAB ${i + 1} ROUND 1 OUTPUT ===\n${o}`
  ).join("\n\n");

  await Promise.all(outputIds.map((id, i) =>
    storage.updateRerAgentOutput(id, {
      status: "thinking",
      receivedInput: `Round 2: Received all ${validOutputs.length} tabs' outputs. Cross-enhancing…`,
    })
  ));
  await broadcastState(taskId, broadcast);

  const round2 = await Promise.allSettled(
    [1, 2, 3, 4].map(tabNum =>
      runTabCycle(tabNum, topic, combinedContext)
    )
  );

  for (let i = 0; i < 4; i++) {
    const r = round2[i];
    if (r.status === "fulfilled") {
      await storage.updateRerAgentOutput(outputIds[i], { status: "done", output: r.value });
    } else {
      await storage.updateRerAgentOutput(outputIds[i], { status: "error", output: `Round 2 error: ${r.reason}` });
    }
  }

  await storage.updateRerTask(taskId, { status: "done", completedAt: new Date(), currentStep: 4 });
  await broadcastState(taskId, broadcast);
  broadcast({ type: "rer-complete", taskId, roomId });
}

async function broadcastState(taskId: string, broadcast: (m: any) => void) {
  const task = await storage.getRerTask(taskId);
  const agentOutputs = await storage.getTaskAgentOutputs(taskId);
  broadcast({ type: "rer-task-update", task: { ...task, agentOutputs } });
}

// ── URL Content Fetcher ───────────────────────────────────────────────────────
app.post("/api/fetch-url", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") return res.status(400).json({ error: "URL required" });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ZQ-Workstation/1.0 (research reader)" },
    });
    clearTimeout(timeout);
    if (!response.ok) return res.status(400).json({ error: `HTTP ${response.status}` });
    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    let cleaned: string;
    if (contentType.includes("html")) {
      cleaned = rawText
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, " ").trim()
        .slice(0, 8000);
    } else {
      cleaned = rawText.slice(0, 8000);
    }
    res.json({ content: cleaned, url, contentType });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch URL" });
  }
});
