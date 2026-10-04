import { describe, expect, it } from "vitest";
import {
  assessOfferLaunchReadiness,
  type OfferLaunchInput,
} from "../offerLaunchReadiness";

const input: OfferLaunchInput = {
  status: "draft",
  hasUnpublishedChanges: false,
  checkoutMode: "native",
  kind: "paid",
  assetPath: "offers/resource.pdf",
  assetName: "resource.pdf",
  amountMinor: 4900,
  externalUrl: "",
  health: {
    isPending: false,
    isError: false,
    isFetching: false,
    data: {
      secret_configured: true,
      webhook_configured: true,
      payments_ready: true,
      delivery_ready: true,
      mode: "live",
      webhook_url: "https://example.com/webhook",
    },
  },
};

describe("offer launch readiness", () => {
  it("keeps publication separate from a blocked paid checkout", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      status: "published",
      health: {
        ...input.health,
        data: { ...input.health.data!, payments_ready: false },
      },
    });
    expect(result.page.state).toBe("published");
    expect(result.page.detail).not.toMatch(/can .*claim/);
    expect(result.checkout.state).toBe("blocked");
    expect(result.checkout.action).toBe("setup");
    expect(result.notice).toMatch(/Publishing the page does not enable/);
    expect(result.delivery.state).toBe("configured");
  });

  it("marks unpublished changes without claiming that draft checkout settings are live", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      status: "published",
      hasUnpublishedChanges: true,
    });
    expect(result.page.title).toContain("unpublished changes");
    expect(result.page.detail).toContain("last published version");
    expect(result.page.detail).toContain("current draft");
    expect(result.page.action).toBe("review");
  });

  it.each([
    [null, "draft", "Not saved yet"],
    ["draft", "draft", "Draft · private"],
    ["archived", "paused", "Paused · archived"],
  ] as const)("reflects %s page visibility", (status, state, title) => {
    const result = assessOfferLaunchReadiness({ ...input, status });
    expect(result.page).toMatchObject({ state, title, action: "review" });
  });

  it.each([
    { assetPath: "", assetName: "resource.pdf" },
    { assetPath: "offers/resource.pdf", assetName: "" },
    { assetPath: " ", assetName: "resource.pdf" },
  ])("requires both file path and name for native delivery %o", (file) => {
    const result = assessOfferLaunchReadiness({ ...input, ...file });
    expect(result.delivery).toMatchObject({
      state: "blocked",
      action: "delivery",
    });
    expect(result.checkout).toMatchObject({
      state: "blocked",
      action: "delivery",
    });
  });

  it("allows free claims and immediate download without Stripe or an email sender", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      kind: "free",
      amountMinor: 0,
      health: {
        ...input.health,
        data: {
          ...input.health.data!,
          mode: "unconfigured",
          secret_configured: false,
          webhook_configured: false,
          payments_ready: false,
          delivery_ready: false,
        },
      },
    });
    expect(result.checkout.state).toBe("configured");
    expect(result.checkout.detail).toContain(
      "not required for immediate access",
    );
    expect(result.checkout.detail).toContain("eligibility rules still apply");
    expect(result.delivery.state).toBe("configured");
    expect(result.delivery.detail).toContain(
      "Download email is not configured",
    );
    expect(result.notice).not.toContain("Paid checkout");
  });

  it.each([Number.NaN, -1, 0, 49, 50.5, 100000000])(
    "blocks an invalid native paid amount %s",
    (amountMinor) => {
      expect(
        assessOfferLaunchReadiness({ ...input, amountMinor }).checkout,
      ).toMatchObject({
        state: "blocked",
        title: "Set a valid price",
        action: "delivery",
      });
    },
  );

  it.each([50, 99999999])(
    "accepts the supported price boundary %s",
    (amountMinor) => {
      expect(
        assessOfferLaunchReadiness({ ...input, amountMinor }).checkout.state,
      ).toBe("configured");
    },
  );

  it("does not mistake cached healthy data for a successful latest check", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      health: { ...input.health, isError: true },
    });
    expect(result.checkout).toMatchObject({
      state: "unknown",
      action: "retry",
    });
    expect(result.delivery.detail).toContain("readiness is unknown");
    expect(result.notice).toContain("has not been confirmed");
  });

  it("distinguishes an in-progress first check from failure", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      health: {
        ...input.health,
        isPending: true,
        isFetching: true,
        data: undefined,
      },
    });
    expect(result.checkout.state).toBe("checking");
    expect(result.delivery.detail).toContain("still being checked");
  });

  it("keeps absent health unknown instead of treating missing flags as false", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      health: { ...input.health, data: undefined },
    });
    expect(result.checkout.state).toBe("unknown");
    expect(result.delivery.detail).toContain("readiness is unknown");
    expect(result.delivery.detail).not.toContain("not configured");
  });

  it("does not require a successful payment health request for free immediate access", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      kind: "free",
      health: { ...input.health, data: undefined, isError: true },
    });
    expect(result.checkout.state).toBe("configured");
    expect(result.delivery.state).toBe("configured");
    expect(result.delivery.detail).toContain("readiness is unknown");
  });

  it("reports omitted email flags and counts as unknown without inventing zero issues", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      health: {
        ...input.health,
        data: { ...input.health.data!, delivery_ready: undefined },
      },
    });
    expect(result.delivery.detail).toContain("was not reported");
    expect(result.delivery.detail).not.toMatch(
      /no issues|0 failed|not configured/,
    );
  });

  it.each(["delivery_failed", "delivery_needs_review"] as const)(
    "surfaces reported %s as a global queue issue with a fix link",
    (field) => {
      const result = assessOfferLaunchReadiness({
        ...input,
        health: {
          ...input.health,
          data: { ...input.health.data!, [field]: 2 },
        },
      });
      expect(result.delivery.detail).toContain(
        "across your offers need attention",
      );
      expect(result.delivery.action).toBe("setup");
    },
  );

  it("labels Stripe test configuration without implying real payment availability", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      health: {
        ...input.health,
        data: { ...input.health.data!, mode: "test" },
      },
    });
    expect(result.checkout.state).toBe("test");
    expect(result.checkout.detail).toContain("cannot collect real payments");
    expect(result.notice).toContain("test mode");
  });

  it("does not label an inconsistent unconfigured mode as live", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      health: {
        ...input.health,
        data: { ...input.health.data!, mode: "unconfigured" },
      },
    });
    expect(result.checkout.state).toBe("unknown");
  });

  it("describes live configuration without pretending to test payment, download or inbox delivery", () => {
    const result = assessOfferLaunchReadiness(input);
    expect(result.checkout.title).toBe("Live checkout configured");
    expect(result.checkout.detail).toContain("has not been verified");
    expect(result.delivery.detail).toContain("has not been tested");
    expect(result.delivery.detail).toContain(
      "inbox delivery has not been verified",
    );
    expect(result.notice).toContain("has not verified a purchase");
  });

  it("leaves external provider responsibilities independent of local Stripe, files and email health", () => {
    const result = assessOfferLaunchReadiness({
      ...input,
      checkoutMode: "external",
      assetPath: "",
      assetName: "",
      amountMinor: 0,
      externalUrl: "https://checkout.example.com/start?campaign=funnel",
      health: { ...input.health, isError: true, data: undefined },
    });
    expect(result.checkout.state).toBe("external");
    expect(result.delivery.state).toBe("external");
    expect(result.canCheckSetup).toBe(false);
    expect(result.notice).toContain("external provider");
    expect(result.delivery.detail).toContain("does not create local orders");
  });

  it.each([
    "",
    "http://example.com",
    "https://name:pass@example.com",
    "javascript:alert(1)",
  ])("catches an invalid external destination %s", (externalUrl) => {
    const result = assessOfferLaunchReadiness({
      ...input,
      checkoutMode: "external",
      externalUrl,
    });
    expect(result.checkout).toMatchObject({
      state: "blocked",
      action: "delivery",
    });
    expect(result.notice).toContain("destination is missing or invalid");
  });
});
