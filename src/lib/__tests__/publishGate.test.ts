import { describe, expect, it } from "vitest";
import {
  evaluateGate,
  holdReasonText,
  loadGateSettings,
  nextHoldUpdate,
  publishTimeAction,
  scheduleHoldReason,
  type GatePost,
  type GateSettings,
} from "../../../supabase/functions/_shared/publishGate";

/** Minimal stub of the Supabase client surface the gate uses. */
function stubClient(opts: {
  settings?: Record<string, unknown> | null;
  settingsError?: string;
  count?: number | null;
  countError?: string;
}) {
  return {
    from(table: string) {
      if (table === "site_settings_private") {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: opts.settings ?? null,
                error: opts.settingsError
                  ? { message: opts.settingsError }
                  : null,
              }),
            }),
          }),
        };
      }
      // posts count chain
      const chain = {
        select: () => chain,
        not: () => chain,
        in: () => chain,
        gt: async () => ({
          count: opts.count ?? null,
          error: opts.countError ? { message: opts.countError } : null,
        }),
      };
      return chain;
    },
  };
}

type Row = Record<string, string | null>;

/**
 * A posts table stub that actually applies the filters the gate sends, so the
 * daily-cap count is computed from row data rather than a canned number.
 */
function tableClient(rows: Row[]) {
  const filters: string[] = [];
  return {
    filters,
    from() {
      let current = rows;
      const chain = {
        select: () => chain,
        not: (col: string, op: string, value: unknown) => {
          filters.push(`not ${col} ${op} ${String(value)}`);
          current = current.filter((r) => r[col] !== null);
          return chain;
        },
        in: (col: string, values: string[]) => {
          filters.push(`in ${col}`);
          current = current.filter((r) => values.includes(String(r[col])));
          return chain;
        },
        eq: (col: string, value: string) => {
          filters.push(`eq ${col}`);
          current = current.filter((r) => r[col] === value);
          return chain;
        },
        gt: (col: string, value: string) => {
          filters.push(`gt ${col}`);
          current = current.filter((r) => r[col] != null && r[col]! > value);
          return chain;
        },
        then: (resolve: (v: { count: number; error: null }) => unknown) =>
          resolve({ count: current.length, error: null }),
      };
      return chain;
    },
  };
}

const goodPost: GatePost = {
  id: "p1",
  status: "draft",
  quality_score: 90,
  lint_flags: [],
  fact_check: {
    claims: [{}, {}, {}],
    verified_count: 3,
    unverified_count: 0,
    contradicted_count: 0,
  },
  opportunity_id: "o1",
};

const settings: GateSettings = {
  auto_publish_enabled: true,
  auto_publish_daily_cap: 3,
  auto_publish_min_quality: 85,
};

describe("loadGateSettings", () => {
  it("fails closed when no settings row exists", async () => {
    const s = await loadGateSettings(stubClient({ settings: null }));
    expect(s.auto_publish_enabled).toBe(false);
    expect(s.auto_publish_daily_cap).toBe(0);
  });

  it("propagates a settings read failure instead of defaulting to enabled", async () => {
    await expect(
      loadGateSettings(stubClient({ settingsError: "connection reset" })),
    ).rejects.toThrow(/connection reset/);
  });

  it("preserves explicit configured values", async () => {
    const s = await loadGateSettings(
      stubClient({
        settings: {
          auto_publish_enabled: true,
          auto_publish_daily_cap: 3,
          auto_publish_min_quality: 85,
        },
      }),
    );
    expect(s).toEqual({
      auto_publish_enabled: true,
      auto_publish_daily_cap: 3,
      auto_publish_min_quality: 85,
    });
  });
});

