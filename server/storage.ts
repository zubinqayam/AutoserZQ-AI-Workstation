import {
  type Room, type InsertRoom,
  type Member, type InsertMember,
  type ChatMessage, type InsertChatMessage,
  type RoomState, type InsertRoomState,
  type RerTask, type InsertRerTask,
  type RerAgentOutput, type InsertRerAgentOutput,
  type Mission, type InsertMission,
  type Task, type InsertTask,
  type MemoryEntry, type InsertMemoryEntry,
  users, rooms, members, chatMessages, roomStates, rerTasks, rerAgentOutputs,
  missions, tasks, memoryEntries,
} from "@shared/schema";
import { randomUUID, createHash } from "crypto";
import { db } from "./db";
import { eq, and, asc, desc } from "drizzle-orm";

// ── User types — persisted in Postgres so accounts survive restarts/redeploys ─
export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
  provider: "email" | "google" | "github" | "guest";
  tier?: "free" | "pro" | "enterprise";
}

function hashPassword(pwd: string) {
  return createHash("sha256").update(pwd + "zq-salt-2024").digest("hex");
}

export interface IStorage {
  // User auth
  createUser(email: string, displayName: string, password: string): Promise<Omit<AppUser, "passwordHash">>;
  loginUser(email: string, password: string): Promise<Omit<AppUser, "passwordHash"> | null>;
  getUserById(id: string): Promise<Omit<AppUser, "passwordHash"> | undefined>;
  findOrCreateOAuthUser(email: string, displayName: string, provider: "google" | "github"): Promise<Omit<AppUser, "passwordHash">>;
  getRoom(id: string): Promise<Room | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: string, updates: Partial<Room>): Promise<Room | undefined>;
  getMember(roomId: string, uid: string): Promise<Member | undefined>;
  getRoomMembers(roomId: string): Promise<Member[]>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(id: string, updates: Partial<Member>): Promise<Member | undefined>;
  removeMember(id: string): Promise<void>;
  getChatMessages(roomId: string, limit?: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getRoomState(roomId: string): Promise<RoomState | undefined>;
  createOrUpdateRoomState(state: InsertRoomState): Promise<RoomState>;
  // RER
  createRerTask(task: InsertRerTask): Promise<RerTask>;
  getRerTask(id: string): Promise<RerTask | undefined>;
  updateRerTask(id: string, updates: Partial<RerTask>): Promise<RerTask | undefined>;
  getRoomRerTasks(roomId: string): Promise<RerTask[]>;
  getRunningRerTasks(): Promise<RerTask[]>;
  createRerAgentOutput(output: InsertRerAgentOutput): Promise<RerAgentOutput>;
  updateRerAgentOutput(id: string, updates: Partial<RerAgentOutput>): Promise<RerAgentOutput | undefined>;
  getTaskAgentOutputs(taskId: string): Promise<RerAgentOutput[]>;
  // SMCBOS: Missions & Tasks
  createMission(input: InsertMission): Promise<Mission>;
  getMission(id: string): Promise<Mission | undefined>;
  updateMission(id: string, updates: Partial<Mission>): Promise<Mission | undefined>;
  getRoomMissions(roomId: string): Promise<Mission[]>;
  createTask(input: InsertTask): Promise<Task>;
  getTask(id: string): Promise<Task | undefined>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined>;
  getMissionTasks(missionId: string): Promise<Task[]>;
  // SMCBOS: Shared Cognitive Memory
  setMemory(input: InsertMemoryEntry): Promise<MemoryEntry>;
  getMemory(roomId: string, scope: string, scopeId?: string, key?: string): Promise<MemoryEntry[]>;
  deleteMemory(roomId: string, scope: string, scopeId?: string, key?: string): Promise<void>;
}

