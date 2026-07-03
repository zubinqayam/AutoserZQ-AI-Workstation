// ── SMCBOS Workspace State Engine ────────────────────────────────────────────
// The single source of truth for "what is going on in this room". It composes
// the persisted room, members, workspace (panel) state, recent chat, RER tasks,
// and missions into one snapshot. Agents consume buildAgentContext() instead of
// each assembling their own ad-hoc view, so they all reason over the same state.

import { storage } from "../storage";
import { eventBus } from "./eventBus";
import type { Room, Member, RoomState, ChatMessage, RerTask, Mission } from "@shared/schema";

export interface WorkspaceSnapshot {
  roomId: string;
  room: Room | null;
  members: Member[];
  state: RoomState | null;
  recentChat: ChatMessage[];
  rerTasks: RerTask[];
  missions: Mission[];
  updatedAt: number;
}

export async function getWorkspaceSnapshot(roomId: string): Promise<WorkspaceSnapshot> {
  const [room, members, state, recentChat, rerTasks, missions] = await Promise.all([
    storage.getRoom(roomId),
    storage.getRoomMembers(roomId),
    storage.getRoomState(roomId),
    storage.getChatMessages(roomId, 20),
    storage.getRoomRerTasks(roomId),
    storage.getRoomMissions(roomId),
  ]);
  return {
    roomId,
    room: room ?? null,
    members,
    state: state ?? null,
    recentChat,
    rerTasks,
    missions,
    updatedAt: Date.now(),
  };
}

/** Textual workspace context for agents — the shared view all agents reason over. */
export async function buildAgentContext(roomId: string): Promise<string> {
  const snap = await getWorkspaceSnapshot(roomId);
  const lines: string[] = [];
  lines.push(`=== ZQ LIVE WORKSPACE STATE (room ${roomId}) ===`);
  lines.push(`Members present: ${snap.members.length}`);

  if (snap.state) {
    lines.push(`Conference Room panels:`);
    (snap.state.urls || []).forEach((u, i) => lines.push(`  Panel ${i + 1}: ${u || "(empty)"}`));
  } else {
    lines.push(`Conference Room: no panel state saved yet.`);
  }

  if (snap.missions.length) {
    lines.push(`Missions (${snap.missions.length}):`);
    snap.missions.slice(0, 5).forEach((m) => lines.push(`  - [${m.status}] ${m.title}`));
  }

  if (snap.rerTasks.length) {
    lines.push(`RER pipeline runs (${snap.rerTasks.length}):`);
    snap.rerTasks.slice(0, 3).forEach((t) =>
      lines.push(`  - [${t.status}] "${t.topic}" (step ${t.currentStep}/${t.totalSteps}, ${t.mode})`),
    );
  }

  if (snap.recentChat.length) {
    lines.push(`Recent Command Center chat:`);
    snap.recentChat.slice(-6).forEach((c) =>
      lines.push(`  ${c.isAI ? "AI" : "User"}: ${c.text.slice(0, 160)}`),
    );
  }

  return lines.join("\n");
}

/** Update persisted workspace (panel) state and announce it on the event bus. */
export async function updateWorkspaceState(roomId: string, state: any, updatedBy: string) {
  const saved = await storage.createOrUpdateRoomState({ roomId, ...state, updatedBy });
  eventBus.publish("workspace.updated", roomId, saved);
  return saved;
}
