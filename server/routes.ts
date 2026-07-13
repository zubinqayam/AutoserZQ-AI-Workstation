import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { runTabCycle, generateResearchResponse, generateCOAResponse, generateCOAMultiAgentResponse, computeChecksum, getCachedGeminiHealth, startGeminiHealthMonitor } from "./gemini";
import { z } from "zod";
import { randomUUID } from "crypto";
import { TAB_ROLES, insertRoomSchema } from "@shared/schema";
import { eventBus } from "./core/eventBus";
import { missionManager } from "./core/missionManager";
import { getWorkspaceSnapshot, buildAgentContext } from "./core/workspaceEngine";
import { pingDb } from "./db";
import { quotaEnforcer } from "./core/quotaEnforcer";
import { budgetConfig } from "./core/budgetConfig";
import { budgetLedger } from "./core/budgetLedger";
import { fetchWithRedirectValidation, readResponseWithLimit, validateOutboundUrl } from "./core/urlSafety";
import { rerStartSchema, sanitizeChatMessages, sanitizeRerText, verifyCheckpointChain } from "./rerValidation";

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

  // Bridge the internal SMCBOS event bus to the room's WebSocket clients. This
  // is additive: it sends a new "event" message type that existing clients
  // safely ignore (their handler has no default case), so nothing breaks while
  // future UI can subscribe to mission/task/workspace events.
  eventBus.on("*", (evt) => {
    broadcastToRoom(evt.roomId, { type: "event", event: { type: evt.type, payload: evt.payload, at: evt.at } });
  });
  if (budgetConfig.zeroPaidSpendMode) {
    eventBus.publish("budget.zero_spend_enabled", "global", { enabled: true });
  } else {
    eventBus.publish("budget.zero_spend_disabled", "global", { enabled: false });
  }

  const wsSchema = z.union([
    z.object({ type: z.literal("join"), roomId: z.string(), uid: z.string(), displayName: z.string() }),
    z.object({ type: z.literal("chat"), roomId: z.string(), authorUid: z.string(), text: z.string(), isAI: z.boolean().optional() }),
    z.object({ type: z.literal("state"), roomId: z.string(), state: z.any(), updatedBy: z.string() }),
    z.object({ type: z.literal("heartbeat"), roomId: z.string(), uid: z.string() }),
    z.object({ type: z.literal("lock"), roomId: z.string(), isOpen: z.boolean() }),
    // Messages from server -> client (one-way; kept in schema for completeness)
    z.object({ type: z.literal("rer-complete"), taskId: z.string(), roomId: z.string() }),
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
              await storage.createMember({ roomId, uid, role: room.ownerUid === uid ? "owner" : "member", displayName });
              // Derive count from the actual rows after insert to avoid drift.
              const members = await storage.getRoomMembers(roomId);
              await storage.updateRoom(roomId, { memberCount: members.length });
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

  // Health check: reports DB + Gemini reachability so ops can tell "server is
  // up but degraded" apart from "server is fully down". Intentionally does
  // NOT require auth — this is meant to be pollable by uptime monitors.
  app.get("/api/health", async (_req, res) => {
    const startedAt = Date.now();
    const dbOk = await pingDb();
    // Gemini reachability is read from a background-refreshed cache (see
    // startGeminiHealthMonitor) rather than probed live here — a real
    // round-trip to Gemini can take hundreds of ms, which would blow our
    // <200ms health-check budget. `null` (not probed yet, e.g. right after
    // boot) is treated as best-effort "ok" so a cold start doesn't falsely
    // report "down" before the first background probe completes.
    const geminiCached = getCachedGeminiHealth();
    const geminiOk = geminiCached ?? Boolean(process.env.GEMINI_API_KEY);
    const status = dbOk && geminiOk ? "ok" : dbOk || geminiOk ? "degraded" : "down";
    const budgetStatus = budgetConfig.emergencyKillSwitch || budgetConfig.zeroPaidSpendMode
      ? "disabled"
      : "normal";
    res.json({
      status,
      checks: { db: dbOk, gemini: geminiOk, uptime: process.uptime() },
      budgetStatus,
      responseTimeMs: Date.now() - startedAt,
    });
  });

  // ──── Cost protection middleware ──────────────────────────────────────────────
  const LIMITS = budgetConfig.tiers;

  const requireAuth = async (req: any, res: any, next: any) => {
    const uid = req.headers["x-uid"] as string;
    if (!uid) return res.status(401).json({ error: "Login required", code: "AUTH_REQUIRED" });
    const user = await storage.getUserById(uid);
    if (!user) return res.status(401).json({ error: "User not found", code: "AUTH_REQUIRED" });
    req.user = user;
    next();
  };

  const checkRateLimit = (
    field: "geminiCalls" | "rerLaunches" | "coaCalls" | "serpSearches" | "urlFetches",
    opts: { increment?: "before" | "after" } = { increment: "before" }
  ) => async (req: any, res: any, next: any) => {
    const uid = req.headers["x-uid"] as string;
    if (!uid) return res.status(401).json({ error: "Login required", code: "AUTH_REQUIRED" });
    const tier = await storage.getTier(uid) as "free" | "pro" | "enterprise";
    const usage = await storage.getUsage(uid);
    const limit = LIMITS[tier][field];
    const used = usage[field] ?? 0;
    const decision = await quotaEnforcer.evaluate(uid, tier, field);
    if (!decision.allowed) {
      if (decision.retryAfterSeconds) res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      return res.status(decision.statusCode || 429).json({
        error: decision.message || "Rate limited",
        code: decision.code || "RATE_LIMITED",
        tier,
        limit,
        used,
        upgradeUrl: "/upgrade",
      });
    }
    if ((opts.increment || "before") === "before") {
      await storage.incrementUsage(uid, field);
      eventBus.publish("budget.usage", "global", { uid, field, mode: "pre" });
    } else {
      res.locals.postUsageIncrement = async () => {
        await storage.incrementUsage(uid, field);
        eventBus.publish("budget.usage", "global", { uid, field, mode: "post" });
      };
    }
    next();
  };

  // AI supervisor chat
  app.post("/api/ai/chat", requireAuth, checkRateLimit("geminiCalls"), async (req, res) => {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages)) return res.status(400).json({ error: "messages required" });
      const sanitized = sanitizeChatMessages(messages);
      if (sanitized.length === 0) return res.status(400).json({ error: "messages must not be empty after sanitization" });
      res.json({ text: await generateResearchResponse(sanitized) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "AI unavailable" });
    }
  });

  // Usage endpoint
  app.get("/api/usage", async (req, res) => {
    const uid = req.headers["x-uid"] as string;
    if (!uid) return res.status(401).json({ error: "Not authenticated" });
    const usage = await storage.getUsage(uid);
    const tier = await storage.getTier(uid) as "free" | "pro" | "enterprise";
    const totals = await budgetLedger.getBudgetTotals(uid);
    const monthlyCeiling = budgetConfig.monthlyCeilingMicros;
    const utilization = monthlyCeiling > BigInt(0)
      ? Number(((totals.monthlySpentMicros + totals.activeReservationMicros) * BigInt(10000)) / monthlyCeiling) / 100
      : 0;
    const legacyLimits = {
      geminiPerDay: LIMITS[tier].geminiCalls,
      rerPerDay: LIMITS[tier].rerLaunches,
      coaPerDay: LIMITS[tier].coaCalls,
    };
    res.json({
      usage,
      tier,
      limits: legacyLimits,
      operationLimits: LIMITS[tier],
      dailyTotals: totals.daily,
      monthlyTotals: {
        spentMicros: totals.monthlySpentMicros.toString(),
        activeReservationMicros: totals.activeReservationMicros.toString(),
      },
      tokenTotals: {
        estimatedInputTokens: usage.estimatedInputTokens ?? 0,
        estimatedOutputTokens: usage.estimatedOutputTokens ?? 0,
        estimatedThinkingTokens: usage.estimatedThinkingTokens ?? 0,
        actualInputTokens: usage.actualInputTokens ?? 0,
        actualOutputTokens: usage.actualOutputTokens ?? 0,
        actualThinkingTokens: usage.actualThinkingTokens ?? 0,
      },
      budgetUtilizationPercent: utilization,
      zeroPaidSpendMode: budgetConfig.zeroPaidSpendMode,
    });
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

  // Debug: shows exactly which redirect URI will be sent to Google/GitHub
  app.get("/api/auth/debug-uri", (req, res) => {
    const base = getBaseUrl(req);
    res.json({
      detectedBase: base,
      googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || `${base}/api/auth/google/callback`,
      githubRedirectUri: process.env.GITHUB_REDIRECT_URI || `${base}/api/auth/github/callback`,
      googleClientIdSet: !!process.env.GOOGLE_CLIENT_ID,
      githubClientIdSet: !!process.env.GITHUB_CLIENT_ID,
      proto: req.protocol,
      host: req.get("host"),
    });
  });

  // ── OAuth helpers ────────────────────────────────────────────────────────────
  const oauthStates = new Map<string, number>(); // state → expiry ms

  function getBaseUrl(req: any) {
    // REPLIT_DOMAINS is the authoritative public hostname Replit injects in all environments
    if (process.env.REPLIT_DOMAINS) {
      const domain = process.env.REPLIT_DOMAINS.split(",")[0].trim();
      return `https://${domain}`;
    }
    return `${req.protocol}://${req.get("host")}`;
  }

  function oauthRedirect(res: any, user: any) {
    const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
    res.redirect(`/?zq_oauth=${payload}`);
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  app.get("/api/auth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(501).json({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
    const state = randomUUID();
    oauthStates.set(state, Date.now() + 10 * 60 * 1000);
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/google/callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "online");
    res.redirect(url.toString());
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code || !state || !oauthStates.has(state) || oauthStates.get(state)! < Date.now()) {
        return res.redirect("/?zq_oauth_error=invalid_state");
      }
      oauthStates.delete(state);
      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/google/callback`;
      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString(),
      });
      if (!tokenRes.ok) throw new Error("Token exchange failed");
      const { access_token } = await tokenRes.json() as any;
      // Get user info
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!infoRes.ok) throw new Error("User info fetch failed");
      const info = await infoRes.json() as any;
      const user = await storage.findOrCreateOAuthUser(info.email, info.name || info.email.split("@")[0], "google");
      oauthRedirect(res, user);
    } catch (err: any) {
      res.redirect(`/?zq_oauth_error=${encodeURIComponent(err.message || "google_error")}`);
    }
  });

  // ── GitHub OAuth ─────────────────────────────────────────────────────────────
  app.get("/api/auth/github", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) return res.status(501).json({ error: "GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET." });
    const state = randomUUID();
    oauthStates.set(state, Date.now() + 10 * 60 * 1000);
    const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`;
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "user:email");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/github/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code || !state || !oauthStates.has(state) || oauthStates.get(state)! < Date.now()) {
        return res.redirect("/?zq_oauth_error=invalid_state");
      }
      oauthStates.delete(state);
      const clientId = process.env.GITHUB_CLIENT_ID!;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET!;
      // Exchange code for token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });
      if (!tokenRes.ok) throw new Error("Token exchange failed");
      const { access_token } = await tokenRes.json() as any;
      // Get user info
      const [userRes, emailRes] = await Promise.all([
        fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${access_token}`, "User-Agent": "ZQ-Workstation" } }),
        fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${access_token}`, "User-Agent": "ZQ-Workstation" } }),
      ]);
      if (!userRes.ok) throw new Error("GitHub user fetch failed");
      const ghUser = await userRes.json() as any;
      const emails = emailRes.ok ? (await emailRes.json() as any[]) : [];
      const primaryEmail = emails.find((e: any) => e.primary && e.verified)?.email || ghUser.email || `${ghUser.login}@github.com`;
      const user = await storage.findOrCreateOAuthUser(primaryEmail, ghUser.name || ghUser.login, "github");
      oauthRedirect(res, user);
    } catch (err: any) {
      res.redirect(`/?zq_oauth_error=${encodeURIComponent(err.message || "github_error")}`);
    }
  });

  // Merge the client-supplied context with the authoritative server-side
  // workspace snapshot (when a roomId is provided) so agents reason over shared
  // state. roomId is optional → fully backward compatible with existing callers.
  const mergeAgentContext = async (roomId: unknown, clientContext: unknown): Promise<string> => {
    const base = typeof clientContext === "string" && clientContext.trim() ? clientContext : "No workspace context provided.";
    if (typeof roomId === "string" && roomId) {
      try {
        const serverContext = await buildAgentContext(roomId);
        return `${serverContext}\n\n=== CLIENT-SUPPLIED CONTEXT ===\n${base}`;
      } catch (e) {
        console.error("buildAgentContext failed (non-fatal):", e);
      }
    }
    return base;
  };

  app.post("/api/coa/chat", requireAuth, checkRateLimit("coaCalls"), async (req, res) => {
    try {
      const { messages, workspaceContext, roomId } = req.body;
      if (!Array.isArray(messages)) return res.status(400).json({ error: "messages required" });
      const sanitized = sanitizeChatMessages(messages);
      if (sanitized.length === 0) return res.status(400).json({ error: "messages must not be empty after sanitization" });
      const context = await mergeAgentContext(roomId, workspaceContext);
      res.json({ text: await generateCOAResponse(sanitized, context) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "COA unavailable" });
    }
  });

  // ZQ COA multi-agent endpoint
  app.post("/api/coa/multi-agent", requireAuth, checkRateLimit("coaCalls"), async (req, res) => {
    try {
      const { message, history, workspaceContext, roomId } = req.body;
      if (!message || typeof message !== "string") return res.status(400).json({ error: "message required" });
      const sanitizedMessage = sanitizeRerText(message);
      if (sanitizedMessage.length === 0) return res.status(400).json({ error: "message must not be empty after sanitization" });
      const sanitizedHistory = sanitizeChatMessages(Array.isArray(history) ? history : []);
      const ctx = await mergeAgentContext(roomId, workspaceContext);
      const responses = await generateCOAMultiAgentResponse(sanitizedMessage, sanitizedHistory, ctx);
      res.json({ responses });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Multi-agent unavailable" });
    }
  });

  // RER: start pipeline
  app.post("/api/rer/start", requireAuth, checkRateLimit("rerLaunches"), async (req, res) => {
    try {
      const parsed = rerStartSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid RER input" });
      }
      const { roomId, topic, mode } = parsed.data;

      const taskId = randomUUID();
      const task = await storage.createRerTask({ id: taskId, roomId, topic, mode, status: "running", currentStep: 0, totalSteps: 4 });

      // Create 4 placeholder agent outputs
      const agentOutputs = await Promise.all(
        TAB_ROLES.map((role, i) =>
          storage.createRerAgentOutput({ taskId, tabIndex: i, role, status: "idle", output: null, receivedInput: null })
        )
      );

      // Additively mirror this RER run as a Mission so the orchestration layer +
      // event bus reflect it. Purely telemetry — must never break the pipeline.
      let missionId: string | null = null;
      let missionTaskIds: string[] = [];
      try {
        const mission = await missionManager.createMission({
          roomId,
          title: `RER: ${topic}`.slice(0, 120),
          objective: topic,
          kind: "rer",
          status: "running",
          createdBy: (req.headers["x-uid"] as string) || null,
        });
        missionId = mission.id;
        const createdTasks = await Promise.all(
          TAB_ROLES.map((role, i) =>
            missionManager.addTask({ missionId: mission.id, title: `${role} (Tab ${i + 1})`, kind: "rer-tab", status: "running", sequence: i })
          )
        );
        missionTaskIds = createdTasks.map((t) => t.id);
      } catch (e) {
        console.error("RER mission mirror (non-fatal):", e);
      }

      const broadcast = (msg: any) => {
        broadcastToRoom(roomId, msg);
        // When the pipeline finishes, close out the mirrored mission + tasks.
        if (msg.type === "rer-complete" && missionId) {
          (async () => {
            try {
              await Promise.all(missionTaskIds.map((id) => missionManager.completeTask(id)));
              await missionManager.updateMissionStatus(missionId!, "completed");
            } catch (e) {
              console.error("RER mission completion (non-fatal):", e);
            }
          })();
        }
      };
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

  // ── SMCBOS: Mission / Task / Workspace API (foundation, no UI yet) ───────────
  app.post("/api/mission", requireAuth, async (req, res) => {
    try {
      const { roomId, title, objective, kind } = req.body;
      if (!roomId || !title || !objective) return res.status(400).json({ error: "roomId, title, objective required" });
      const mission = await missionManager.createMission({
        roomId, title, objective, kind: kind || "custom", status: "pending", createdBy: (req as any).user?.id || null,
      });
      res.json(mission);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/mission/:id", async (req, res) => {
    const mission = await missionManager.getMissionWithTasks(req.params.id);
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    res.json(mission);
  });

  app.get("/api/room/:roomId/missions", async (req, res) => res.json(await missionManager.listMissions(req.params.roomId)));

  app.post("/api/mission/:id/task", requireAuth, async (req, res) => {
    try {
      const { title, kind, sequence, input } = req.body;
      if (!title) return res.status(400).json({ error: "title required" });
      const task = await missionManager.addTask({
        missionId: req.params.id, title, kind: kind || "generic", status: "pending", sequence: sequence ?? 0, input: input ?? null,
      });
      res.json(task);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/task/:id", requireAuth, async (req, res) => {
    try {
      const { status, output, error } = req.body;
      let task;
      if (status === "running") task = await missionManager.startTask(req.params.id, output);
      else if (status === "done") task = await missionManager.completeTask(req.params.id, output);
      else if (status === "error") task = await missionManager.failTask(req.params.id, error || "unknown error");
      else return res.status(400).json({ error: "status must be running|done|error" });
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json(task);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/workspace/:roomId/snapshot", async (req, res) => res.json(await getWorkspaceSnapshot(req.params.roomId)));

  // ── ZQ Conference Room SERP: real Google search results via SerpAPI ────────
  // Standalone tool, separate from the 4-panel Conference Room. Server-side
  // key only — never exposed to the client. Normalizes organic_results into
  // a small, stable shape so the frontend doesn't need to know SerpAPI's
  // response format.
  app.post("/api/serp/search", requireAuth, checkRateLimit("serpSearches", { increment: "after" }), async (req, res) => {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      return res.status(501).json({ error: "SerpAPI is not configured. Set SERPAPI_KEY to enable search." });
    }
    const uid = (req as any).user?.id as string;
    let reservationId: string | undefined;
    const reserve = await budgetLedger.reserveBudget({
      uid,
      provider: "serpapi",
      operationType: "search",
      estimatedMicros: BigInt(0),
      monthlyCeilingMicros: budgetConfig.monthlyCeilingMicros,
    });
    if (!reserve.allowed) {
      eventBus.publish("budget.exhausted", "global", { uid, provider: "serpapi" });
      return res.status(429).json({ error: reserve.reason || "Budget exhausted", code: "BUDGET_EXHAUSTED" });
    }
    reservationId = reserve.reservationId;
    eventBus.publish("budget.reserved", "global", { uid, provider: "serpapi", reservationId });
    const { q, location, google_domain, hl, gl } = req.body || {};
    if (!q || typeof q !== "string" || !q.trim()) {
      if (reservationId) await budgetLedger.releaseReservation(reservationId, "invalid_request");
      return res.status(400).json({ error: "q (search query) is required" });
    }
    try {
      const params = new URLSearchParams({
        engine: "google",
        q: q.trim().slice(0, 500),
        api_key: apiKey,
      });
      if (typeof location === "string" && location.trim()) params.set("location", location.trim().slice(0, 200));
      if (typeof google_domain === "string" && google_domain.trim()) params.set("google_domain", google_domain.trim().slice(0, 100));
      if (typeof hl === "string" && hl.trim()) params.set("hl", hl.trim().slice(0, 10));
      if (typeof gl === "string" && gl.trim()) params.set("gl", gl.trim().slice(0, 10));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }

      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        const message = (data && (data as any).error) || `SerpAPI request failed (HTTP ${response.status})`;
        if (reservationId) await budgetLedger.releaseReservation(reservationId, message);
        return res.status(502).json({ error: message });
      }
      if ((data as any).error) {
        if (reservationId) await budgetLedger.releaseReservation(reservationId, (data as any).error);
        return res.status(502).json({ error: (data as any).error });
      }

      const organic = Array.isArray((data as any).organic_results) ? (data as any).organic_results : [];
      const results = organic.map((r: any) => ({
        position: typeof r.position === "number" ? r.position : null,
        title: typeof r.title === "string" ? r.title : "",
        link: typeof r.link === "string" ? r.link : "",
        displayedLink: typeof r.displayed_link === "string" ? r.displayed_link : "",
        snippet: typeof r.snippet === "string" ? r.snippet : "",
        favicon: typeof r.favicon === "string" ? r.favicon : null,
      })).filter((r: any) => r.title && r.link);

      if (reservationId) {
        await budgetLedger.settleReservation(reservationId, BigInt(0));
        eventBus.publish("budget.settled", "global", { uid, provider: "serpapi", reservationId });
      }
      if (typeof res.locals.postUsageIncrement === "function") {
        await res.locals.postUsageIncrement();
      }

      res.json({
        results,
        totalResults: (data as any).search_information?.total_results ?? null,
        searchParameters: (data as any).search_parameters ?? null,
      });
    } catch (err: any) {
      if (reservationId) {
        await budgetLedger.releaseReservation(reservationId, err?.message || "search_failed");
        eventBus.publish("budget.released", "global", { uid, provider: "serpapi", reservationId });
      }
      if (err?.name === "AbortError") {
        return res.status(504).json({ error: "SerpAPI request timed out" });
      }
      res.status(500).json({ error: err.message || "Search failed" });
    }
  });

  // ── URL Content Fetcher (moved inside registerRoutes) ──────────────────────
  app.post("/api/fetch-url", requireAuth, checkRateLimit("urlFetches", { increment: "after" }), async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== "string") return res.status(400).json({ error: "URL required" });
    try {
      const targetUrl = await validateOutboundUrl(url);
      const { response, finalUrl } = await fetchWithRedirectValidation(targetUrl, {
        timeoutMs: 10000,
        maxBytes: 1024 * 1024,
        userAgent: "ZQ-Workstation/1.0 (research reader)",
      });
      if (!response.ok) return res.status(400).json({ error: `HTTP ${response.status}` });
      const contentType = response.headers.get("content-type") || "";
      const rawText = await readResponseWithLimit(response, 1024 * 1024);
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
      if (typeof res.locals.postUsageIncrement === "function") {
        await res.locals.postUsageIncrement();
      }
      res.json({ content: cleaned, url: finalUrl.toString(), contentType });
    } catch (err: any) {
      if (err?.name === "AbortError") return res.status(504).json({ error: "URL fetch timed out" });
      const msg = err?.message || "Failed to fetch URL";
      const isValidation = /not allowed|Malformed URL|Only http\/https|Hostname is required|blocked|Too many redirects/i.test(msg);
      res.status(isValidation ? 400 : 500).json({ error: msg });
    }
  });

  // Crash-resume: any RER task still marked "running" at startup was mid-flight
  // when the process died. Verify the last completed tab's checkpoint hash
  // (guards against a truncated/corrupted write) before resuming from the next
  // tab. Parallel-mode tasks are simpler to corrupt via partial fan-out, so we
  // conservatively mark them errored rather than guess which round to redo.
  resumeInterruptedRerTasks().catch((err) =>
    console.error("resumeInterruptedRerTasks failed (non-fatal):", err)
  );

  // Background Gemini reachability probe for /api/health (see route above).
  startGeminiHealthMonitor();

  return httpServer;

  async function resumeInterruptedRerTasks() {
    const running = await storage.getRunningRerTasks();
    for (const task of running) {
      try {
        if (task.mode !== "sequential") {
          await storage.updateRerTask(task.id, { status: "error" });
          console.warn(`[resume] Task ${task.id} (${task.mode}) left running at startup — marked error (parallel resume unsupported).`);
          continue;
        }

        const outputs = await storage.getTaskAgentOutputs(task.id);
        outputs.sort((a, b) => a.tabIndex - b.tabIndex);

        const { lastGoodIndex, intact } = verifyCheckpointChain(outputs);
        if (!intact) {
          console.error(`[resume] Task ${task.id} checkpoint chain broken at/after tab ${lastGoodIndex + 1} — aborting resume.`);
          await storage.updateRerTask(task.id, { status: "error" });
          continue;
        }
        const lastGoodOutput = lastGoodIndex >= 0 ? (outputs[lastGoodIndex].output as string) : null;

        if (lastGoodIndex >= 3) {
          await storage.updateRerTask(task.id, { status: "done", completedAt: new Date(), currentStep: 4 });
          continue;
        }

        console.log(`[resume] Resuming task ${task.id} from tab ${lastGoodIndex + 2} of 4.`);
        const outputIds = outputs.map((o) => o.id);
        resumeSequentialPipeline(task.id, task.roomId, task.topic, outputIds, lastGoodIndex + 1, lastGoodOutput, () => {});
      } catch (err) {
        console.error(`[resume] Failed to resume task ${task.id}:`, err);
      }
    }
  }
}

// ─── SEQUENTIAL: Tab1 → Tab2 → Tab3 → Tab4, each gets previous tab's full report ───
async function runSequentialPipeline(
  taskId: string, roomId: string, topic: string,
  outputIds: string[], broadcast: (m: any) => void
) {
  return sequentialPipelineLoop(taskId, roomId, topic, outputIds, 0, null, broadcast);
}

// Resume a sequential RER pipeline after a crash. `startIndex` is the tab
// index (0-based) to resume from; `previousReportSeed` is the last verified
// good report to feed into that tab (null if resuming from tab 1).
async function resumeSequentialPipeline(
  taskId: string, roomId: string, topic: string,
  outputIds: string[], startIndex: number, previousReportSeed: string | null,
  broadcast: (m: any) => void
) {
  return sequentialPipelineLoop(taskId, roomId, topic, outputIds, startIndex, previousReportSeed, broadcast);
}

async function sequentialPipelineLoop(
  taskId: string, roomId: string, topic: string,
  outputIds: string[], startIndex: number, previousReportSeed: string | null,
  broadcast: (m: any) => void
) {
  let previousReport: string | null = previousReportSeed;

  for (let i = startIndex; i < 4; i++) {
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
      const result = await runTabCycle(tabNumber, topic, previousReport, taskId);

      await storage.updateRerAgentOutput(outputId, { status: "done", output: result, checkpointHash: computeChecksum(result) });
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
    [1, 2, 3, 4].map(tabNum => runTabCycle(tabNum, topic, null, taskId))
  );

  const round1Results: (string | null)[] = [];
  for (let i = 0; i < 4; i++) {
    const r = round1[i];
    if (r.status === "fulfilled") {
      await storage.updateRerAgentOutput(outputIds[i], { status: "done", output: r.value, checkpointHash: computeChecksum(r.value) });
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
      runTabCycle(tabNum, topic, combinedContext, taskId)
    )
  );

  for (let i = 0; i < 4; i++) {
    const r = round2[i];
    if (r.status === "fulfilled") {
      await storage.updateRerAgentOutput(outputIds[i], { status: "done", output: r.value, checkpointHash: computeChecksum(r.value) });
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
