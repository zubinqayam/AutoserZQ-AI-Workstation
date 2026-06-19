import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
});

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

export const TAB_ROLES = ["researcher", "reviewer", "enhancer", "reporter"] as const;
export type TabRole = typeof TAB_ROLES[number];
