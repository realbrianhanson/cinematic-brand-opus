import type { UIMessage } from "ai";
import { toSiteChatRequestMessages } from "./siteChat";

export const CHAT_HISTORY_AGE = 7 * 24 * 60 * 60 * 1000;
export const chatHistoryKey = (siteUrl: string, name: string) =>
  `site-chat-v2:${encodeURIComponent(siteUrl)}:${encodeURIComponent(name)}`;

export function readChatHistory(
  raw: string | null,
  now = Date.now(),
): UIMessage[] {
  if (!raw || raw.length > 80000) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return [];
    const record = value as { savedAt?: unknown; messages?: unknown };
    if (
      typeof record.savedAt !== "number" ||
      !Number.isFinite(record.savedAt) ||
      record.savedAt > now ||
      now - record.savedAt > CHAT_HISTORY_AGE ||
      !Array.isArray(record.messages) ||
      record.messages.length > 200
    )
      return [];
    const valid = record.messages.filter(
      (item): item is UIMessage =>
        !!item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        ["user", "assistant"].includes(item.role) &&
        Array.isArray(item.parts) &&
        item.parts.every(
          (part: unknown) =>
            !!part &&
            typeof part === "object" &&
            "type" in part &&
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string",
        ),
    );
    return toSiteChatRequestMessages(valid);
  } catch {
    return [];
  }
}