// ── Postgres-backed storage ───────────────────────────────────────────────────
// Rooms, members, chat, workspace (room) state, and the RER pipeline are all
// persisted so the workstation survives refresh, reconnect, and redeploy.
// (Daily rate-limit counters remain in-memory — they reset every day anyway.)
export class DatabaseStorage implements IStorage {
  // ── User auth ───────────────────────────────────────────────────────────────
  async createUser(email: string, displayName: string, password: string) {
    const normEmail = email.toLowerCase().trim();
    const [existing] = await db.select().from(users).where(eq(users.email, normEmail));
    if (existing) throw new Error("Email already registered");
    const [user] = await db.insert(users).values({
      id: `user-${randomUUID().slice(0, 8)}`,
      email: normEmail,
      displayName: displayName.trim(),
      passwordHash: hashPassword(password),
      provider: "email",
      tier: "free",
    }).returning();
    const { passwordHash: _, ...safe } = user;
    return safe as Omit<AppUser, "passwordHash">;
  }

  async loginUser(email: string, password: string) {
    const normEmail = email.toLowerCase().trim();
    const [user] = await db.select().from(users).where(eq(users.email, normEmail));
    if (!user || user.passwordHash !== hashPassword(password)) return null;
    const { passwordHash: _, ...safe } = user;
    return safe as Omit<AppUser, "passwordHash">;
  }

  async getUserById(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return undefined;
    const { passwordHash: _, ...safe } = user;
    return safe as Omit<AppUser, "passwordHash">;
  }

