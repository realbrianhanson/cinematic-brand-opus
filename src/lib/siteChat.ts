/**
 * Shared, client-safe limits and helpers for the public site chat.
 *
 * The server (siteChatGuard.server.ts) enforces these limits strictly; the
 * browser mirrors them so normal conversations never trip the server caps.
 */
import type { UIMessage } from "ai";

export const SITE_CHAT_LIMITS = {
  /** Hard cap on the raw request body, checked before JSON parsing. */
  maxBodyBytes: 32 * 1024,
  /** Only the most recent turns are sent to the model. */
  maxMessages: 20,
  /** Per-message character cap (the question box enforces the same). */
  maxTextChars: 2000,
} as const;

/** Room left for the request envelope ({ id, messages }) under the body cap. */
const CLIENT_BODY_BUDGET = SITE_CHAT_LIMITS.maxBodyBytes - 1024;

export type SiteChatRole = "user" | "assistant";

export interface SiteChatMessage {
  id: string;
  role: SiteChatRole;
  parts: [{ type: "text"; text: string }];
}

const byteLength = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

function textOf(message: UIMessage): string {
  return (message.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/**
 * What the browser sends: recent user/assistant text only (no reasoning,
 * tool or metadata parts), each turn truncated, oldest turns dropped until
 * the request fits comfortably under the server's body cap.
 */
export function toSiteChatRequestMessages(
  messages: readonly UIMessage[],
): SiteChatMessage[] {
  const cleaned = messages
    .filter(
      (message) => message.role === "user" || message.role === "assistant",
    )
    .map((message): SiteChatMessage => ({
      id: String(message.id).slice(0, 100),
      role: message.role as SiteChatRole,
      parts: [
        {
          type: "text",
          text: textOf(message).slice(0, SITE_CHAT_LIMITS.maxTextChars),
        },
      ],
    }))
    .filter((message) => message.parts[0].text.length > 0)
    .slice(-SITE_CHAT_LIMITS.maxMessages);

  let start = 0;
  while (
    start < cleaned.length - 1 &&
    byteLength(cleaned.slice(start)) > CLIENT_BODY_BUDGET
  )
    start += 1;
  return cleaned.slice(start);
}

/** Friendly, fixed copy for a failed chat request. Empty when there is no error. */
export function siteChatErrorMessage(error: unknown): string {
  if (!error) return "";
  const status =
    typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  if (status === 429)
    return "The assistant has answered a lot of questions for now. Please try again in a little while.";
  if (status === 413)
    return "That conversation is too long for the assistant. Please start a new conversation or ask a shorter question.";
  if (status === 400)
    return "The assistant could not read that question. Please start a new conversation and try again.";
  return "The assistant is unavailable right now.";
}
