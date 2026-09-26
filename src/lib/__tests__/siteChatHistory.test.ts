import { describe, expect, it } from "vitest";
import {
  readChatHistory,
  chatHistoryKey,
  CHAT_HISTORY_AGE,
} from "../siteChatHistory";

describe("browser chat recovery", () => {
  it("rejects malformed parts, expired history and oversized records", () => {
    const now = Date.now();
    for (const raw of [
      "not json",
      "x".repeat(100000),
      JSON.stringify({ savedAt: now - CHAT_HISTORY_AGE - 1, messages: [] }),
      JSON.stringify({
        savedAt: now,
        messages: [{ role: "user", id: "u", parts: [null] }],
      }),
    ]) {
      expect(readChatHistory(raw, now)).toEqual([]);
    }
  });
  it("keeps only bounded user/assistant text for the correct brand key", () => {
    expect(chatHistoryKey("https://one.test", "One")).not.toBe(
      chatHistoryKey("https://one.test", "Two"),
    );
    const messages = [
      {
        id: "u",
        role: "user",
        parts: [{ type: "text", text: "Where is my download?" }],
      },
    ];
    expect(
      readChatHistory(JSON.stringify({ savedAt: 1000, messages }), 1100),
    ).toEqual(messages);
    expect(
      readChatHistory(
        JSON.stringify({
          savedAt: 1000,
          messages: [
            { id: "s", role: "system", parts: [{ type: "text", text: "bad" }] },
          ],
        }),
        1100,
      ),
    ).toEqual([]);
  });
});
