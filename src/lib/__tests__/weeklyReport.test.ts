import { describe, expect, it } from "vitest";
import {
  buildReportHtml,
  errorText,
  reportGate,
  reportSendFailure,
} from "../../../supabase/functions/weekly-report/reportLogic";

describe("reportGate", () => {
  it("skips scheduled runs when reports are turned off, even with cron:true", () => {
    expect(reportGate({ mode: "cron", manual: false, enabled: false })).toEqual(
      {
        run: false,
        message: "Weekly reports are turned off in Brand & publishing.",
      },
    );
    expect(reportGate({ mode: "cron", manual: true, enabled: false }).run).toBe(
      false,
    );
  });
  it("runs scheduled reports when enabled", () => {
    expect(reportGate({ mode: "cron", manual: false, enabled: true }).run).toBe(
      true,
    );
  });
  it("lets a signed-in admin send a manual report even when turned off", () => {
    expect(
      reportGate({ mode: "admin", manual: true, enabled: false }).run,
    ).toBe(true);
    expect(
      reportGate({ mode: "admin", manual: false, enabled: false }).run,
    ).toBe(false);
  });
});

describe("error strings", () => {
  it("never produces [object Object]", () => {
    expect(errorText({ message: "boom" })).toBe("boom");
    expect(errorText(new Error("bad"))).toBe("bad");
    expect(errorText({ code: 1 })).toBe("Unexpected error");
    expect(errorText("plain")).toBe("plain");
  });
  it("describes a Resend rejection in plain words", () => {
    expect(
      reportSendFailure(
        403,
        JSON.stringify({
          message: "The m.brianhanson.com domain is not verified.",
        }),
      ),
    ).toBe(
      "The report email wasn't sent. Provider returned HTTP 403: The m.brianhanson.com domain is not verified.",
    );
  });
});

describe("buildReportHtml", () => {
  it("escapes the site name and page titles", () => {
    const html = buildReportHtml({
      siteName: "<b>Brand</b>",
      weekAgo: new Date("2026-09-16T00:00:00Z"),
      now: new Date("2026-09-23T00:00:00Z"),
      newPages: 2,
      views: 10,
      changePercent: "5.0",
      topPages: [{ title: "<script>x</script>", view_count: 3 }],
      refreshNeeded: 0,
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;Brand&lt;/b&gt;");
  });
});
