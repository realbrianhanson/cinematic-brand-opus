import { describe, expect, it } from "vitest";
import { refreshOutcome, indexingOutcome } from "../adminOutcomes";
import {
  validateIndexNowUrls,
  indexNowReceipt,
} from "../../../supabase/functions/_shared/indexnow";
describe("truthful admin outcomes", () => {
  it("does not hide partial refresh failures or protected pages", () => {
    expect(
      refreshOutcome({ refreshed: 2, failed: 1, skipped_human_edited: [{}] }),
    ).toMatchObject({
      failed: 1,
      description: "2 refreshed · 1 failed · 1 human-edited pages preserved.",
    });
    expect(() => refreshOutcome({})).toThrow();
  });
  it("rejects unconfigured and failed indexing responses", () => {
    expect(() =>
      indexingOutcome({ indexnow_status: "no_key", submitted_count: 10 }),
    ).toThrow();
    expect(() => indexingOutcome({ indexnow_status: "error_403" })).toThrow();
    expect(
      indexingOutcome({
        indexnow_status: "partial",
        submitted_count: 3,
        failed_count: 2,
      }).failed,
    ).toBe(true);
  });
  it("distinguishes receipt, pending validation and rejection", () => {
    expect(indexNowReceipt(200)).toBe("indexnow_submitted");
    expect(indexNowReceipt(202)).toBe("indexnow_pending");
    expect(indexNowReceipt(403)).toBe("error");
  });
  it("only submits this site's URLs and removes duplicates", () => {
    expect(
      validateIndexNowUrls(
        ["/blog/a", "https://example.com/blog/a#part"],
        "https://example.com",
      ),
    ).toEqual(["https://example.com/blog/a"]);
    expect(() =>
      validateIndexNowUrls(["https://other.test/a"], "https://example.com"),
    ).toThrow();
    expect(() =>
      validateIndexNowUrls(["javascript:alert(1)"], "https://example.com"),
    ).toThrow();
  });
});

import {
  pipelineOutcome,
  draftOutcome,
  confirmedPublish,
} from "../adminOutcomes";
describe("queue operation receipts", () => {
  it("distinguishes disabled runs from completed generation", () => {
    expect(
      pipelineOutcome({ ok: true, skipped: "automation disabled" }),
    ).toMatchObject({ title: "Run skipped", failed: false });
    expect(() => pipelineOutcome({})).toThrow();
    expect(() => pipelineOutcome({ ok: true })).toThrow();
  });
  it("surfaces HTTP 200 nested pipeline failures and held drafts", () => {
    expect(
      pipelineOutcome({
        ok: true,
        drafted: 1,
        log: {
          steps: {
            poll: { status: 503 },
            drafts: [
              {
                status: 200,
                post_id: "id",
                fact_check_status: 500,
                auto_publish: { status: 200, decision: "blocked" },
              },
            ],
          },
        },
      }),
    ).toMatchObject({
      title: "Run finished with issues",
      description:
        "1 created · 0 scheduled to auto-publish · 1 held for review · 2 stage issue(s).",
      failed: true,
    });
    expect(
      pipelineOutcome({
        ok: true,
        drafted: 0,
        log: {
          steps: { drafts: [{ status: 200, error: "rejected: originality" }] },
        },
      }).failed,
    ).toBe(true);
  });
  it("requires a saved draft and explicit publication success", () => {
    expect(() =>
      draftOutcome({ error: "rejected: freshness", quality_score: 90 }),
    ).toThrow("rejected: freshness");
    expect(() => draftOutcome({ ok: true })).toThrow();
    expect(draftOutcome({ ok: true, post_id: "id" }).title).toBe(
      "Draft saved for review",
    );
    expect(() => confirmedPublish(null)).toThrow();
    expect(() => confirmedPublish({ decision: "published" })).toThrow();
    expect(confirmedPublish({ ok: true, already_published: true })).toBe(
      "Already published",
    );
  });
});

describe("Run now receipt (auto-scheduling and holds)", () => {
  it("counts auto-scheduled posts as auto-published, not held", () => {
    const outcome = pipelineOutcome({
      ok: true,
      drafted: 2,
      log: {
        steps: {
          drafts: [
            {
              status: 200,
              post_id: "a",
              fact_check_status: 200,
              auto_publish: {
                status: 200,
                ok: true,
                decision: "scheduled",
                scheduled_at: "2026-09-22T20:00:00Z",
              },
            },
            {
              status: 200,
              post_id: "b",
              fact_check_status: 200,
              auto_publish: {
                status: 200,
                ok: true,
                decision: "queued",
                held_reason:
                  "Daily limit of 3 reached, will retry automatically",
              },
            },
          ],
        },
      },
    });
    expect(outcome.failed).toBe(false);
    expect(outcome.description).toContain(
      "2 created · 1 scheduled to auto-publish · 1 held for review · 0 stage issue(s).",
    );
    expect(outcome.description).toContain(
      "Held: Daily limit of 3 reached, will retry automatically.",
    );
  });

  it("still counts a direct 'published' decision", () => {
    expect(
      pipelineOutcome({
        ok: true,
        drafted: 1,
        log: {
          steps: {
            drafts: [
              {
                status: 200,
                post_id: "a",
                auto_publish: { status: 200, decision: "published" },
              },
            ],
          },
        },
      }).description,
    ).toContain("1 scheduled to auto-publish · 0 held for review");
  });

  it("reports earlier held drafts that were re-checked and scheduled", () => {
    expect(
      pipelineOutcome({
        ok: true,
        drafted: 0,
        regated: { checked: 4, scheduled: 2, held: 2 },
        log: { steps: { drafts: [] } },
      }).description,
    ).toContain("2 earlier drafts now scheduled.");
    expect(
      pipelineOutcome({
        ok: true,
        drafted: 0,
        regated: { checked: 0, scheduled: 0, held: 0, error: "timeout" },
        log: { steps: { drafts: [] } },
      }),
    ).toMatchObject({ title: "Run finished with issues", failed: true });
  });

  it("shows a clean stop when AI credits run out", () => {
    const outcome = pipelineOutcome({
      ok: false,
      stopped_reason: "ai_credits_exhausted",
      stopped_stage: "cluster",
      message: "AI credits ran out. Add credits in Lovable, then run again",
      drafted: 0,
      log: { steps: {} },
    });
    expect(outcome).toMatchObject({
      title: "Run stopped: AI credits ran out",
      failed: true,
      stoppedReason: "ai_credits_exhausted",
    });
    expect(outcome.description).toContain("Add credits in Lovable");
  });

  it("names scheduled outcomes from manual-publish", () => {
    expect(confirmedPublish({ ok: true, decision: "scheduled" })).toBe(
      "Scheduled",
    );
    expect(
      confirmedPublish({ ok: true, decision: "scheduled_with_override" }),
    ).toBe("Scheduled with override");
  });
});
