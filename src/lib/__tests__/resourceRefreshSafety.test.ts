import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  client: vi.fn(),
  fetch: vi.fn(),
  quality: 90,
  research: "available",
  conflict: "",
  updateError: false,
  initial: {} as Record<string, unknown>,
  stored: {} as Record<string, unknown>,
  writes: [] as {
    payload: Record<string, unknown>;
    filters: [string, unknown][];
  }[],
  logs: [] as Record<string, unknown>[],
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.97.0", () => ({
  createClient: h.client,
}));
vi.mock("../../../supabase/functions/_shared/cronAuth.ts", () => ({
  authorizeCronOrAdmin: h.authorize,
}));
vi.mock("../../../supabase/functions/_shared/voice.ts", () => ({
  loadVoiceConfig: async () => ({}),
  formatVoiceBlock: () => "",
  refineWithVoice: async ({ draftJson }: { draftJson: unknown }) => ({
    refined: draftJson,
    tokensUsed: 0,
    remainingViolations: [],
    errors: [],
  }),
  scoreContent: () => ({ score: h.quality }),
  applyTitleLint: (score: unknown) => score,
  composeTitle: (title: string) => title,
  writeMetaDescription: async () => "Updated resource overview",
  shortAudienceLabel: () => "business owners",
}));

let handle: (request: Request) => Promise<Response>;
const originalContent = {
  intro: "The original published resource",
  sections: [],
};
function client() {
  return {
    from(table: string) {
      let payload: Record<string, unknown> | undefined;
      const filters: [string, unknown][] = [];
      const result = () => {
        if (table === "site_settings")
          return { data: { site_name: "Example" }, error: null };
        if (table === "generation_logs") {
          if (payload) h.logs.push(payload);
          return { data: null, error: null };
        }
        if (payload) {
          h.writes.push({ payload, filters });
          if (h.updateError)
            return { data: null, error: { message: "write unavailable" } };
          const matches =
            h.conflict !== "deleted" &&
            filters.every(([key, value]) => h.stored[key] === value);
          if (matches) h.stored = { ...h.stored, ...payload };
          return { data: matches ? { id: h.stored.id } : null, error: null };
        }
        return { data: [{ ...h.initial }], error: null };
      };
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        in: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        update: (value: Record<string, unknown>) => {
          payload = value;
          return query;
        },
        insert: (value: Record<string, unknown>) => {
          payload = value;
          return query;
        },
        single: async () => result(),
        maybeSingle: async () => result(),
        then: <T>(resolve: (value: ReturnType<typeof result>) => T) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
}

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (fn: typeof handle) => {
      handle = fn;
    },
    env: { get: () => "configured" },
  });
  const path = "../../../supabase/functions/refresh-stale-content/index.ts";
  await import(path);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  vi.stubGlobal("Deno", {
    env: {
      get: (name: string) =>
        name === "FIRECRAWL_API_KEY" ? undefined : "configured",
    },
  });
  h.authorize.mockResolvedValue({ ok: true });
  h.client.mockImplementation(client);
  h.quality = 90;
  h.research = "available";
  h.conflict = "";
  h.updateError = false;
  h.writes = [];
  h.logs = [];
  h.initial = {
    id: "resource",
    slug: "workflow",
    title: "Useful workflow",
    status: "published",
    updated_at: "2026-09-24T00:00:00Z",
    content_json: originalContent,
    refresh_count: 1,
    niches: { name: "Business", context: {} },
    content_schemas: { name: "Guides", schema_definition: {} },
  };
  h.stored = structuredClone(h.initial);
  h.fetch.mockImplementation(async (input: string) => {
    if (input.includes("perplexity.ai")) {
      if (h.research === "failed")
        return new Response("unavailable", { status: 503 });
      return Response.json({
        choices: [
          {
            message: {
              content:
                h.research === "empty"
                  ? ""
                  : "Current source material about the tool",
            },
          },
        ],
        citations:
          h.research === "unsourced" ? [] : ["https://provider.test/docs"],
      });
    }
    if (input.includes("ai.gateway.lovable.dev")) {
      if (h.conflict === "version")
        h.stored.updated_at = "2026-09-25T00:00:00Z";
      if (h.conflict === "status") h.stored.status = "archived";
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intro: "Refreshed source material",
                sections: [],
              }),
            },
          },
        ],
      });
    }
    throw new Error(`Unexpected provider request: ${input}`);
  });
  vi.stubGlobal("fetch", h.fetch);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  h.fetch.mockReset();
});
async function refresh() {
  const pending = handle(
    new Request("https://example.test/refresh-stale-content", {
      method: "POST",
      body: JSON.stringify({ page_id: "resource" }),
    }),
  );
  await vi.runAllTimersAsync();
  const response = await pending;
  return { status: response.status, body: await response.json() };
}

