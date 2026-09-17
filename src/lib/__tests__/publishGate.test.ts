import { describe, expect, it } from "vitest";
import {
  evaluateGate,
  loadGateSettings,
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
                error: opts.settingsError ? { message: opts.settingsError } : null,
              }),
            }),
          }),
        };
      }
      // posts count chain
      const chain: any = {
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
    expect(r).toEqual({ passed: true, failures: [] });
  });

  it("fails when the daily cap count cannot be read", async () => {
    const r = await evaluateGate(
      stubClient({ countError: "timeout" }),
      goodPost,
      settings,
    );
    expect(r.passed).toBe(false);
    expect(r.failures.join(" ")).toMatch(/daily cap check failed/);
  });

  it("fails when the cap is reached", async () => {
    const r = await evaluateGate(stubClient({ count: 3 }), goodPost, settings);
    expect(r.failures).toContain("daily cap reached");
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
    expect(r.failures.join(" ")).toMatch(/not numbers/);
  });

  it("blocks low quality, lint flags and contradicted claims", async () => {
    const r = await evaluateGate(
      stubClient({ count: 0 }),
      {
        ...goodPost,
        quality_score: 70,
        lint_flags: ["em dash"],
        fact_check: {
          claims: [{}, {}],
          verified_count: 2,
          unverified_count: 0,
          contradicted_count: 1,
        },
      },
      settings,
    );
    expect(r.passed).toBe(false);
    expect(r.failures.length).toBeGreaterThanOrEqual(3);
  });

  it("skips the cap check when asked (manual publish)", async () => {
    const r = await evaluateGate(stubClient({ countError: "timeout" }), goodPost, settings, {
      ignoreDailyCap: true,
    });
    expect(r.passed).toBe(true);
  });
});
