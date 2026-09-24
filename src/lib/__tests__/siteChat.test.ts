import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  SITE_CHAT_LIMITS,
  siteChatErrorMessage,
  toSiteChatRequestMessages,
} from "../siteChat";

const apiError = (statusCode: number, responseBody = "") =>
  Object.assign(new Error(responseBody || "Failed"), {
    statusCode,
    responseBody,
  });

describe("site chat client helpers", () => {
  it("sends only recent user and assistant text", () => {
    const history: UIMessage[] = Array.from({ length: 26 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      parts: [
        { type: "reasoning", text: "thinking", state: "done" },
        { type: "text", text: `turn ${index}` },
      ],
    }));
    const sent = toSiteChatRequestMessages(history);
    expect(sent).toHaveLength(SITE_CHAT_LIMITS.maxMessages);
    expect(sent.at(-1)).toEqual({
      id: "m25",
      role: "assistant",
      parts: [{ type: "text", text: "turn 25" }],
    });
  });

  it("truncates long turns and stays under the request size cap", () => {
    const history: UIMessage[] = Array.from({ length: 20 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", text: "é".repeat(3000) }],
    }));
    const sent = toSiteChatRequestMessages(history);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.at(-1)?.id).toBe("m19");
    for (const message of sent) {
      const part = message.parts[0];
      expect(part?.type === "text" && part.text.length).toBe(
        SITE_CHAT_LIMITS.maxTextChars,
      );
    }
    const bytes = new TextEncoder().encode(
      JSON.stringify({ id: "site-chat-0", messages: sent }),
    ).byteLength;
    expect(bytes).toBeLessThan(SITE_CHAT_LIMITS.maxBodyBytes);
  });

  it("drops system messages and empty turns", () => {
    const sent = toSiteChatRequestMessages([
      { id: "s", role: "system", parts: [{ type: "text", text: "rules" }] },
      { id: "e", role: "assistant", parts: [] },
      { id: "u", role: "user", parts: [{ type: "text", text: "Hi" }] },
    ]);
    expect(sent.map((message) => message.id)).toEqual(["u"]);
  });

  it("explains rate limits and size limits in plain words", () => {
    expect(siteChatErrorMessage(apiError(429))).toMatch(/try again/i);
    expect(siteChatErrorMessage(apiError(413))).toMatch(
      /shorter|new conversation/i,
    );
    expect(siteChatErrorMessage(apiError(500))).toMatch(/unavailable/i);
    expect(siteChatErrorMessage(new TypeError("Failed to fetch"))).toMatch(
      /unavailable/i,
    );
    expect(siteChatErrorMessage(undefined)).toBe("");
  });
});
