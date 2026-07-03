// ── SMCBOS Mission Manager ───────────────────────────────────────────────────
// The central orchestration layer. Everything an agent "does" is modelled as a
// Mission (an objective) decomposed into a tree of Tasks. The manager owns the
// mission/task lifecycle and emits events on the bus so other modules (and the
// WebSocket layer) stay in sync without direct coupling.
//
// This is the primitive future phases build on (Planner, Execution, Evidence,
// Review). It is wired in additively today — the existing RER pipeline mirrors
// its runs here for telemetry, but nothing existing depends on this to function.

import { storage } from "../storage";
import { eventBus } from "./eventBus";
import type { Mission, InsertMission, Task, InsertTask } from "@shared/schema";

export interface MissionWithTasks extends Mission {
  tasks: Task[];
}

class MissionManager {
  async createMission(input: InsertMission): Promise<Mission> {
    const mission = await storage.createMission(input);
    eventBus.publish("mission.created", mission.roomId, mission);
    return mission;
  }

  async getMission(id: string): Promise<Mission | undefined> {
    return storage.getMission(id);
  }

  async getMissionWithTasks(id: string): Promise<MissionWithTasks | undefined> {
    const mission = await storage.getMission(id);
    if (!mission) return undefined;
    const tasks = await storage.getMissionTasks(id);
    return { ...mission, tasks };
  }

  async listMissions(roomId: string): Promise<Mission[]> {
    return storage.getRoomMissions(roomId);
  }

  async updateMissionStatus(id: string, status: string): Promise<Mission | undefined> {
    const updates: Partial<Mission> = { status, updatedAt: new Date() };
    if (status === "completed" || status === "failed" || status === "cancelled") {
      updates.completedAt = new Date();
    }
    const mission = await storage.updateMission(id, updates);
    if (mission) {
      const type =
        status === "failed" ? "mission.failed" :
        status === "completed" ? "mission.completed" :
        "mission.updated";
      eventBus.publish(type, mission.roomId, mission);
    }
    return mission;
  }

  async addTask(input: InsertTask): Promise<Task> {
    const task = await storage.createTask(input);
    const mission = await storage.getMission(task.missionId);
    if (mission) eventBus.publish("task.created", mission.roomId, task);
    return task;
  }

  private async emitTask(type: "task.started" | "task.completed" | "task.failed", task: Task | undefined) {
    if (!task) return;
    const mission = await storage.getMission(task.missionId);
    if (mission) eventBus.publish(type, mission.roomId, task);
  }

  async startTask(taskId: string, input?: string): Promise<Task | undefined> {
    const task = await storage.updateTask(taskId, { status: "running", input: input ?? undefined, updatedAt: new Date() });
    await this.emitTask("task.started", task);
    return task;
  }

  async completeTask(taskId: string, output?: string): Promise<Task | undefined> {
    const task = await storage.updateTask(taskId, { status: "done", output: output ?? undefined, updatedAt: new Date() });
    await this.emitTask("task.completed", task);
    return task;
  }

  async failTask(taskId: string, error: string): Promise<Task | undefined> {
    const task = await storage.updateTask(taskId, { status: "error", error, updatedAt: new Date() });
    await this.emitTask("task.failed", task);
    return task;
  }
}

export const missionManager = new MissionManager();
