import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull().default(""),
  provider: text("provider").notNull().default("email"),
  tier: text("tier").notNull().default("free"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey(),
  ownerUid: varchar("owner_uid").notNull(),
  isOpen: boolean("is_open").notNull().default(true),
  memberCount: integer("member_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  uid: varchar("uid").notNull(),
  role: varchar("role").notNull().default("member"),
  displayName: varchar("display_name").notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
}, (t) => ({
  roomUidUnique: uniqueIndex("members_room_uid_unique").on(t.roomId, t.uid),
}));

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  authorUid: varchar("author_uid").notNull(),
  text: text("text").notNull(),
  isAI: boolean("is_ai").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const roomStates = pgTable("room_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().unique(),
  urls: jsonb("urls").notNull().$type<string[]>(),
  inputs: jsonb("inputs").notNull().$type<string[]>(),
  collapsed: jsonb("collapsed").notNull().$type<boolean[]>(),
  forceEmbed: jsonb("force_embed").notNull().$type<boolean[]>(),
  allowList: jsonb("allow_list").notNull().$type<string[]>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by"),
});

// RER Pipeline Tasks
export const rerTasks = pgTable("rer_tasks", {
  id: varchar("id").primaryKey(),
  roomId: varchar("room_id").notNull(),
  topic: text("topic").notNull(),
  mode: varchar("mode").notNull().default("sequential"), // "sequential" | "parallel"
  status: varchar("status").notNull().default("pending"), // "pending" | "running" | "done" | "error"
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull().default(4),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// RER Agent outputs per tab
export const rerAgentOutputs = pgTable("rer_agent_outputs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  tabIndex: integer("tab_index").notNull(),
  role: varchar("role").notNull(), // "researcher" | "reviewer" | "enhancer" | "reporter"
  status: varchar("status").notNull().default("idle"), // "idle" | "thinking" | "done" | "error"
  output: text("output"),
  receivedInput: text("received_input"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRoomSchema = createInsertSchema(rooms).omit({ createdAt: true });
export const insertMemberSchema = createInsertSchema(members).omit({ id: true, lastSeen: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertRoomStateSchema = createInsertSchema(roomStates).omit({ id: true, updatedAt: true });
export const insertRerTaskSchema = createInsertSchema(rerTasks).omit({ createdAt: true, completedAt: true });
export const insertRerAgentOutputSchema = createInsertSchema(rerAgentOutputs).omit({ id: true, createdAt: true });

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Member = typeof members.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type RoomState = typeof roomStates.$inferSelect;
export type InsertRoomState = z.infer<typeof insertRoomStateSchema>;
export type RerTask = typeof rerTasks.$inferSelect;
export type InsertRerTask = z.infer<typeof insertRerTaskSchema>;
export type RerAgentOutput = typeof rerAgentOutputs.$inferSelect;
export type InsertRerAgentOutput = z.infer<typeof insertRerAgentOutputSchema>;

// ── SMCBOS Milestone 2 Foundation: Missions, Tasks, Shared Memory ─────────────
// Central orchestration primitives. Additive — existing rooms/RER are untouched.
export const missions = pgTable("missions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  kind: varchar("kind").notNull().default("custom"), // "research" | "rer" | "browse" | "custom"
  status: varchar("status").notNull().default("pending"), // pending|planning|running|completed|failed|cancelled
  createdBy: varchar("created_by"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  missionId: varchar("mission_id").notNull(),
  parentId: varchar("parent_id"), // enables a task tree
  title: text("title").notNull(),
  kind: varchar("kind").notNull().default("generic"),
  status: varchar("status").notNull().default("pending"), // pending|running|done|error|skipped
  sequence: integer("sequence").notNull().default(0),
  input: text("input"),
  output: text("output"),
  error: text("error"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shared Cognitive Memory — scoped key/value store agents read & write through.
export const memoryEntries = pgTable("memory_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  scope: varchar("scope").notNull(), // "mission" | "workspace" | "evidence" | "knowledge"
  scopeId: varchar("scope_id").notNull().default(""), // e.g. a missionId; "" for room-wide
  key: varchar("key").notNull(),
  value: jsonb("value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  memScopeKeyUnique: uniqueIndex("memory_scope_key_unique").on(t.roomId, t.scope, t.scopeId, t.key),
}));

export const insertMissionSchema = createInsertSchema(missions).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMemoryEntrySchema = createInsertSchema(memoryEntries).omit({ id: true, createdAt: true, updatedAt: true });

export type Mission = typeof missions.$inferSelect;
export type InsertMission = z.infer<typeof insertMissionSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type MemoryEntry = typeof memoryEntries.$inferSelect;
export type InsertMemoryEntry = z.infer<typeof insertMemoryEntrySchema>;

export const TAB_ROLES = ["researcher", "reviewer", "enhancer", "reporter"] as const;
export type TabRole = typeof TAB_ROLES[number];
