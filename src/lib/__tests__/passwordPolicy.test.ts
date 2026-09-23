import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordProblems,
} from "../passwordPolicy";

describe("admin password policy", () => {
  it("accepts a long mixed password", () => {
    expect(passwordProblems("Harbor-Lantern-2026")).toEqual([]);
  });
  it("accepts a long passphrase without symbols", () => {
    expect(passwordProblems("quiet orange harbor lantern")).toEqual([]);
  });
  it("rejects short passwords with the minimum in the message", () => {
    expect(passwordProblems("Ab1!xyz")).toContain(
      `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  });
  it("rejects passwords the auth server would truncate", () => {
    expect(passwordProblems("Aa1!".repeat(20))).toContain(
      `Use no more than ${PASSWORD_MAX_LENGTH} characters.`,
    );
  });
  it("requires variety for shorter passwords", () => {
    expect(passwordProblems("abcdefghijkl")).toContain(
      "Mix at least three of: lowercase, uppercase, numbers, symbols — or use 16+ characters.",
    );
  });
  it("rejects repeated and common passwords", () => {
    expect(passwordProblems("aaaaaaaaaaaaaaaa")).toContain(
      "Avoid repeating the same character.",
    );
    expect(passwordProblems("Password123!")).toContain(
      "This password is too common.",
    );
  });
  it("rejects passwords containing the account email name", () => {
    expect(
      passwordProblems("Brian-Secure-2026", { email: "brian@example.com" }),
    ).toContain("Don't include your email name in the password.");
  });
  it("rejects reusing the current password", () => {
    expect(
      passwordProblems("Harbor-Lantern-2026", {
        current: "Harbor-Lantern-2026",
      }),
    ).toContain("Choose a password different from your current one.");
  });
});

describe("password update error messages", () => {
  it("maps known auth codes to plain language", async () => {
    const { describePasswordUpdateError } = await import("../passwordPolicy");
    expect(describePasswordUpdateError({ code: "same_password" })).toMatch(
      /different from your current/,
    );
    expect(
      describePasswordUpdateError({
        code: "weak_password",
        reasons: ["pwned"],
      }),
    ).toMatch(/known data breach/);
    expect(
      describePasswordUpdateError({ code: "reauthentication_needed" }),
    ).toMatch(/sign in again/i);
    expect(describePasswordUpdateError(null)).toBe(
      "Unable to update the password. Try again.",
    );
  });
});
