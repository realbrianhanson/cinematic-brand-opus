import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasItemsFetchedSince,
  unpickedItemIds,
} from "../../../supabase/functions/cluster-opportunities/selection";
import {
  classifyAiFailure,
  coveredByExistingTitle,
  creditsExhaustedBody,
  freshnessHours,
  staleSourcesReason,
} from "../../../supabase/functions/draft-from-opportunity/preflight";
import {
  PAID_SOURCE_MIN_INTERVAL_HOURS,
  paidSourceDue,
} from "../../../supabase/functions/poll-sources/schedule";
import {
  COVER_CACHE_CONTROL,
  generateFeaturedImage,
  prepareCoverUpload,
} from "../../../supabase/functions/_shared/featuredImage";
import {
  AI_CREDITS_EXHAUSTED,
  isCreditsExhausted,
} from "../../../supabase/functions/daily-content-run/credits";

const HOUR = 3600_000;
const NOW = Date.parse("2026-09-23T12:00:00Z");
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString();

afterEach(() => vi.unstubAllGlobals());

describe("cluster-opportunities: skip the LLM when nothing is new", () => {
  it("runs when an item arrived after the last clustered item", () => {
    expect(
      hasItemsFetchedSince(
        [{ fetched_at: iso(5) }, { fetched_at: iso(0.5) }],
        iso(1),
      ),
    ).toBe(true);
  });
  it("skips when every candidate was already available last run", () => {
    expect(
      hasItemsFetchedSince(
        [{ fetched_at: iso(5) }, { fetched_at: iso(2) }],
        iso(1),
      ),
    ).toBe(false);
  });
  it("runs on the very first pass, when nothing was clustered yet", () => {
    expect(hasItemsFetchedSince([{ fetched_at: iso(5) }], null)).toBe(true);
  });
  it("skips an empty candidate list", () => {
    expect(hasItemsFetchedSince([], null)).toBe(false);
  });
});

describe("cluster-opportunities: retire candidates the LLM saw but did not pick", () => {
  const clusters = [
    [{ id: "a" }, { id: "b" }],
    [{ id: "c" }],
    [{ id: "d" }, { id: "e" }],
  ];
  it("returns every item of every unpicked cluster", () => {
    expect(unpickedItemIds(clusters, [1])).toEqual(["a", "b", "d", "e"]);
  });
  it("returns nothing when every cluster was picked", () => {
    expect(unpickedItemIds(clusters, [0, 1, 2])).toEqual([]);
  });
});