describe("evaluateGate", () => {
  it("passes a clean post below the daily cap", async () => {
    const r = await evaluateGate(stubClient({ count: 1 }), goodPost, settings);
    expect(r).toEqual({ passed: true, failures: [], reasons: [] });
  });

  it("fails when the daily cap count cannot be read", async () => {
    const r = await evaluateGate(
      stubClient({ countError: "timeout" }),
      goodPost,
      settings,
    );
    expect(r.passed).toBe(false);
    expect(r.reasons.map((x) => x.code)).toEqual(["daily_cap_unavailable"]);
    expect(r.failures[0]).toMatch(/Couldn't check today's publishing limit/);
  });

  it("fails when the cap is reached, in plain English", async () => {
    const r = await evaluateGate(stubClient({ count: 3 }), goodPost, settings);
    expect(r.reasons.map((x) => x.code)).toEqual(["daily_cap"]);
    expect(r.failures).toEqual([
      "Daily limit of 3 reached, will retry automatically",
    ]);
  });

  it("rejects non-numeric fact-check counts rather than comparing NaN", async () => {
    const r = await evaluateGate(
      stubClient({ count: 0 }),
      {
        ...goodPost,
        fact_check: {
          claims: [{}, {}],
          verified_count: "lots",
          unverified_count: null,
          contradicted_count: 0,
        },
      },
      settings,
    );
    expect(r.passed).toBe(false);
    expect(r.reasons.map((x) => x.code)).toEqual(["fact_check_incomplete"]);
  });

  it("blocks low quality, lint flags and contradicted claims with readable reasons", async () => {
    const r = await evaluateGate(
      stubClient({ count: 0 }),
      {
        ...goodPost,
        quality_score: 62,
        lint_flags: ["em dash"],
        fact_check: {
          claims: [{}, {}, {}, {}, {}],
          verified_count: 1,
          unverified_count: 3,
          contradicted_count: 1,
        },
      },
      settings,
    );
    expect(r.passed).toBe(false);
    expect(r.failures).toEqual([
      "Quality score 62, needs 85",
      "1 writing-style flag to fix",
      "1 claim the fact-checker marked as contradicted",
      "Only 1 claim verified, needs at least 2",
      "3 claims the fact-checker couldn't confirm, 2 allowed",
    ]);
  });

  it("explains a hand-written post that was never scored or fact-checked", async () => {
    const r = await evaluateGate(
      stubClient({ count: 0 }),
      { ...goodPost, quality_score: null, fact_check: null, lint_flags: null },
      settings,
      { ignoreDailyCap: true },
    );
    expect(r.reasons.map((x) => x.code)).toEqual([
      "quality_missing",
      "fact_check_missing",
    ]);
    expect(r.failures).toEqual([
      "Not scored for quality yet, needs 85",
      "Not fact-checked yet",
    ]);
  });

  it("names too few checkable claims", async () => {
    const r = await evaluateGate(
      stubClient({ count: 0 }),
      { ...goodPost, fact_check: { claims: [{}] } },
      settings,
      { ignoreDailyCap: true },
    );
    expect(r.failures).toEqual([
      "Fact check found only 1 checkable claim, needs at least 2",
    ]);
  });

  it("skips the cap check when asked (manual publish)", async () => {
    const r = await evaluateGate(
      stubClient({ countError: "timeout" }),
      goodPost,
      settings,
      {
        ignoreDailyCap: true,
      },
    );
    expect(r.passed).toBe(true);
  });
});

describe("daily cap counts auto-scheduling, not edits (regression)", () => {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

  it("ignores published posts whose updated_at was bumped by maintenance or edits", async () => {
    // 229 old auto-published posts touched by a maintenance update an hour
    // ago. Under the old updated_at rule they filled the cap of 3.
    const rows: Row[] = Array.from({ length: 229 }, () => ({
      status: "published",
      opportunity_id: "o",
      updated_at: hoursAgo(1),
      auto_scheduled_at: hoursAgo(72),
      published_at: hoursAgo(71),
    }));
    const client = tableClient(rows);
    const r = await evaluateGate(client, goodPost, settings);
    expect(r).toEqual({ passed: true, failures: [], reasons: [] });
    expect(client.filters).toContain("gt auto_scheduled_at");
    expect(client.filters.join(" ")).not.toMatch(/updated_at/);
  });

  it("still counts posts auto-scheduled in the last 24 hours, published or not", async () => {
    const rows: Row[] = [
      { status: "published", auto_scheduled_at: hoursAgo(20) },
      { status: "scheduled", auto_scheduled_at: hoursAgo(2) },
      { status: "published", auto_scheduled_at: hoursAgo(1) },
      // Hand-published and hand-scheduled posts never consume the auto cap.
      { status: "published", auto_scheduled_at: null },
      { status: "scheduled", auto_scheduled_at: null },
    ];
    const r = await evaluateGate(tableClient(rows), goodPost, settings);
    expect(r.reasons.map((x) => x.code)).toEqual(["daily_cap"]);
  });

  it("frees the slot once the auto-schedule is older than 24 hours", async () => {
    const rows: Row[] = [
      { status: "published", auto_scheduled_at: hoursAgo(25) },
      { status: "published", auto_scheduled_at: hoursAgo(23) },
      { status: "published", auto_scheduled_at: hoursAgo(22) },
    ];
    const r = await evaluateGate(tableClient(rows), goodPost, settings);
    expect(r.passed).toBe(true);
  });
});

