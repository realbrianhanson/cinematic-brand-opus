import { describe, it, expect } from "vitest";
import { scheduledInstant, zonedInput } from "../scheduleTime";
describe("publishing schedule timezones", () => {
  it.each([
    ["2026-01-10T09:00", "America/New_York", "2026-01-10T14:00:00.000Z"],
    ["2026-07-10T09:00", "America/New_York", "2026-07-10T13:00:00.000Z"],
    ["2026-07-10T09:00", "Asia/Kolkata", "2026-07-10T03:30:00.000Z"],
    ["2026-07-10T09:00", "Pacific/Auckland", "2026-07-09T21:00:00.000Z"],
  ])(
    "round-trips %s in %s independently of the browser timezone",
    (local, zone, utc) => {
      expect(scheduledInstant(local, zone)).toBe(utc);
      expect(zonedInput(utc, zone)).toBe(local);
    },
  );
  it("rejects the spring DST gap", () =>
    expect(() =>
      scheduledInstant("2026-03-08T02:30", "America/New_York"),
    ).toThrow(/does not exist/));
  it("rejects the ambiguous autumn DST overlap", () =>
    expect(() =>
      scheduledInstant("2026-11-01T01:30", "America/New_York"),
    ).toThrow(/twice/));
  it("rejects impossible calendar dates", () =>
    expect(() => scheduledInstant("2026-02-30T09:00", "UTC")).toThrow());
});
