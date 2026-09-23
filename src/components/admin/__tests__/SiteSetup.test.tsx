// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/config/site";
import { memberPreset } from "@/config/presets/member";
import { setupDefaults } from "@/config/runtime";
import {
  planSiteSetupChanges,
  seedSetupValues,
  type LiveSiteSettings,
} from "../siteSetupChanges";

const { rpc, stored } = vi.hoisted(() => ({
  rpc: vi.fn(),
  stored: { value: null as unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: stored.value ? { settings: stored.value } : null,
          error: null,
        }),
      };
      return query;
    },
    rpc,
  },
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: async () => {} }),
}));
vi.mock("@/lib/router-compat", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SiteSetup from "../SiteSetup";

const liveRow: LiveSiteSettings = {
  site_name: "Brian Hanson LLC",
  site_url: "https://brianhanson.com",
  author_name: "Brian Hanson",
  author_title: "4x Inc. 5000 Entrepreneur · AI Educator",
  author_bio: "Live bio from Brand & publishing",
  author_credentials: ["Inc. 5000 x4"],
  author_social_links: { linkedin: "https://linkedin.com/in/brian" },
  publisher_name: "Brian Hanson",
  publisher_url: "https://brianhanson.com",
  cta_headline: "Free 3-Day AI for Business Summit",
  cta_subtext: "Summit subtext",
  cta_button_text: "Reserve Your Free 3-Day Pass",
  cta_url: "https://summit.example/pass",
  cta_social_proof: "2,000 attendees",
};

function renderSetup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <SiteSetup />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stored.value = null;
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) =>
    name === "admin_read_site_settings"
      ? { data: [liveRow], error: null }
      : { data: null, error: null },
  );
});
afterEach(cleanup);

describe("site setup change plan", () => {
  it("seeds the bio from the live row and keeps the live runtime fields", () => {
    const seeded = seedSetupValues(siteConfig, null, liveRow);
    expect(seeded.authorBio).toBe(liveRow.author_bio);
    expect(seeded.role).toBe(siteConfig.identity.role);
    const fromStored = seedSetupValues(
      siteConfig,
      { ...seeded, role: "Stored role", authorBio: "stale" },
      liveRow,
    );
    expect(fromStored.role).toBe("Stored role");
    expect(fromStored.authorBio).toBe(liveRow.author_bio);
  });

  it("never lists the article CTA or byline title in owner mode", () => {
    const current = seedSetupValues(siteConfig, null, liveRow);
    const plan = planSiteSetupChanges({
      current,
      next: { ...current, headline: "New headline" },
      row: liveRow,
      storedMode: null,
    });
    expect(plan.memberReset).toBe(false);
    expect(plan.website).toEqual([
      {
        label: "Homepage headline",
        from: current.headline,
        to: "New headline",
      },
    ]);
    expect(plan.publishing).toEqual([
      { label: "Site name", from: "Brian Hanson LLC", to: "Brian Hanson" },
    ]);
  });

  it("lists every wiped value for a first member apply", () => {
    const current = seedSetupValues(siteConfig, null, liveRow);
    const next = { ...setupDefaults(memberPreset), mode: "member" as const };
    const plan = planSiteSetupChanges({
      current,
      next,
      row: liveRow,
      storedMode: null,
    });
    expect(plan.memberReset).toBe(true);
    const labels = plan.publishing.map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Author byline title",
        "Article CTA headline",
        "Article CTA button",
        "Article CTA social proof",
        "Author credentials",
        "Author social links",
      ]),
    );
    expect(
      planSiteSetupChanges({
        current,
        next,
        row: liveRow,
        storedMode: "member",
      }).memberReset,
    ).toBe(false);
  });
});

describe("SiteSetup", () => {
  it("seeds from live settings and applies only after confirming the listed changes", async () => {
    renderSetup();
    expect(
      await screen.findByDisplayValue(liveRow.author_bio as string),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Preview & launch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply site setup" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Apply these changes to the live site?"),
    ).toBeInTheDocument();
    const changes = within(dialog).getAllByTestId("setup-change");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toHaveTextContent(
      "Site name: Brian Hanson LLC → Brian Hanson",
    );
    expect(within(dialog).queryByText(/Article CTA/)).toBeNull();
    expect(rpc).not.toHaveBeenCalledWith(
      "save_site_branding",
      expect.anything(),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(rpc).not.toHaveBeenCalledWith(
      "save_site_branding",
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply site setup" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Apply these changes" }),
    );
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("save_site_branding", {
        value: expect.objectContaining({
          mode: "owner",
          authorBio: liveRow.author_bio,
          role: siteConfig.identity.role,
        }),
      }),
    );
    const sent = rpc.mock.calls.find(([n]) => n === "save_site_branding")?.[1]
      .value;
    expect(sent).not.toHaveProperty("bylineTitle");
    expect(sent).not.toHaveProperty("ctaHeadline");
  });

  it("guards the fresh member brand behind a typed confirmation", async () => {
    renderSetup();
    const name = await screen.findByDisplayValue(siteConfig.identity.name);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "member" },
    });
    const warning = await screen.findByText(
      "This is for a member copy, not this live site.",
    );
    expect(warning).toBeInTheDocument();
    expect(name).toHaveValue(siteConfig.identity.name);
    const switchButton = screen.getByRole("button", {
      name: "Switch to fresh member brand",
    });
    expect(switchButton).toBeDisabled();
    const host = new URL(siteConfig.identity.siteUrl).host;
    fireEvent.change(screen.getByLabelText(new RegExp(`Type ${host}`)), {
      target: { value: host },
    });
    expect(switchButton).toBeEnabled();
    fireEvent.click(switchButton);
    expect(
      await screen.findByDisplayValue(memberPreset.identity.name),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This is for a member copy, not this live site."),
    ).toBeNull();
  });
});
