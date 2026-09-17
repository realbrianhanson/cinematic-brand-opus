import { afterEach, describe, expect, it } from "vitest";
import { formatPublicDate } from "../publicDate";

const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("public date hydration", () => {
  it("keeps server and visitor dates identical across midnight and year boundaries", () => {
    for (const zone of [
      "UTC",
      "America/New_York",
      "Pacific/Honolulu",
      "Asia/Tokyo",
    ]) {
      process.env.TZ = zone;
      expect(formatPublicDate("2026-09-17T01:00:00Z")).toBe("Sep 17, 2026");
      expect(
        formatPublicDate("2026-01-01T01:00:00Z", {
          month: "long",
          year: "numeric",
        }),
      ).toBe("January 2026");
    }
  });
  it("does not invent a current verification date when data is missing or invalid", () => {
    expect(formatPublicDate(null)).toBe("");
    expect(formatPublicDate("invalid")).toBe("");
  });
});
