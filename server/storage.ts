import {
  type Room, type InsertRoom,
  type Member, type InsertMember,
  type ChatMessage, type InsertChatMessage,
  type RoomState, type InsertRoomState,
  type RerTask, type InsertRerTask,
  type RerAgentOutput, type InsertRerAgentOutput,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
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
  createRerAgentOutput(output: InsertRerAgentOutput): Promise<RerAgentOutput>;
  updateRerAgentOutput(id: string, updates: Partial<RerAgentOutput>): Promise<RerAgentOutput | undefined>;
  getTaskAgentOutputs(taskId: string): Promise<RerAgentOutput[]>;
}

export class MemStorage implements IStorage {
  private rooms = new Map<string, Room>();
  private members = new Map<string, Member>();
  private chatMessages = new Map<string, ChatMessage>();
  private roomStates = new Map<string, RoomState>();
  private rerTasks = new Map<string, RerTask>();
  private rerAgentOutputs = new Map<string, RerAgentOutput>();

  async getRoom(id: string) { return this.rooms.get(id); }

  async createRoom(room: InsertRoom): Promise<Room> {
    const r: Room = { ...room, isOpen: room.isOpen ?? true, memberCount: room.memberCount ?? 0, createdAt: new Date() };
    this.rooms.set(r.id, r);
    return r;
  }

  async updateRoom(id: string, updates: Partial<Room>) {
    const r = this.rooms.get(id);
    if (!r) return undefined;
    const u = { ...r, ...updates };
    this.rooms.set(id, u);
    return u;
  }

  async getMember(roomId: string, uid: string) {
    return Array.from(this.members.values()).find(m => m.roomId === roomId && m.uid === uid);
  }

  async getRoomMembers(roomId: string) {
    return Array.from(this.members.values()).filter(m => m.roomId === roomId);
  }

  async createMember(member: InsertMember): Promise<Member> {
    const id = randomUUID();
    const m: Member = { id, ...member, role: member.role ?? "member", lastSeen: new Date() };
    this.members.set(id, m);
    return m;
  }

  async updateMember(id: string, updates: Partial<Member>) {
    const m = this.members.get(id);
    if (!m) return undefined;
    const u = { ...m, ...updates };
    this.members.set(id, u);
    return u;
  }

  async removeMember(id: string) { this.members.delete(id); }

  async getChatMessages(roomId: string, limit = 500): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter(m => m.roomId === roomId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-limit);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const m: ChatMessage = { id, ...message, isAI: message.isAI ?? false, createdAt: new Date() };
    this.chatMessages.set(id, m);
    return m;
  }

  async getRoomState(roomId: string) {
    return Array.from(this.roomStates.values()).find(s => s.roomId === roomId);
  }

  async createOrUpdateRoomState(state: InsertRoomState): Promise<RoomState> {
    const existing = await this.getRoomState(state.roomId);
    const id = existing?.id ?? randomUUID();
    const s: RoomState = {
      id, roomId: state.roomId,
      urls: state.urls as string[], inputs: state.inputs as string[],
      collapsed: state.collapsed as boolean[], forceEmbed: state.forceEmbed as boolean[],
      allowList: state.allowList as string[], updatedBy: state.updatedBy ?? null, updatedAt: new Date(),
    };
    this.roomStates.set(id, s);
    return s;
  }

  async createRerTask(task: InsertRerTask): Promise<RerTask> {
    const t: RerTask = {
      ...task, mode: task.mode ?? "sequential", status: task.status ?? "pending",
      currentStep: task.currentStep ?? 0, totalSteps: task.totalSteps ?? 4,
      createdAt: new Date(), completedAt: null,
    };
    this.rerTasks.set(t.id, t);
    return t;
  }

  async getRerTask(id: string) { return this.rerTasks.get(id); }

  async updateRerTask(id: string, updates: Partial<RerTask>) {
    const t = this.rerTasks.get(id);
    if (!t) return undefined;
    const u = { ...t, ...updates };
    this.rerTasks.set(id, u);
    return u;
  }

  async getRoomRerTasks(roomId: string): Promise<RerTask[]> {
    return Array.from(this.rerTasks.values())
      .filter(t => t.roomId === roomId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createRerAgentOutput(output: InsertRerAgentOutput): Promise<RerAgentOutput> {
    const id = randomUUID();
    const o: RerAgentOutput = { id, ...output, status: output.status ?? "idle", output: output.output ?? null, receivedInput: output.receivedInput ?? null, createdAt: new Date() };
    this.rerAgentOutputs.set(id, o);
    return o;
  }

  async updateRerAgentOutput(id: string, updates: Partial<RerAgentOutput>) {
    const o = this.rerAgentOutputs.get(id);
    if (!o) return undefined;
    const u = { ...o, ...updates };
    this.rerAgentOutputs.set(id, u);
    return u;
  }

  async getTaskAgentOutputs(taskId: string): Promise<RerAgentOutput[]> {
    return Array.from(this.rerAgentOutputs.values())
      .filter(o => o.taskId === taskId)
      .sort((a, b) => a.tabIndex - b.tabIndex);
  }
}

export const storage = new MemStorage();
