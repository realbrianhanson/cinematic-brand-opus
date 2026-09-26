export type FunnelRequest =
  | { action: "get"; slug: string }
  | { action: "start"; slug: string; token: string }
  | { action: "state"; token: string }
  | {
      action: "advance";
      token: string;
      stepId: string;
      expectedVersion: number;
      requestId: string;
      answer?: string;
    };
const keys: Record<string, string[]> = {
  get: ["action", "slug"],
  start: ["action", "slug", "token"],
  state: ["action", "token"],
  advance: [
    "action",
    "token",
    "stepId",
    "answer",
    "expectedVersion",
    "requestId",
  ],
};
export function parseFunnelRequest(raw: unknown): FunnelRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid journey request.");
  const body = raw as Record<string, unknown>;
  if (
    typeof body.action !== "string" ||
    !Object.hasOwn(keys, body.action) ||
    Object.keys(body).some((key) => !keys[body.action as string].includes(key))
  )
    throw new Error("Invalid journey request.");
  if (
    ["get", "start"].includes(body.action) &&
    (typeof body.slug !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(body.slug))
  )
    throw new Error("Invalid journey address.");
  if (
    body.action !== "get" &&
    (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
  )
    throw new Error("Invalid journey session.");
  if (
    body.action === "advance" &&
    (typeof body.stepId !== "string" ||
      !/^[a-z][a-z0-9-]{0,47}$/.test(body.stepId) ||
      !Number.isSafeInteger(body.expectedVersion) ||
      (body.expectedVersion as number) < 0 ||
      typeof body.requestId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        body.requestId,
      ) ||
      (body.answer !== undefined &&
        (typeof body.answer !== "string" ||
          !/^[a-z][a-z0-9-]{0,47}$/.test(body.answer))))
  )
    throw new Error("Invalid journey answer.");
  return body as FunnelRequest;
}
