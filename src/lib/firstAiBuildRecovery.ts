import { z } from "zod";
import {
  firstBuildInputSchema,
  type FirstBuildInput,
} from "@/lib/firstAiBuild";

export const FIRST_BUILD_RECOVERY_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_RECORD_LENGTH = 6000;
// In-progress text can be incomplete or invalid for generation. Keep it literal
// and bounded; the full input schema still gates creation of a usable plan.
const draftContext = z.string().max(120);
const answersSchema = z
  .object({
    project: z.union([firstBuildInputSchema.shape.project, z.literal("")]),
    forWhom: z.union([firstBuildInputSchema.shape.forWhom, z.literal("")]),
    businessType: draftContext,
    audience: draftContext,
  })
  .strict();
const snapshotSchema = z
  .object({
    answers: answersSchema,
    generatedFrom: firstBuildInputSchema.strict().nullable(),
    view: z.enum(["form", "plan"]),
  })
  .strict()
  .refine((value) => {
    if (value.view !== "plan") return true;
    const input = firstBuildInputSchema.safeParse(value.answers);
    return (
      input.success &&
      value.generatedFrom !== null &&
      JSON.stringify(input.data) === JSON.stringify(value.generatedFrom)
    );
  });
const recordSchema = z
  .object({
    version: z.literal(1),
    playbookVersion: z.literal(1),
    scope: z.string().min(1).max(1000),
    updatedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
    snapshot: snapshotSchema,
  })
  .strict();
export type FirstBuildAnswers = z.infer<typeof answersSchema>;
export interface FirstBuildSnapshot {
  answers: FirstBuildAnswers;
  generatedFrom: FirstBuildInput | null;
  view: "form" | "plan";
}
export type RecoveryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
export const emptyFirstBuildSnapshot = (): FirstBuildSnapshot => ({
  answers: { project: "", forWhom: "", businessType: "", audience: "" },
  generatedFrom: null,
  view: "form",
});
export const firstBuildRecoveryKey = (scope: string) =>
  `first-ai-build:recovery:v1:${encodeURIComponent(scope)}`;
export type RecoveryRead =
  | { state: "available"; snapshot: FirstBuildSnapshot; raw: string }
  | { state: "empty" | "expired" | "invalid" | "unavailable" };

export function readFirstBuildRecovery(
  storage: RecoveryStorage,
  scope: string,
  now = Date.now(),
): RecoveryRead {
  try {
    const raw = storage.getItem(firstBuildRecoveryKey(scope));
    if (raw === null) return { state: "empty" };
    if (raw.length > MAX_RECORD_LENGTH) return { state: "invalid" };
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return { state: "invalid" };
    }
    const parsed = recordSchema.safeParse(decoded);
    if (
      !parsed.success ||
      parsed.data.scope !== scope ||
      parsed.data.updatedAt > now + 60_000 ||
      parsed.data.expiresAt - parsed.data.updatedAt !== FIRST_BUILD_RECOVERY_TTL
    )
      return { state: "invalid" };
    if (parsed.data.expiresAt <= now) {
      storage.removeItem(firstBuildRecoveryKey(scope));
      return { state: "expired" };
    }
    return { state: "available", snapshot: parsed.data.snapshot, raw };
  } catch {
    return { state: "unavailable" };
  }
}

export function saveFirstBuildRecovery(
  storage: RecoveryStorage,
  scope: string,
  snapshot: FirstBuildSnapshot,
  expectedRaw: string | null,
  now = Date.now(),
): { state: "saved"; raw: string } | { state: "conflict" | "unavailable" } {
  try {
    const record = recordSchema.parse({
      version: 1,
      playbookVersion: 1,
      scope,
      updatedAt: now,
      expiresAt: now + FIRST_BUILD_RECOVERY_TTL,
      snapshot,
    });
    const raw = JSON.stringify(record);
    if (raw.length > MAX_RECORD_LENGTH) return { state: "unavailable" };
    if (storage.getItem(firstBuildRecoveryKey(scope)) !== expectedRaw)
      return { state: "conflict" };
    storage.setItem(firstBuildRecoveryKey(scope), raw);
    return { state: "saved", raw };
  } catch {
    return { state: "unavailable" };
  }
}

export function clearFirstBuildRecovery(
  storage: RecoveryStorage,
  scope: string,
): boolean {
  try {
    storage.removeItem(firstBuildRecoveryKey(scope));
    return true;
  } catch {
    return false;
  }
}
