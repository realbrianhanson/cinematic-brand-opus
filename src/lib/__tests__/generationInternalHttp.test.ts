import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const h = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.97.0", () => ({
  createClient: h.client,
}));
let handle: (request: Request) => Promise<Response>;
let dispatch: (
  client: unknown,
  url: string,
  secret: string,
  payload: unknown,
  setup: boolean,
) => void;
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (fn: typeof handle) => {
      handle = fn;
    },
    env: { get: () => "configured" },
  });
  const path = "../../../supabase/functions/generate-content/index.ts";
  const module = await import(path);
  dispatch = module.dispatchJobRequest;
});
beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: () => "configured" } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const request = (header: string, bearer = "configured") =>
  new Request("https://example.test/generate-content", {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, [header]: "true" },
    body: JSON.stringify({
      job_id: "j",
      current_index: 0,
      work_queue: [],
      pages: [],
    }),
  });
describe("internal generation lifetime", () => {
  it.each(["x-job-setup", "x-job-step"])(
    "acknowledges %s before long work finishes and retains its lifetime",
    async (header) => {
      let release!: (value: { data: null; error: null }) => void;
      const blocked = new Promise<{ data: null; error: null }>((resolve) => {
        release = resolve;
      });
      const chain = {
        select: () => chain,
        update: () => chain,
        eq: () => chain,
        maybeSingle: () => chain,
        then: blocked.then.bind(blocked),
      };
      h.client.mockReturnValue({ from: () => chain });
      const background: Promise<unknown>[] = [];
      vi.stubGlobal("EdgeRuntime", {
        waitUntil: (promise: Promise<unknown>) => {
          background.push(promise);
        },
      });
      const pending = handle(request(header));
      try {
        const response = await Promise.race([
          pending,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
        ]);
        expect(response?.status).toBe(202);
        expect(background).toHaveLength(1);
      } finally {
        release({ data: null, error: null });
        await pending;
        await Promise.all(background);
      }
    },
  );
  it("still rejects untrusted internal flags without starting background work", async () => {
    const waitUntil = vi.fn();
    vi.stubGlobal("EdgeRuntime", { waitUntil });
    expect((await handle(request("x-job-step", "not-service"))).status).toBe(
      403,
    );
    expect(waitUntil).not.toHaveBeenCalled();
  });
});

describe("generation dispatch database boundary", () => {
  it.each(["running", "cancelled", "completed", "resumed", "progressed"])(
    "preserves %s state through an actual delayed HTTP failure",
    async (state) => {
      const initial = {
        id: "job-1",
        status: "running",
        updated_at: "2026-09-25T12:00:00Z",
        completed_count: 2,
      };
      let row = { ...initial };
      let writes = 0;
      const client = {
        from: () => {
          let patch: Record<string, unknown> | null = null;
          const filters: [string, unknown][] = [];
          const chain = {
            select: () => chain,
            eq: (key: string, value: unknown) => {
              filters.push([key, value]);
              return chain;
            },
            abortSignal: () => chain,
            maybeSingle: () => chain,
            update: (value: Record<string, unknown>) => {
              patch = value;
              return chain;
            },
            then: (resolve: (result: unknown) => unknown) =>
              Promise.resolve().then(() => {
                if (
                  patch &&
                  filters.every(
                    ([key, value]) => row[key as keyof typeof row] === value,
                  )
                ) {
                  row = { ...row, ...patch };
                  writes++;
                }
                return resolve({ data: { ...row }, error: null });
              }),
          };
          return chain;
        },
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          if (state === "cancelled" || state === "completed")
            row.status = state;
          if (state === "resumed" || state === "progressed")
            row.updated_at = "2026-09-25T12:01:00Z";
          if (state === "progressed") row.completed_count = 3;
          return new Response(null, { status: 503 });
        }),
      );
      const background: Promise<unknown>[] = [];
      vi.stubGlobal("EdgeRuntime", {
        waitUntil: (promise: Promise<unknown>) => background.push(promise),
      });
      dispatch(
        client,
        "https://example.test",
        "synthetic-secret",
        { job_id: "job-1", current_index: 2 },
        false,
      );
      await Promise.all(background);
      expect(writes).toBe(state === "running" ? 1 : 0);
      expect(row.status).toBe(
        state === "running"
          ? "stalled"
          : state === "cancelled" || state === "completed"
            ? state
            : "running",
      );
    },
  );
});
