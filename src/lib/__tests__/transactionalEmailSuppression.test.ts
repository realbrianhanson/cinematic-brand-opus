import { describe, expect, it, vi } from "vitest";
import {
  persistVerifiedResendSuppressions,
  verifiedResendSuppressions,
} from "../../../supabase/functions/_shared/transactionalEmailSuppression";

describe("verified transactional suppression callbacks", () => {
  it("normalizes and deduplicates every valid recipient of a bounce or complaint", () => {
    expect(
      verifiedResendSuppressions({
        type: "email.complained",
        data: {
          to: [
            " One@Example.com ",
            "two@example.com",
            "one@example.com",
            null,
            "bad\r\nbcc:target@example.com",
          ],
        },
      }),
    ).toEqual([
      { email: "one@example.com", reason: "complained" },
      { email: "two@example.com", reason: "complained" },
    ]);
    expect(
      verifiedResendSuppressions({
        type: "email.bounced",
        data: { to: "other@example.com" },
      }),
    ).toEqual([{ email: "other@example.com", reason: "bounced" }]);
    expect(
      verifiedResendSuppressions({
        type: "email.delivered",
        data: { to: "other@example.com" },
      }),
    ).toEqual([]);
    expect(verifiedResendSuppressions(null)).toEqual([]);
  });
  it("requires durable storage before acknowledging all recipients", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const event = {
      type: "email.bounced",
      data: { to: ["one@example.com", "two@example.com"] },
    };
    expect(await persistVerifiedResendSuppressions(event, persist)).toBe(2);
    expect(persist).toHaveBeenCalledWith({
      email: "two@example.com",
      reason: "bounced",
    });
    persist.mockResolvedValue(false);
    await expect(
      persistVerifiedResendSuppressions(event, persist),
    ).rejects.toThrow("Suppression storage unavailable");
  });
});
