// ── SMCBOS Shared Cognitive Memory ───────────────────────────────────────────
// A scoped, persisted key/value store the agents read from and write to, so the
// Thinker/Researcher/Mr.Q/Keyhole/etc. stop operating in isolation and share a
// common memory. Persisted via storage so it survives restarts/redeploys.
//
// Scopes:
//   - "workspace"  : room-wide facts (scopeId = "")
//   - "mission"    : per-mission memory (scopeId = missionId)
//   - "evidence"   : captured evidence records (scopeId = missionId or "")
//   - "knowledge"  : durable knowledge nodes (Knowledge Graph impl is deferred)

import { storage } from "../storage";
import type { MemoryEntry } from "@shared/schema";

export type MemoryScope = "mission" | "workspace" | "evidence" | "knowledge";

export interface ISharedMemory {
  remember(roomId: string, scope: MemoryScope, key: string, value: any, scopeId?: string): Promise<MemoryEntry>;
  recall(roomId: string, scope: MemoryScope, opts?: { scopeId?: string; key?: string }): Promise<MemoryEntry[]>;
  forget(roomId: string, scope: MemoryScope, opts?: { scopeId?: string; key?: string }): Promise<void>;
}

class SharedCognitiveMemory implements ISharedMemory {
  async remember(roomId: string, scope: MemoryScope, key: string, value: any, scopeId = ""): Promise<MemoryEntry> {
    return storage.setMemory({ roomId, scope, scopeId, key, value });
  }

  async recall(roomId: string, scope: MemoryScope, opts: { scopeId?: string; key?: string } = {}): Promise<MemoryEntry[]> {
    return storage.getMemory(roomId, scope, opts.scopeId, opts.key);
  }

  async forget(roomId: string, scope: MemoryScope, opts: { scopeId?: string; key?: string } = {}): Promise<void> {
    return storage.deleteMemory(roomId, scope, opts.scopeId, opts.key);
  }
}

export const sharedMemory: ISharedMemory = new SharedCognitiveMemory();
