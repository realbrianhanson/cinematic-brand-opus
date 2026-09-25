import { describe, expect, it } from "vitest";
import { pendingBackendUpdate } from "../adminBackendUpdate";

describe("pending admin backend updates", () => {
  it("recognizes the missing overview RPC", () => {
    expect(
      pendingBackendUpdate(
        {
          code: "PGRST202",
          message:
            "Could not find the function public.admin_overview_snapshot in the schema cache",
        },
        "overview",
      )?.migration,
    ).toBe("20260923150000_admin_overview_truth");
  });
  it.each([
    "Could not find the function public.admin_newsletter_audience in the schema cache",
    "function public.newsletter_retry_failed_delivery(uuid) does not exist",
    "column newsletter_sends.last_error does not exist",
    "Could not find the 'last_error_status' column of 'newsletter_sends' in the schema cache",
    'column "last_error_at" of relation "newsletter_sends" does not exist',
    "column newsletter_deliveries.provider_status does not exist",
  ])("recognizes a specific newsletter prerequisite: %s", (message) => {
    expect(
      pendingBackendUpdate(new Error(message), "newsletter")?.migration,
    ).toBe("20260923140000_newsletter_truth");
  });
  it.each([
    { message: "Failed to fetch" },
    {
      code: "42501",
      message: "permission denied for function admin_newsletter_audience",
    },
    {
      code: "PGRST202",
      message: "Could not find the function unrelated_rpc in the schema cache",
    },
    { code: "42703", message: "column posts.title does not exist" },
    { message: "Admin access required" },
    { message: "Timeout reading admin_newsletter_audience" },
  ])("does not relabel unrelated or access failures", (error) => {
    expect(pendingBackendUpdate(error, "newsletter")).toBeNull();
  });
});
