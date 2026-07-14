// ── SMCBOS Internal Event Bus ────────────────────────────────────────────────
// Lightweight, in-process typed pub/sub so missions, tasks, the workspace, and
// (future) browser/evidence modules can emit events that other modules — and the
// WebSocket layer — react to, without direct coupling. Intentionally single-node
// (an EventEmitter); a distributed bus is a deferred SMCBOS phase.

import { EventEmitter } from "events";

export type ZQEventType =
  | "mission.created"
  | "mission.updated"
  | "mission.completed"
  | "mission.failed"
  | "task.created"
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "workspace.updated"
  | "evidence.captured"
  | "evidence.deleted"
  | "browser.event"
  | "budget.usage"
  | "budget.reserved"
  | "budget.settled"
  | "budget.released"
  | "budget.soft_threshold"
  | "budget.hard_threshold"
  | "budget.exhausted"
  | "budget.zero_spend_enabled"
  | "budget.zero_spend_disabled";

export interface ZQEvent<T = any> {
  type: ZQEventType;
  roomId: string;
  payload: T;
  at: number;
}

class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Many WS clients + internal listeners can subscribe; raise the ceiling.
    this.emitter.setMaxListeners(200);
  }

  publish<T>(type: ZQEventType, roomId: string, payload: T): ZQEvent<T> {
    const evt: ZQEvent<T> = { type, roomId, payload, at: Date.now() };
    this.emitter.emit(type, evt);
    this.emitter.emit("*", evt);
    return evt;
  }

  /** Subscribe to a specific event type, or "*" for all. Returns an unsubscribe fn. */
  on(type: ZQEventType | "*", handler: (evt: ZQEvent) => void): () => void {
    this.emitter.on(type, handler);
    return () => this.emitter.off(type, handler);
  }
}

export const eventBus = new EventBus();
