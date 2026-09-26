// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  act,
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
  stored: { value: null as unknown, updatedAt: null as string | null },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: stored.value
            ? { settings: stored.value, updated_at: stored.updatedAt }
            : null,
          error: null,
        }),
      };
      return query;
    },
    rpc,
  },
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: vi.fn(),
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
  stored.updatedAt = null;
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) =>
    name === "admin_read_site_settings"
      ? { data: [liveRow], error: null }
      : { data: { saved: true }, error: null },
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
  it.each([
    {
      label: "absent branding row",
      brandingExists: false,
      brandingVersion: null,
      settingsVersion: "2026-09-26T12:00:00Z",
    },
    {
      label: "legacy null settings timestamp",
      brandingExists: true,
      brandingVersion: "2026-09-26T12:00:01Z",
      settingsVersion: null,
    },
    {
      label: "both null markers",
      brandingExists: false,
      brandingVersion: null,
      settingsVersion: null,
    },
    {
      label: "both populated markers",
      brandingExists: true,
      brandingVersion: "2026-09-26T12:00:01Z",
      settingsVersion: "2026-09-26T12:00:00Z",
    },
  ])(
    "serializes both required concurrency keys for $label",
    async ({ brandingExists, brandingVersion, settingsVersion }) => {
      stored.value = brandingExists ? setupDefaults(siteConfig) : null;
      stored.updatedAt = brandingVersion;
      rpc.mockImplementation(async (name: string) =>
        name === "admin_read_site_settings"
          ? { data: [{ ...liveRow, updated_at: settingsVersion }], error: null }
          : { data: { saved: true }, error: null },
      );
      renderSetup();
      await screen.findByLabelText("Name or brand");
      fireEvent.click(screen.getByRole("button", { name: /Preview & launch/ }));
      fireEvent.click(screen.getByRole("button", { name: "Apply site setup" }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Apply these changes" }),
      );
      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith(
          "admin_save_site_branding",
          expect.anything(),
        ),
      );
      const args = rpc.mock.calls.find(
        ([name]) => name === "admin_save_site_branding",
      )?.[1];
      // PostgREST chooses this RPC by argument names. An undefined value vanishes
      // from the JSON body, while explicit null is a valid concurrency marker.
      const body = JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
      for (const key of [
        "_expected_branding_updated_at",
        "_expected_settings_updated_at",
      ]) {
        expect(Object.hasOwn(body, key)).toBe(true);
      }
      expect(body._expected_branding_updated_at).toBe(brandingVersion);
      expect(body._expected_settings_updated_at).toBe(settingsVersion);
    },
  );

  it("freezes the draft and apply controls while reloading a saved site identity", async () => {
    renderSetup();
    fireEvent.change(await screen.findByLabelText("Name or brand"), {
      target: { value: "Draft to discard" },
    });
    let complete!: (value: unknown) => void;
    rpc.mockImplementation((name: string) =>
      name === "admin_read_site_settings"
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : Promise.resolve({ data: { saved: true }, error: null }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved site settings" }),
    );
    expect(screen.getByLabelText("Name or brand")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Preview & launch/ }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Name or brand")).toHaveValue(
      "Draft to discard",
    );
    await act(async () => complete({ data: [liveRow], error: null }));
    await waitFor(() =>
      expect(screen.getByLabelText("Name or brand")).toBeEnabled(),
    );
    expect(screen.getByLabelText("Name or brand")).not.toHaveValue(
      "Draft to discard",
    );
    confirm.mockRestore();
  });

  it("sends the loaded identity version and retains a rejected draft", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "admin_read_site_settings"
        ? { data: [{ ...liveRow, updated_at: "loaded-version" }], error: null }
        : {
            data: null,
            error: { message: "Site settings changed in another session." },
          },
    );
    renderSetup();
    fireEvent.change(await screen.findByLabelText("Name or brand"), {
      target: { value: "Unsaved name" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview & launch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply site setup" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Apply these changes" }),
    );
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "admin_save_site_branding",
        expect.objectContaining({
          _expected_settings_updated_at: "loaded-version",
        }),
      ),
    );
    await screen.findByText(/Your draft has been kept/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /1. Identity/ }));
    expect(screen.getByLabelText("Name or brand")).toHaveValue("Unsaved name");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved site settings" }),
    );
    expect(screen.getByLabelText("Name or brand")).toHaveValue("Unsaved name");
    confirm.mockRestore();
  });

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
      "admin_save_site_branding",
      expect.anything(),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(rpc).not.toHaveBeenCalledWith(
      "admin_save_site_branding",
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply site setup" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Apply these changes" }),
    );
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_save_site_branding", {
        _expected_branding_updated_at: null,
        _expected_settings_updated_at: null,
        _value: expect.objectContaining({
          mode: "owner",
          authorBio: liveRow.author_bio,
          role: siteConfig.identity.role,
        }),
      }),
    );
    const sent = rpc.mock.calls.find(
      ([n]) => n === "admin_save_site_branding",
    )?.[1]._value;
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
