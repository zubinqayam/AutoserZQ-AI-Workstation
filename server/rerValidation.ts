import { z } from "zod";
import { computeChecksum } from "./gemini";

// Strip control characters (\x00-\x1F, \x7F-\x9F), zero-width characters
// (\u200B-\u200F, \uFEFF), and angle brackets from user input.
export function sanitizeRerText(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .replace(/[\u200B-\u200F\uFEFF]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 500);
}

export function sanitizeChatMessages<T extends { role?: unknown; content?: unknown }>(
  messages: T[]
): T[] {
  return messages
    .filter((m) => m && typeof m.content === "string")
    .map((m) => ({ ...m, content: sanitizeRerText(m.content as string) }))
    .filter((m) => (m.content as string).length > 0) as T[];
}

export const rerStartSchema = z.object({
  roomId: z.string().min(1, "roomId required"),
  topic: z
    .string()
    .min(1, "topic required")
    .transform(sanitizeRerText)
    .refine((v) => v.length > 0, { message: "topic must not be empty after sanitization" }),
  mode: z.enum(["sequential", "parallel"]).default("sequential"),
});

export interface CheckpointLike {
  tabIndex: number;
  status: string;
  output: string | null;
  checkpointHash: string | null;
}

export function verifyCheckpointChain(outputs: CheckpointLike[]): { lastGoodIndex: number; intact: boolean } {
  let lastGoodIndex = -1;
  for (const o of outputs) {
    if (o.status !== "done" || !o.output) break;
    if (!o.checkpointHash || computeChecksum(o.output) !== o.checkpointHash) {
      return { lastGoodIndex, intact: false };
    }
    lastGoodIndex = o.tabIndex;
  }
  return { lastGoodIndex, intact: true };
}
