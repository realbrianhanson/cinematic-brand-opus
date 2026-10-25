// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import OfferJourneyReadiness from "../offers/OfferJourneyReadiness";

afterEach(cleanup);

describe("follow-up readiness", () => {
  it("explains why an unpublished follow-up will not appear", () => {
    render(
      <OfferJourneyReadiness
        external={false}
        hasFollowUp
        followUpStatus="draft"
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("not published");
  });
  it("distinguishes an unknown follow-up from an unpublished one", () => {
    render(<OfferJourneyReadiness external={false} hasFollowUp />);
    expect(screen.getByRole("status").textContent).toContain(
      "could not be verified",
    );
  });
  it.each([
    [true, true, "draft"],
    [false, false, undefined],
    [false, true, "published"],
  ] as const)(
    "does not show irrelevant follow-up warnings (%s, %s, %s)",
    (external, hasFollowUp, followUpStatus) => {
      const { container } = render(
        <OfferJourneyReadiness
          external={external}
          hasFollowUp={hasFollowUp}
          followUpStatus={followUpStatus}
        />,
      );
      expect(container.textContent).toBe("");
    },
  );
});
