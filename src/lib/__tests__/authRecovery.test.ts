import { describe, expect, it } from "vitest";
import { readRecoveryHint } from "../authRecovery";

describe("password recovery link parsing", () => {
  it("detects an implicit-flow recovery link", () => {
    expect(
      readRecoveryHint(
        "https://site.test/admin/reset-password#access_token=abc&refresh_token=def&type=recovery",
      ),
    ).toEqual({ kind: "recovery" });
  });
  it("reports an expired or invalid link without echoing provider text", () => {
    expect(
      readRecoveryHint(
        "https://site.test/admin/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      ),
    ).toEqual({ kind: "error", code: "otp_expired" });
    expect(
      readRecoveryHint(
        "https://site.test/admin/reset-password?error=server_error&error_description=%3Cb%3Ex%3C%2Fb%3E",
      ),
    ).toEqual({ kind: "error", code: "server_error" });
  });
  it("treats ordinary URLs and junk as no hint", () => {
    expect(readRecoveryHint("https://site.test/admin/login")).toEqual({
      kind: "none",
    });
    expect(readRecoveryHint("not a url")).toEqual({ kind: "none" });
    expect(
      readRecoveryHint("https://site.test/#access_token=abc&type=signup"),
    ).toEqual({ kind: "none" });
  });
});
