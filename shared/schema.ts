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

export const insertRoomSchema = createInsertSchema(rooms).omit({
  createdAt: true,
});

export const insertMemberSchema = createInsertSchema(members).omit({
  id: true,
  lastSeen: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertRoomStateSchema = createInsertSchema(roomStates).omit({
  id: true,
  updatedAt: true,
});

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Member = typeof members.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type RoomState = typeof roomStates.$inferSelect;
export type InsertRoomState = z.infer<typeof insertRoomStateSchema>;