  async findOrCreateOAuthUser(email: string, displayName: string, provider: "google" | "github") {
    const normEmail = email.toLowerCase().trim();
    const [existing] = await db.select().from(users).where(eq(users.email, normEmail));
    if (existing) {
      const { passwordHash: _, ...safe } = existing;
      return safe as Omit<AppUser, "passwordHash">;
    }
    const [user] = await db.insert(users).values({
      id: `user-${randomUUID().slice(0, 8)}`,
      email: normEmail,
      displayName: displayName.trim() || email.split("@")[0],
      passwordHash: "",
      provider,
      tier: "free",
    }).returning();
    const { passwordHash: _, ...safe } = user;
    return safe as Omit<AppUser, "passwordHash">;
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────
  async getRoom(id: string) {
    const [r] = await db.select().from(rooms).where(eq(rooms.id, id));
    return r;
  }

  async createRoom(room: InsertRoom): Promise<Room> {
    const [r] = await db.insert(rooms).values({
      id: room.id,
      ownerUid: room.ownerUid,
      isOpen: room.isOpen ?? true,
      memberCount: room.memberCount ?? 0,
    }).returning();
    return r;
  }

  async updateRoom(id: string, updates: Partial<Room>) {
    const [u] = await db.update(rooms).set(updates).where(eq(rooms.id, id)).returning();
    return u;
  }

  // ── Members ───────────────────────────────────────────────────────────────
  async getMember(roomId: string, uid: string) {
    const [m] = await db.select().from(members).where(and(eq(members.roomId, roomId), eq(members.uid, uid)));
    return m;
  }

  async getRoomMembers(roomId: string) {
    return db.select().from(members).where(eq(members.roomId, roomId));
  }

  async createMember(member: InsertMember): Promise<Member> {
    // Upsert on (roomId, uid) so a concurrent double-join can't create
    // duplicate member rows — it just refreshes the existing membership.
    const [m] = await db.insert(members).values({
      roomId: member.roomId,
      uid: member.uid,
      role: member.role ?? "member",
      displayName: member.displayName,
    }).onConflictDoUpdate({
      target: [members.roomId, members.uid],
      set: { displayName: member.displayName, lastSeen: new Date() },
    }).returning();
    return m;
  }

  async updateMember(id: string, updates: Partial<Member>) {
    const [u] = await db.update(members).set(updates).where(eq(members.id, id)).returning();
    return u;
  }

  async removeMember(id: string) {
    await db.delete(members).where(eq(members.id, id));
  }

  // ── Chat messages ─────────────────────────────────────────────────────────
  async getChatMessages(roomId: string, limit = 500): Promise<ChatMessage[]> {
    // Fetch the newest `limit` rows, then return them in chronological order.
    const rows = await db.select().from(chatMessages)
      .where(eq(chatMessages.roomId, roomId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows.reverse();
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [m] = await db.insert(chatMessages).values({
      roomId: message.roomId,
      authorUid: message.authorUid,
      text: message.text,
      isAI: message.isAI ?? false,
    }).returning();
    return m;
  }

  // ── Workspace (room) state ─────────────────────────────────────────────────
  async getRoomState(roomId: string) {
    const [s] = await db.select().from(roomStates).where(eq(roomStates.roomId, roomId));
    return s;
  }

  async createOrUpdateRoomState(state: InsertRoomState): Promise<RoomState> {
    const values = {
      roomId: state.roomId,
      urls: state.urls as string[],
      inputs: state.inputs as string[],
      collapsed: state.collapsed as boolean[],
      forceEmbed: state.forceEmbed as boolean[],
      allowList: state.allowList as string[],
      updatedBy: state.updatedBy ?? null,
      updatedAt: new Date(),
    };
    const [s] = await db.insert(roomStates).values(values)
      .onConflictDoUpdate({
        target: roomStates.roomId,
        set: {
          urls: values.urls,
          inputs: values.inputs,
          collapsed: values.collapsed,
          forceEmbed: values.forceEmbed,
          allowList: values.allowList,
          updatedBy: values.updatedBy,
          updatedAt: values.updatedAt,
        },
      })
      .returning();
    return s;
  }

  // ── RER pipeline ────────────────────────────────────────────────────────────
  async createRerTask(task: InsertRerTask): Promise<RerTask> {
    const [t] = await db.insert(rerTasks).values({
      id: task.id,
      roomId: task.roomId,
      topic: task.topic,
      mode: task.mode ?? "sequential",
      status: task.status ?? "pending",
      currentStep: task.currentStep ?? 0,
      totalSteps: task.totalSteps ?? 4,
    }).returning();
    return t;
  }

  async getRerTask(id: string) {
    const [t] = await db.select().from(rerTasks).where(eq(rerTasks.id, id));
    return t;
  }

  async updateRerTask(id: string, updates: Partial<RerTask>) {
    const [u] = await db.update(rerTasks).set(updates).where(eq(rerTasks.id, id)).returning();
    return u;
  }

  async getRoomRerTasks(roomId: string): Promise<RerTask[]> {
    return db.select().from(rerTasks)
      .where(eq(rerTasks.roomId, roomId))
      .orderBy(desc(rerTasks.createdAt));
  }

  async getRunningRerTasks(): Promise<RerTask[]> {
    return db.select().from(rerTasks).where(eq(rerTasks.status, "running"));
  }

  async createRerAgentOutput(output: InsertRerAgentOutput): Promise<RerAgentOutput> {
    const [o] = await db.insert(rerAgentOutputs).values({
      taskId: output.taskId,
      tabIndex: output.tabIndex,
      role: output.role,
      status: output.status ?? "idle",
      output: output.output ?? null,
      receivedInput: output.receivedInput ?? null,
    }).returning();
    return o;
  }

  async updateRerAgentOutput(id: string, updates: Partial<RerAgentOutput>) {
    const [u] = await db.update(rerAgentOutputs).set(updates).where(eq(rerAgentOutputs.id, id)).returning();
    return u;
  }

  async getTaskAgentOutputs(taskId: string): Promise<RerAgentOutput[]> {
    return db.select().from(rerAgentOutputs)
      .where(eq(rerAgentOutputs.taskId, taskId))
      .orderBy(asc(rerAgentOutputs.tabIndex));
  }

  // ── SMCBOS: Missions & Tasks (orchestration foundation) ─────────────────────
  async createMission(input: InsertMission): Promise<Mission> {
    const [m] = await db.insert(missions).values({
      roomId: input.roomId,
      title: input.title,
      objective: input.objective,
      kind: input.kind ?? "custom",
      status: input.status ?? "pending",
      createdBy: input.createdBy ?? null,
      metadata: (input.metadata ?? null) as any,
    }).returning();
    return m;
  }

  async getMission(id: string) {
    const [m] = await db.select().from(missions).where(eq(missions.id, id));
    return m;
  }

  async updateMission(id: string, updates: Partial<Mission>) {
    const [u] = await db.update(missions).set(updates).where(eq(missions.id, id)).returning();
    return u;
  }

  async getRoomMissions(roomId: string): Promise<Mission[]> {
    return db.select().from(missions).where(eq(missions.roomId, roomId)).orderBy(desc(missions.createdAt));
  }

  async createTask(input: InsertTask): Promise<Task> {
    const [t] = await db.insert(tasks).values({
      missionId: input.missionId,
      parentId: input.parentId ?? null,
      title: input.title,
      kind: input.kind ?? "generic",
      status: input.status ?? "pending",
      sequence: input.sequence ?? 0,
      input: input.input ?? null,
      output: input.output ?? null,
      error: input.error ?? null,
      metadata: (input.metadata ?? null) as any,
    }).returning();
    return t;
  }

  async getTask(id: string) {
    const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
    return t;
  }

  async updateTask(id: string, updates: Partial<Task>) {
    const [u] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return u;
  }

  async getMissionTasks(missionId: string): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.missionId, missionId)).orderBy(asc(tasks.sequence));
  }