describe("draft-from-opportunity: freshness before the draft", () => {
  it("measures hours since the newest source", () => {
    expect(freshnessHours([iso(100), iso(10), null], NOW)).toBe(10);
  });
  it("treats missing dates as unknown (very old)", () => {
    expect(freshnessHours([null], NOW)).toBe(999);
    expect(freshnessHours([], NOW)).toBe(999);
  });
  it("rejects stale news but keeps evergreen briefs", () => {
    expect(staleSourcesReason(120, false)).toMatch(/sources too old \(120h/);
    expect(staleSourcesReason(120, true)).toBeNull();
    expect(staleSourcesReason(20, false)).toBeNull();
  });
});

describe("draft-from-opportunity: cheap originality check", () => {
  it("catches a keyword an existing title already targets", () => {
    const hit = coveredByExistingTitle(
      "best AI tools for small business marketing",
      [
        "Unrelated post",
        "The Best AI Tools for Small Business Marketing in 2026",
      ],
    );
    expect(hit?.title).toMatch(/Best AI Tools/);
  });
  it("normalizes simple plurals", () => {
    expect(
      coveredByExistingTitle("email automations for small businesses", [
        "Email automation for a small business",
      ]),
    ).not.toBeNull();
  });
  it("allows a related but different angle", () => {
    expect(
      coveredByExistingTitle("AI receptionist for dental practices", [
        "How dentists can use an AI receptionist",
      ]),
    ).toBeNull();
  });
  it("never blocks on a generic two-word keyword", () => {
    expect(coveredByExistingTitle("AI tools", ["AI tools"])).toBeNull();
    expect(coveredByExistingTitle(null, ["AI tools"])).toBeNull();
  });
});

describe("402 is a stop signal", () => {
  it("classifies gateway failures", () => {
    expect(classifyAiFailure(402)).toBe("credits");
    expect(classifyAiFailure(429)).toBe("retryable");
    expect(classifyAiFailure(503)).toBe("retryable");
    expect(classifyAiFailure(400)).toBe("terminal");
  });
  it("returns a body daily-content-run recognizes as credits exhausted", () => {
    const body = creditsExhaustedBody("Not enough credits");
    expect(body.stopped_reason).toBe(AI_CREDITS_EXHAUSTED);
    expect(isCreditsExhausted({ status: 402, data: body })).toBe(true);
  });
});

describe("poll-sources: paid sources are rate limited", () => {
  it("always polls free sources", () => {
    expect(paidSourceDue("rss", iso(0.1), NOW)).toBe(true);
  });
  it("polls a paid source that was never polled", () => {
    expect(paidSourceDue("perplexity_topic", null, NOW)).toBe(true);
  });
  it("skips a paid source polled recently", () => {
    expect(paidSourceDue("perplexity_topic", iso(0.5), NOW)).toBe(false);
  });
  it("polls a paid source again once the interval has passed", () => {
    expect(
      paidSourceDue(
        "perplexity_topic",
        iso(PAID_SOURCE_MIN_INTERVAL_HOURS),
        NOW,
      ),
    ).toBe(true);
    expect(PAID_SOURCE_MIN_INTERVAL_HOURS).toBeGreaterThanOrEqual(6);
    expect(PAID_SOURCE_MIN_INTERVAL_HOURS).toBeLessThanOrEqual(12);
  });
  it("polls when the stored timestamp is unreadable", () => {
    expect(paidSourceDue("perplexity_topic", "not a date", NOW)).toBe(true);
  });
});

describe("featured image upload", () => {
  const png = new Uint8Array(1000).fill(7);
  it("uses a smaller re-encoded cover", async () => {
    const out = await prepareCoverUpload(png, "png", async () => ({
      bytes: new Uint8Array(100),
      contentType: "image/jpeg",
      ext: "jpg",
    }));
    expect(out.contentType).toBe("image/jpeg");
    expect(out.ext).toBe("jpg");
    expect(out.bytes.length).toBe(100);
  });
  it("keeps the original when re-encoding fails or does not help", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = await prepareCoverUpload(png, "png", async () => {
      throw new Error("wasm unavailable");
    });
    expect(failed).toEqual({
      bytes: png,
      contentType: "image/png",
      ext: "png",
    });
    const bigger = await prepareCoverUpload(png, "png", async () => ({
      bytes: new Uint8Array(5000),
      contentType: "image/jpeg",
      ext: "jpg",
    }));
    expect(bigger.contentType).toBe("image/png");
    const none = await prepareCoverUpload(png, "jpeg", async () => null);
    expect(none).toEqual({ bytes: png, contentType: "image/jpeg", ext: "jpg" });
  });

  it("uploads the compressed cover with a one-year cache", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    type Query = {
      select: () => Query;
      not: () => Query;
      order: () => Query;
      limit: () => Promise<{ data: never[]; error: null }>;
    };
    const query: Query = {
      select: () => query,
      not: () => query,
      order: () => query,
      limit: async () => ({ data: [], error: null }),
    };
    const db = {
      from: () => query,
      storage: {
        from: () => ({
          upload,
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://x.supabase.co/${path}` },
          }),
        }),
      },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            choices: [
              {
                message: {
                  images: [
                    { image_url: { url: "data:image/png;base64,aGVsbG8=" } },
                  ],
                },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    approved: true,
                    alt: "A brass key resting on an open ledger",
                  }),
                },
              },
            ],
          }),
        ),
    );
    const result = await generateFeaturedImage(
      "Title",
      "Context",
      "test",
      db,
      undefined,
      {
        transcode: async () => ({
          bytes: new Uint8Array(2),
          contentType: "image/jpeg",
          ext: "jpg",
        }),
      },
    );
    expect(result?.url).toMatch(
      /^https:\/\/x\.supabase\.co\/ai-generated\/.+\.jpg$/,
    );
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/\.jpg$/),
      expect.any(Uint8Array),
      expect.objectContaining({
        contentType: "image/jpeg",
        cacheControl: COVER_CACHE_CONTROL,
        upsert: false,
      }),
    );
    expect(Number(COVER_CACHE_CONTROL)).toBeGreaterThanOrEqual(31_536_000);
  });
});
