import { describe, expect, it } from "vitest";
import {
  FIRST_BUILD_RECOVERY_TTL,
  firstBuildRecoveryKey,
  readFirstBuildRecovery,
  saveFirstBuildRecovery,
  clearFirstBuildRecovery,
  type FirstBuildSnapshot,
} from "@/lib/firstAiBuildRecovery";

const scope = "brian|https://brianhanson.com|Brian Hanson";
const now = 1_800_000_000_000;
const snapshot: FirstBuildSnapshot = {
  answers: {
    project: "inquiries",
    forWhom: "client",
    businessType: "  Garden design  ",
    audience: "Homeowners",
  },
  generatedFrom: null,
  view: "form",
};
function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("planner recovery boundary", () => {
  it("keeps partial draft text exactly, separates brands, and expires after seven days", () => {
    const store = storage();
    const saved = saveFirstBuildRecovery(store, scope, snapshot, null, now);
    expect(saved.state).toBe("saved");
    const found = readFirstBuildRecovery(store, scope, now + 1);
    expect(found.state).toBe("available");
    if (found.state === "available") expect(found.snapshot).toEqual(snapshot);
    expect(readFirstBuildRecovery(store, "another-brand", now).state).toBe(
      "empty",
    );
    expect(
      readFirstBuildRecovery(store, scope, now + FIRST_BUILD_RECOVERY_TTL)
        .state,
    ).toBe("expired");
    expect(store.getItem(firstBuildRecoveryKey(scope))).toBeNull();
  });
  it("does not overwrite another tab’s saved answers", () => {
    const store = storage();
    saveFirstBuildRecovery(store, scope, snapshot, null, now);
    const result = saveFirstBuildRecovery(
      store,
      scope,
      {
        ...snapshot,
        answers: { ...snapshot.answers, businessType: "New draft" },
      },
      null,
      now + 1,
    );
    expect(result.state).toBe("conflict");
    const found = readFirstBuildRecovery(store, scope, now + 2);
    if (found.state === "available")
      expect(found.snapshot.answers.businessType).toBe("  Garden design  ");
  });
  it.each(["{broken", "x".repeat(7000)])(
    "rejects malformed or oversized data without throwing",
    (raw) => {
      const store = storage();
      store.setItem(firstBuildRecoveryKey(scope), raw);
      expect(readFirstBuildRecovery(store, scope, now).state).toBe("invalid");
    },
  );
  it("rejects unknown versions, mismatched scope, invalid dates and contradictory plan state", () => {
    for (const change of [
      { version: 2 },
      { playbookVersion: 9 },
      { scope: "other" },
      { updatedAt: now + 300_000 },
      { expiresAt: now + FIRST_BUILD_RECOVERY_TTL * 2 },
      { snapshot: { ...snapshot, view: "plan" } },
      {
        snapshot: {
          ...snapshot,
          answers: { ...snapshot.answers, businessType: "x".repeat(121) },
        },
      },
    ]) {
      const store = storage();
      saveFirstBuildRecovery(store, scope, snapshot, null, now);
      const original = JSON.parse(store.getItem(firstBuildRecoveryKey(scope))!);
      store.setItem(
        firstBuildRecoveryKey(scope),
        JSON.stringify({ ...original, ...change }),
      );
      expect(readFirstBuildRecovery(store, scope, now).state).toBe("invalid");
    }
  });
  it("keeps the generated plan inputs separate from unfinished current edits", () => {
    const store = storage();
    const generatedFrom = {
      ...snapshot.answers,
      project: "inquiries",
      forWhom: "client",
      businessType: "Original business",
    } as const;
    const edited = {
      ...snapshot,
      generatedFrom,
      answers: { ...snapshot.answers, project: "onboarding" as const },
    };
    saveFirstBuildRecovery(store, scope, edited, null, now);
    const found = readFirstBuildRecovery(store, scope, now);
    if (found.state === "available") expect(found.snapshot).toEqual(edited);
    else throw new Error("Expected recoverable draft");
  });
  it("fails safely when browser storage is unavailable and clears only this planner’s key", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(readFirstBuildRecovery(broken, scope, now).state).toBe(
      "unavailable",
    );
    expect(
      saveFirstBuildRecovery(broken, scope, snapshot, null, now).state,
    ).toBe("unavailable");
    expect(clearFirstBuildRecovery(broken, scope)).toBe(false);
    const store = storage();
    store.setItem("unrelated", "keep me");
    saveFirstBuildRecovery(store, scope, snapshot, null, now);
    expect(clearFirstBuildRecovery(store, scope)).toBe(true);
    expect(store.getItem("unrelated")).toBe("keep me");
  });
});