  // ── SMCBOS: Shared Cognitive Memory ─────────────────────────────────────────
  async setMemory(input: InsertMemoryEntry): Promise<MemoryEntry> {
    const [m] = await db.insert(memoryEntries).values({
      roomId: input.roomId,
      scope: input.scope,
      scopeId: input.scopeId ?? "",
      key: input.key,
      value: (input.value ?? null) as any,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [memoryEntries.roomId, memoryEntries.scope, memoryEntries.scopeId, memoryEntries.key],
      set: { value: (input.value ?? null) as any, updatedAt: new Date() },
    }).returning();
    return m;
  }

  async getMemory(roomId: string, scope: string, scopeId?: string, key?: string): Promise<MemoryEntry[]> {
    const conds = [eq(memoryEntries.roomId, roomId), eq(memoryEntries.scope, scope)];
    if (scopeId !== undefined) conds.push(eq(memoryEntries.scopeId, scopeId));
    if (key !== undefined) conds.push(eq(memoryEntries.key, key));
    return db.select().from(memoryEntries).where(and(...conds)).orderBy(desc(memoryEntries.updatedAt));
  }

  async deleteMemory(roomId: string, scope: string, scopeId?: string, key?: string): Promise<void> {
    const conds = [eq(memoryEntries.roomId, roomId), eq(memoryEntries.scope, scope)];
    if (scopeId !== undefined) conds.push(eq(memoryEntries.scopeId, scopeId));
    if (key !== undefined) conds.push(eq(memoryEntries.key, key));
    await db.delete(memoryEntries).where(and(...conds));
  }

  // ── Rate limiting per user (daily, in-memory — resets each day) ──────────────
  private usageCounters = new Map<string, { date: string; geminiCalls: number; rerLaunches: number; coaCalls: number; resetAt: string }>();

  async getUsage(uid: string) {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${uid}:${today}`;
    let u = this.usageCounters.get(key);
    if (!u || u.resetAt !== today) {
      u = { date: today, geminiCalls: 0, rerLaunches: 0, coaCalls: 0, resetAt: today };
      this.usageCounters.set(key, u);
    }
    return u;
  }

  async incrementUsage(uid: string, field: "geminiCalls" | "rerLaunches" | "coaCalls") {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${uid}:${today}`;
    const u = await this.getUsage(uid);
    u[field] += 1;
    this.usageCounters.set(key, u);
    return u;
  }

  // ── Commercial tier ─────────────────────────────────────────────────────────
  async getTier(uid: string): Promise<"free" | "pro" | "enterprise"> {
    const [user] = await db.select().from(users).where(eq(users.id, uid));
    return (user?.tier as any) || "free";
  }
}

export const storage = new DatabaseStorage();