describe("published resource refresh safety", () => {
  it("updates only the original version and status after available research and a passing quality score", async () => {
    const result = await refresh();
    expect(result.body).toMatchObject({ refreshed: 1, failed: 0 });
    expect(h.writes[0].filters).toContainEqual([
      "updated_at",
      h.initial.updated_at,
    ]);
    expect(h.writes[0].filters).toContainEqual(["status", "published"]);
    expect(h.stored.content_json).not.toEqual(originalContent);
  });
  it("requires evidence for retirement claims instead of declaring a fixed list of tools defunct", async () => {
    await refresh();
    const writingCall = h.fetch.mock.calls.find(([url]) =>
      String(url).includes("ai.gateway.lovable.dev"),
    );
    const body = JSON.parse(writingCall?.[1]?.body as string);
    const prompt = body.messages
      .map((message: { content: string }) => message.content)
      .join("\n");
    expect(prompt).not.toContain("known defunct/outdated tools");
    expect(prompt).not.toContain("use FEWER items");
    expect(prompt).not.toContain("Every tool/platform you mention MUST appear");
    expect(prompt).toContain("Only add or replace tools");
    expect(prompt).toContain(
      "Preserve existing entries when research does not cover them",
    );
    expect(prompt).not.toContain("VERIFIED REAL-TIME RESEARCH DATA");
    expect(prompt).toContain(
      "without a linked current source supporting that status",
    );
    expect(prompt).toContain("not been independently fact-checked");
  });
  it.each(["failed", "empty", "unsourced"])(
    "keeps published content when research is %s without calling the writing provider",
    async (research) => {
      h.research = research;
      const result = await refresh();
      expect(result.body).toMatchObject({ refreshed: 0, failed: 1, pages: [] });
      expect(h.writes).toEqual([]);
      expect(h.stored.content_json).toEqual(originalContent);
      expect(
        h.fetch.mock.calls.every(([url]) =>
          String(url).includes("perplexity.ai"),
        ),
      ).toBe(true);
      expect(h.logs).toContainEqual(
        expect.objectContaining({
          status: "failed",
          error_message: expect.stringMatching(/research/i),
        }),
      );
    },
  );
  it.each(["version", "status", "deleted"])(
    "does not report success or overwrite after a concurrent %s change",
    async (conflict) => {
      h.conflict = conflict;
      const result = await refresh();
      expect(result.body).toMatchObject({ refreshed: 0, failed: 1, pages: [] });
      expect(h.stored.content_json).toEqual(originalContent);
      expect(h.logs.some((log) => log.status === "refreshed")).toBe(false);
    },
  );
  it("does not report a failed database write as refreshed", async () => {
    h.updateError = true;
    expect((await refresh()).body).toMatchObject({ refreshed: 0, failed: 1 });
    expect(h.stored.content_json).toEqual(originalContent);
  });
  it("keeps a published page when replacement quality is below the existing publishing threshold", async () => {
    h.quality = 74;
    expect((await refresh()).body).toMatchObject({ refreshed: 0, failed: 1 });
    expect(h.writes).toEqual([]);
  });
  it.each([Number.NaN, 101])(
    "rejects an invalid replacement quality score (%s)",
    async (score) => {
      h.quality = score;
      expect((await refresh()).body).toMatchObject({ refreshed: 0, failed: 1 });
      expect(h.writes).toEqual([]);
    },
  );
  it("does not call providers when the original version is missing", async () => {
    delete h.initial.updated_at;
    expect((await refresh()).body).toMatchObject({ refreshed: 0, failed: 1 });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.writes).toEqual([]);
  });
  it("does not reuse a historical publish override to approve a new low-quality replacement", async () => {
    h.initial.publish_override = true;
    h.quality = 74;
    expect((await refresh()).body).toMatchObject({ refreshed: 0, failed: 1 });
    expect(h.writes).toEqual([]);
  });
  it("still permits an explicitly refreshed draft when live research is unavailable", async () => {
    h.initial.status = "draft";
    h.stored.status = "draft";
    h.research = "failed";
    expect((await refresh()).body).toMatchObject({ refreshed: 1, failed: 0 });
    expect(h.stored.status).toBe("draft");
  });
});
