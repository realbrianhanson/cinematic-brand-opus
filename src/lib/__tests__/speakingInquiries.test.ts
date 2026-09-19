import { describe, expect, it } from "vitest";
import {
  parseSpeakingInquiry,
  speakingDatabaseError,
  speakingHash,
} from "../../../supabase/functions/_shared/speakingInquiries";

const body = {
  request_id: "10000000-0000-4000-8000-000000000001",
  name: "  Alex Lee  ",
  email: " Alex@Example.com ",
  event_name: "Founders gathering",
};
describe("speaking inquiry validation", () => {
  it("normalizes a bounded request with portable defaults", () => {
    expect(parseSpeakingInquiry(body)).toEqual({
      request_id: body.request_id,
      name: "Alex Lee",
      email: "alex@example.com",
      event_name: body.event_name,
      event_date: "",
      event_format: "undecided",
      audience: "",
      message: "",
    });
  });
  it("rejects invalid identities, email headers and missing or oversized fields", () => {
    for (const patch of [
      { request_id: "not-a-uuid" },
      { name: " " },
      { email: "a@example.com\r\nBcc: bad@example.com" },
      { email: "wrong" },
      { event_name: "a".repeat(161) },
      { audience: "a".repeat(301) },
      { event_format: "fax" },
      { message: "a".repeat(3001) },
      { message: "bad\u0000input" },
      { name: 12 },
    ])
      expect(() => parseSpeakingInquiry({ ...body, ...patch })).toThrow();
  });
  it("preserves plain-text content including safe line breaks without interpreting HTML", () => {
    expect(
      parseSpeakingInquiry({
        ...body,
        message: "First line\n<script>alert(1)</script>",
      }).message,
    ).toBe("First line\n<script>alert(1)</script>");
  });
  it("hashes normalized requests deterministically without storing raw rate-limit keys", async () => {
    const first = parseSpeakingInquiry(body);
    const second = parseSpeakingInquiry({
      ...body,
      name: "Alex Lee",
      email: "alex@example.com",
    });
    expect(await speakingHash(JSON.stringify(first))).toBe(
      await speakingHash(JSON.stringify(second)),
    );
    expect(await speakingHash(first.email)).toMatch(/^[a-f0-9]{64}$/);
  });
  it("only returns safe business errors to visitors", () => {
    expect(speakingDatabaseError("speaking_request_mismatch").status).toBe(409);
    expect(speakingDatabaseError("speaking_inquiries_disabled").status).toBe(
      503,
    );
    expect(
      speakingDatabaseError("secret database detail").message,
    ).not.toContain("secret");
  });
});
