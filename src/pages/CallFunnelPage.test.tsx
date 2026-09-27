// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CallFunnelPage from "./CallFunnelPage";
import {
  emptyCallFunnelConfig,
  publicCallConfig,
  type CallApplicationState,
  type CallPublication,
} from "@/lib/callFunnels";
import {
  CallApiError,
  getCallApplicationState,
  submitCallApplication,
} from "@/lib/callFunnelsClient";
import type { CallFunnelExperienceProps } from "@/components/call-funnels/CallFunnelExperience";
const harness = vi.hoisted(() => ({
  props: null as CallFunnelExperienceProps | null,
}));
vi.mock("@/components/call-funnels/CallFunnelExperience", () => ({
  default: (props: CallFunnelExperienceProps) => {
    harness.props = props;
    return (
      <div>
        <p>Experience revision {props.publication.revision}</p>
        <button
          onClick={() =>
            void props.onSubmit!(
              { ready: "yes" },
              { name: "Example", email: "example@example.com" },
              true,
            ).catch(() => {})
          }
        >
          Submit application
        </button>
      </div>
    );
  },
}));
vi.mock("@/lib/callFunnelsClient", () => ({
  CallApiError: class extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
  getCallApplicationState: vi.fn(),
  submitCallApplication: vi.fn(),
}));
vi.mock("@/lib/funnelJourneysClient", () => ({
  newFunnelToken: () => "b".repeat(64),
}));
const publication: CallPublication = {
  id: "funnel-1",
  slug: "strategy",
  title: "Strategy",
  revision: 2,
  config: publicCallConfig(emptyCallFunnelConfig()),
  proof: [],
};
const recovered = (): CallApplicationState => ({
  id: "app-1",
  slug: publication.slug,
  title: publication.title,
  revision: 1,
  config: {
    ...publication.config,
    invitation: {
      ...publication.config.invitation,
      headline: "Original invitation",
    },
  },
  proof: [],
  outcome: "qualified",
  submittedAt: new Date().toISOString(),
  booking: { status: "unconfirmed", startsAt: null, source: null },
});
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: () => "00000000-0000-4000-8000-000000000001",
  });
});
afterEach(cleanup);
describe("public application recovery", () => {
  it("keeps an unknown capability across a reload so an in-flight request cannot be duplicated", async () => {
    sessionStorage.setItem("call-access:funnel-1", "a".repeat(64));
    vi.mocked(getCallApplicationState).mockRejectedValue(
      new CallApiError("Application not found", 404),
    );
    vi.mocked(submitCallApplication).mockResolvedValue(recovered());
    render(<CallFunnelPage publication={publication} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit application" }),
    );
    await waitFor(() => expect(submitCallApplication).toHaveBeenCalled());
    expect(vi.mocked(submitCallApplication).mock.calls[0][0].token).toBe(
      "a".repeat(64),
    );
  });
  it("recovers the pinned publication instead of substituting edited copy or rules", async () => {
    sessionStorage.setItem("call-access:funnel-1", "a".repeat(64));
    vi.mocked(getCallApplicationState).mockResolvedValue(recovered());
    render(<CallFunnelPage publication={publication} />);
    await screen.findByText("Experience revision 1");
    expect(harness.props!.publication.config.invitation.headline).toBe(
      "Original invitation",
    );
    expect(harness.props!.initialState!.booking.status).toBe("unconfirmed");
  });
  it("blocks re-entry after an uncertain write and replays the exact original request", async () => {
    vi.mocked(submitCallApplication)
      .mockRejectedValueOnce(new Error("Network interrupted"))
      .mockResolvedValueOnce(recovered());
    render(<CallFunnelPage publication={publication} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit application" }),
    );
    await screen.findByRole("heading", { name: "Recover your submission" });
    const original = vi.mocked(submitCallApplication).mock.calls[0][0];
    expect(sessionStorage.getItem("call-access:funnel-1")).toBe(original.token);
    expect(sessionStorage.getItem("call-access:funnel-1")).not.toContain(
      "example@",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original submission" }),
    );
    await screen.findByText("Experience revision 1");
    expect(vi.mocked(submitCallApplication).mock.calls[1][0]).toEqual(original);
    expect(
      screen.queryByRole("heading", { name: "Recover your submission" }),
    ).toBeNull();
  });
  it("does not expose a fresh application while earlier state cannot be checked", async () => {
    sessionStorage.setItem("call-access:funnel-1", "a".repeat(64));
    vi.mocked(getCallApplicationState).mockRejectedValue(
      new Error("Unavailable"),
    );
    render(<CallFunnelPage publication={publication} />);
    await screen.findByRole("heading", { name: "Recover your submission" });
    expect(
      screen.queryByRole("button", { name: "Submit application" }),
    ).toBeNull();
    expect(submitCallApplication).not.toHaveBeenCalled();
  });
});
