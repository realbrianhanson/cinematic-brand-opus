// @vitest-environment jsdom
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OfferLaunchReadiness from "../offers/OfferLaunchReadiness";
import {
  assessOfferLaunchReadiness,
  type OfferLaunchInput,
} from "@/lib/offerLaunchReadiness";

vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(cleanup);

const input: OfferLaunchInput = {
  status: "published",
  hasUnpublishedChanges: false,
  checkoutMode: "native",
  kind: "paid",
  assetPath: "resource.pdf",
  assetName: "resource.pdf",
  amountMinor: 4900,
  externalUrl: "",
  health: {
    isPending: false,
    isFetching: false,
    isError: false,
    data: {
      mode: "unconfigured",
      payments_ready: false,
      secret_configured: false,
      webhook_configured: false,
      webhook_url: "",
      delivery_ready: false,
    },
  },
};

describe("launch readiness cards", () => {
  it("displays a public page beside an unavailable checkout, with direct setup links", () => {
    render(
      <OfferLaunchReadiness
        assessment={assessOfferLaunchReadiness(input)}
        onGo={vi.fn()}
        onRetry={vi.fn()}
        checking={false}
      />,
    );
    const region = within(
      screen.getByRole("region", { name: "Launch readiness" }),
    );
    expect(region.getByText("Published")).toBeTruthy();
    expect(region.getByText("Paid checkout unavailable")).toBeTruthy();
    expect(region.getByText("Download file configured")).toBeTruthy();
    expect(
      region
        .getAllByRole("link", { name: "Offers setup" })
        .every(
          (link) => link.getAttribute("href") === "/admin/offers?tab=setup",
        ),
    ).toBe(true);
  });

  it("takes missing-file repairs straight to Delivery", () => {
    const onGo = vi.fn();
    render(
      <OfferLaunchReadiness
        assessment={assessOfferLaunchReadiness({ ...input, assetPath: "" })}
        onGo={onGo}
        onRetry={vi.fn()}
        checking={false}
      />,
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Fix in Delivery" })[0],
    );
    expect(onGo).toHaveBeenCalledWith("delivery");
  });

  it("takes unpublished page edits to Review", () => {
    const onGo = vi.fn();
    render(
      <OfferLaunchReadiness
        assessment={assessOfferLaunchReadiness({
          ...input,
          hasUnpublishedChanges: true,
        })}
        onGo={onGo}
        onRetry={vi.fn()}
        checking={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review page" }));
    expect(onGo).toHaveBeenCalledWith("review");
  });

  it("offers a read-only setup refresh and disables it during checking", () => {
    const onRetry = vi.fn();
    const props = {
      assessment: assessOfferLaunchReadiness(input),
      onGo: vi.fn(),
      onRetry,
    };
    const { rerender } = render(
      <OfferLaunchReadiness {...props} checking={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Check setup again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<OfferLaunchReadiness {...props} checking />);
    expect(
      (screen.getByRole("button", { name: "Checking…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("does not show native payment setup controls for an external offer", () => {
    render(
      <OfferLaunchReadiness
        assessment={assessOfferLaunchReadiness({
          ...input,
          checkoutMode: "external",
          externalUrl: "https://provider.example/offer",
        })}
        onGo={vi.fn()}
        onRetry={vi.fn()}
        checking={false}
      />,
    );
    expect(screen.getAllByText("Handled by your provider")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Check setup again" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Offers setup" })).toBeNull();
  });

  it("prevents local step changes while a save is busy", () => {
    const onGo = vi.fn();
    render(
      <OfferLaunchReadiness
        assessment={assessOfferLaunchReadiness({
          ...input,
          assetPath: "",
          status: "draft",
        })}
        onGo={onGo}
        onRetry={vi.fn()}
        checking={false}
        disabled
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review page" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Fix in Delivery" })[0],
    );
    expect(onGo).not.toHaveBeenCalled();
  });
});
