import {
  type Room,
  type InsertRoom,
  type Member,
  type InsertMember,
  type ChatMessage,
  type InsertChatMessage,
  type RoomState,
  type InsertRoomState,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Room operations
  getRoom(id: string): Promise<Room | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: string, updates: Partial<Room>): Promise<Room | undefined>;

  // Member operations
  getMember(roomId: string, uid: string): Promise<Member | undefined>;
  getRoomMembers(roomId: string): Promise<Member[]>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(id: string, updates: Partial<Member>): Promise<Member | undefined>;
  removeMember(id: string): Promise<void>;
  
  // Chat operations
  getChatMessages(roomId: string, limit?: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  
  // Room state operations
  getRoomState(roomId: string): Promise<RoomState | undefined>;
  createOrUpdateRoomState(state: InsertRoomState): Promise<RoomState>;
}

export class MemStorage implements IStorage {
  private rooms: Map<string, Room>;
  private members: Map<string, Member>;
  private chatMessages: Map<string, ChatMessage>;
  private roomStates: Map<string, RoomState>;

  constructor() {
    this.rooms = new Map();
    this.members = new Map();
    this.chatMessages = new Map();
    this.roomStates = new Map();
  }

  async getRoom(id: string): Promise<Room | undefined> {
    return this.rooms.get(id);
  }

  async createRoom(room: InsertRoom): Promise<Room> {
    const newRoom: Room = {
      id: room.id,
      ownerUid: room.ownerUid,
      isOpen: room.isOpen ?? true,
      memberCount: room.memberCount ?? 0,
      createdAt: new Date(),
    };
    this.rooms.set(room.id, newRoom);
    return newRoom;
  }

  async updateRoom(id: string, updates: Partial<Room>): Promise<Room | undefined> {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    const updated = { ...room, ...updates };
    this.rooms.set(id, updated);
    return updated;
  }

  async getMember(roomId: string, uid: string): Promise<Member | undefined> {
    return Array.from(this.members.values()).find(
      (m) => m.roomId === roomId && m.uid === uid
    );
  }

  async getRoomMembers(roomId: string): Promise<Member[]> {
    return Array.from(this.members.values()).filter((m) => m.roomId === roomId);
  }

  async createMember(member: InsertMember): Promise<Member> {
    const id = randomUUID();
    const newMember: Member = {
      id,
      roomId: member.roomId,
      uid: member.uid,
      role: member.role ?? "member",
      displayName: member.displayName,
      lastSeen: new Date(),
    };
    this.members.set(id, newMember);
    return newMember;
  }

  async updateMember(id: string, updates: Partial<Member>): Promise<Member | undefined> {
    const member = this.members.get(id);
    if (!member) return undefined;
    const updated = { ...member, ...updates };
    this.members.set(id, updated);
    return updated;
  }

  async removeMember(id: string): Promise<void> {
    this.members.delete(id);
  }

  async getChatMessages(roomId: string, limit: number = 500): Promise<ChatMessage[]> {
    const messages = Array.from(this.chatMessages.values())
      .filter((m) => m.roomId === roomId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return messages.slice(-limit);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const newMessage: ChatMessage = {
      id,
      roomId: message.roomId,
      authorUid: message.authorUid,
      text: message.text,
      isAI: message.isAI ?? false,
      createdAt: new Date(),
    };
    this.chatMessages.set(id, newMessage);
    return newMessage;
  }

  async getRoomState(roomId: string): Promise<RoomState | undefined> {
    return Array.from(this.roomStates.values()).find((s) => s.roomId === roomId);
  }

  async createOrUpdateRoomState(state: InsertRoomState): Promise<RoomState> {
    const existing = await this.getRoomState(state.roomId);
    if (existing) {
      const updated: RoomState = {
        id: existing.id,
        roomId: state.roomId,
        urls: state.urls as string[],
        inputs: state.inputs as string[],
        collapsed: state.collapsed as boolean[],
        forceEmbed: state.forceEmbed as boolean[],
        allowList: state.allowList as string[],
        updatedBy: state.updatedBy ?? null,
        updatedAt: new Date(),
      };
      this.roomStates.set(existing.id, updated);
      return updated;
    } else {
      const id = randomUUID();
      const newState: RoomState = {
        id,
        roomId: state.roomId,
        urls: state.urls as string[],
        inputs: state.inputs as string[],
        collapsed: state.collapsed as boolean[],
        forceEmbed: state.forceEmbed as boolean[],
        allowList: state.allowList as string[],
        updatedBy: state.updatedBy ?? null,
        updatedAt: new Date(),
      };
      this.roomStates.set(id, newState);
      return newState;
    }
  }
}

export const storage = new MemStorage();
