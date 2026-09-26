// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const { response } = vi.hoisted(() => ({
  response: {
    data: null as unknown,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => response }));
vi.mock("@/lib/funnelJourneyMeasurementReport", () => ({
  funnelJourneyMeasurementQuery: () => ({}),
}));
import FunnelJourneyMetrics from "../FunnelJourneyMetrics";
afterEach(cleanup);
describe("connected journey report", () => {
  it("uses local step denominators and labels unobserved outcomes honestly", () => {
    response.data = {
      measurement_started_at: "2026-09-27T12:00:00Z",
      revision_count: 1,
      revisions: [
        {
          journey_id: "journey",
          revision: 3,
          title: "Next step",
          measured_sessions: 10,
          entry_sessions: 7,
          steps: [
            {
              step_id: "choose",
              title: "Choose support",
              kind: "choice",
              view_sessions: 7,
              continue_sessions: 4,
              handoff_sessions: 0,
              no_next_action_sessions: 2,
              still_active_sessions: 1,
              branches: [{ option_id: "guided", label: "Guided", sessions: 4 }],
            },
            {
              step_id: "offer",
              title: "Workshop",
              kind: "offer",
              view_sessions: 5,
              continue_sessions: 1,
              handoff_sessions: 3,
              no_next_action_sessions: 1,
              still_active_sessions: 0,
              branches: [],
            },
          ],
        },
      ],
    };
    render(<FunnelJourneyMetrics days={30} />);
    expect(
      screen.getByText(/10 measured sessions · 7 observed at the entry step/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Guided: 4 of 4 continuing sessions"),
    ).toBeInTheDocument();
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
    expect(
      screen.getByText(/do not confirm a booking, download, purchase/),
    ).toBeInTheDocument();
  });
  it("does not equate an empty measured cohort with no visitors", () => {
    response.data = {
      measurement_started_at: "2026-09-27T12:00:00Z",
      revision_count: 0,
      revisions: [],
    };
    render(<FunnelJourneyMetrics days={7} />);
    expect(
      screen.getByText(/does not mean no one used a journey/),
    ).toBeInTheDocument();
  });
});