describe("hold reasons", () => {
  it("joins reasons into one plain-English sentence list", () => {
    expect(
      holdReasonText([
        { code: "quality_low", message: "Quality score 62, needs 85" },
        {
          code: "too_many_unverified",
          message: "3 claims the fact-checker couldn't confirm, 2 allowed",
        },
      ]),
    ).toBe(
      "Quality score 62, needs 85; 3 claims the fact-checker couldn't confirm, 2 allowed",
    );
  });

  it("maps the scheduling RPC's reasons to sentences", () => {
    expect(scheduleHoldReason("daily cap reached", 3)).toEqual({
      code: "daily_cap",
      message: "Daily limit of 3 reached, will retry automatically",
    });
    expect(scheduleHoldReason("fact-check failed", 3)?.code).toBe(
      "fact_check_failed",
    );
    expect(
      scheduleHoldReason("quality or fact-check incomplete", 3)?.code,
    ).toBe("fact_check_incomplete");
    expect(scheduleHoldReason("auto-publish disabled", 3)?.code).toBe(
      "auto_publish_disabled",
    );
    expect(scheduleHoldReason("not a pipeline draft", 3)).toBeNull();
    expect(scheduleHoldReason("something new", 3)?.code).toBe("gate_error");
  });

  it("writes a hold only when the reason changes, keeping the first held time", () => {
    const now = "2026-09-23T12:00:00.000Z";
    expect(
      nextHoldUpdate({ held_reason: null, held_at: null }, "A", now),
    ).toEqual({
      held_reason: "A",
      held_at: now,
    });
    expect(
      nextHoldUpdate(
        { held_reason: "A", held_at: "2026-09-22T00:00:00.000Z" },
        "A",
        now,
      ),
    ).toBeNull();
    expect(
      nextHoldUpdate(
        { held_reason: "A", held_at: "2026-09-22T00:00:00.000Z" },
        "B",
        now,
      ),
    ).toEqual({ held_reason: "B", held_at: "2026-09-22T00:00:00.000Z" });
  });
});

describe("publish-time rule", () => {
  const base = {
    publish_override: false,
    auto_scheduled_at: null,
    schedule_checked_at: null,
  };
  it("publishes a hand-scheduled post that passed the gate when Brian scheduled it", () => {
    expect(
      publishTimeAction({
        ...base,
        schedule_checked_at: "2026-09-23T10:00:00Z",
      }),
    ).toBe("publish");
  });
  it("publishes a post Brian overrode, even if it was auto-scheduled", () => {
    expect(
      publishTimeAction({
        ...base,
        publish_override: true,
        auto_scheduled_at: "2026-09-23T10:00:00Z",
      }),
    ).toBe("publish");
  });
  it("re-gates auto-scheduled posts at publish time", () => {
    expect(
      publishTimeAction({ ...base, auto_scheduled_at: "2026-09-23T10:00:00Z" }),
    ).toBe("gate");
  });
  it("gates a post scheduled without any check (older editor) so a hold is recorded", () => {
    expect(publishTimeAction(base)).toBe("gate");
  });
});
