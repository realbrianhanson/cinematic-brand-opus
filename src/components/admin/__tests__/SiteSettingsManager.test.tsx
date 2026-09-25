// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const KEY = "0123456789abcdef0123456789abcdef";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  invoke: vi.fn(),
  updateError: null as unknown,
  saveArgs: vi.fn(),
  settingsVersion: "complete" as
    "complete" | "missing-private" | "null-timestamps",
  emptyTable: "" as string,
  indexnow: {} as Record<string, unknown>,
  blocker: { shouldBlockFn: () => false, enableBeforeUnload: false },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBlocker: (options: typeof h.blocker) => {
    h.blocker = options;
  },
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/lib/withTimeout", () => ({
  safeMutation: (run: () => unknown) => run(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const settings = {
    id: "s1",
    updated_at: "2026-09-25T00:00:00Z",
    site_name: "Brian Hanson",
    site_url: "https://brianhanson.com",
    publisher_name: "Brian Hanson",
    publisher_url: "https://brianhanson.com",
    author_name: "Brian Hanson",
    author_title: "Founder",
    author_bio: "",
    author_credentials: [],
    author_social_links: {},
    cta_url: "https://go.aiforbusiness.com/summit",
    cta_headline: "Summit",
    cta_subtext: "Sub",
    cta_button_text: "Go",
    cta_social_proof: "",
    image_generation_enabled: false,
    newsletter_from_address: "Brian Hanson <brian@m.brianhanson.com>",
    newsletter_reply_to: "brian@realagency.com",
    newsletter_postal_address: "1 Main St",
    indexnow_key: "0123456789abcdef0123456789abcdef",
  };
  const privateRow = {
    id: "p1",
    updated_at: "2026-09-25T00:00:00Z",
    gsc_property: "",
    report_email: "",
    report_enabled: false,
    voice_profile: "",
    banned_phrases: [],
    default_expert_pov: "",
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let payload: Record<string, unknown> | null = null;
    chain.select = () => chain;
    chain.limit = () => chain;
    chain.order = () => chain;
    chain.maybeSingle = () =>
      Promise.resolve({
        data:
          h.settingsVersion === "missing-private"
            ? null
            : {
                ...privateRow,
                updated_at:
                  h.settingsVersion === "null-timestamps"
                    ? null
                    : privateRow.updated_at,
              },
        error: null,
      });
    chain.update = (p: Record<string, unknown>) => {
      payload = p;
      return chain;
    };
    chain.eq = () => {
      h.updates.push({ table, payload: payload! });
      return chain;
    };
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: table === h.emptyTable ? [] : [{ id: "saved" }],
        error: h.updateError,
      }).then(resolve);
    return chain;
  };
  return {
    supabase: {
      from,
      rpc: (name: string, args?: Record<string, unknown>) => {
        if (name === "admin_save_site_settings") {
          h.saveArgs(args);
          h.updates.push(
            {
              table: "site_settings",
              payload: args?._public_patch as Record<string, unknown>,
            },
            {
              table: "site_settings_private",
              payload: args?._private_patch as Record<string, unknown>,
            },
          );
          return {
            abortSignal: () =>
              Promise.resolve({
                data: h.emptyTable
                  ? null
                  : {
                      public_id: "s1",
                      private_id: "p1",
                      public_updated_at: "2026-09-25T00:01:00Z",
                      private_updated_at: "2026-09-25T00:01:00Z",
                    },
                error: h.updateError,
              }),
          };
        }
        if (name === "admin_read_site_settings")
          return {
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  ...settings,
                  updated_at:
                    h.settingsVersion === "null-timestamps"
                      ? null
                      : settings.updated_at,
                },
                error: null,
              }),
          };
        if (name === "admin_indexnow_status")
          return Promise.resolve({ data: h.indexnow, error: null });
        return Promise.resolve({ data: null, error: { message: "unknown" } });
      },
      functions: { invoke: h.invoke },
    },
  };
});

import SiteSettingsManager from "../SiteSettingsManager";

function renderPage(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  return render(
    <QueryClientProvider client={client}>
      <SiteSettingsManager />
    </QueryClientProvider>,
  );
}

const sitemapXml = Array.from(
  { length: 362 },
  (_, i) => `<url><loc>https://brianhanson.com/p${i}</loc></url>`,
).join("");

beforeEach(() => {
  h.updates = [];
  h.updateError = null;
  h.saveArgs.mockReset();
  h.settingsVersion = "complete";
  h.emptyTable = "";
  h.toast.mockReset();
  h.invoke.mockReset();
  h.indexnow = {
    key: KEY,
    received_total: 0,
    last_submission_at: null,
    last_submission_count: 0,
    last_error_at: "2026-09-23T08:00:00Z",
    last_error: "IndexNow key missing",
  };
  h.invoke.mockResolvedValue({
    data: {
      key_present: true,
      key_location: `https://brianhanson.com/${KEY}.txt`,
      key_file_ok: true,
    },
    error: null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/sitemap.xml"
        ? new Response(`<urlset>${sitemapXml}</urlset>`, { status: 200 })
        : url === "/robots.txt"
          ? new Response(
              "User-agent: *\nSitemap: https://brianhanson.com/sitemap.xml\n",
              { status: 200 },
            )
          : new Response("", { status: 404 }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Brand & publishing", () => {
  it.each(["missing-private", "null-timestamps"] as const)(
    "preserves null concurrency markers for %s settings",
    async (version) => {
      h.settingsVersion = version;
      renderPage();
      await screen.findByLabelText("Site Name");
      fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }));
      await waitFor(() =>
        expect(h.toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Settings saved" }),
        ),
      );
      expect(h.saveArgs).toHaveBeenCalledWith(
        expect.objectContaining({
          _public_id: "s1",
          _private_id: version === "missing-private" ? null : "p1",
          _public_updated_at:
            version === "null-timestamps" ? null : "2026-09-25T00:00:00Z",
          _private_updated_at: null,
        }),
      );
    },
  );
  it("keeps unsaved settings when navigation is cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    const name = await screen.findByLabelText("Site Name");
    expect(h.blocker.shouldBlockFn()).toBe(false);
    fireEvent.change(name, { target: { value: "Keep my brand changes" } });
    expect(h.blocker.shouldBlockFn()).toBe(true);
    expect(name).toHaveValue("Keep my brand changes");
    expect(h.blocker.enableBeforeUnload).toBe(true);
    confirm.mockRestore();
  });
  it.each(["site_settings", "site_settings_private"])(
    "does not report success when %s is no longer writable",
    async (table) => {
      h.emptyTable = table;
      renderPage();
      const name = await screen.findByLabelText("Site Name");
      fireEvent.change(name, {
        target: { value: "Keep these unsaved settings" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }));
      await waitFor(() =>
        expect(h.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Save failed",
            variant: "destructive",
          }),
        ),
      );
      expect(h.toast).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: "Settings saved" }),
      );
      expect(name).toHaveValue("Keep these unsaved settings");
    },
  );
  it("keeps unsaved public and private fields during background refreshes", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderPage(client);
    const name = await screen.findByLabelText("Site Name");
    fireEvent.change(name, { target: { value: "My unfinished brand edit" } });
    await act(async () => {
      client.setQueryData(
        ["admin-site-settings"],
        (old: Record<string, unknown>) => ({
          ...old,
          site_name: "A remote change",
        }),
      );
      client.setQueryData(
        ["admin-site-settings-private"],
        (old: Record<string, unknown>) => ({
          ...old,
          voice_profile: "A remote voice change",
        }),
      );
    });
    expect(name).toHaveValue("My unfinished brand edit");
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }));
    await waitFor(() => expect(h.updates.length).toBe(2));
    expect(h.updates[0].payload.site_name).toBe("My unfinished brand edit");
    expect(h.updates[1].payload.voice_profile).toBeNull();
  });
  it("labels every text field so it can be found by its name", async () => {
    renderPage();
    await screen.findByLabelText("Site URL");
    for (const label of [
      "Site Name",
      "Site URL",
      "Publisher Name",
      "Publisher URL",
      "Author Name",
      "Author Title",
      "Author Bio",
      "Add a credential",
      "LinkedIn",
      "Twitter / X",
      "Instagram",
      "YouTube",
      "TikTok",
      "CTA URL",
      "CTA Headline",
      "CTA Subtext",
      "CTA Button Text",
      "CTA Social Proof Line",
      "Voice Profile",
      "Add banned phrases",
      /Default Expert POV/,
      "Verified sender",
      "Reply-to email",
      "Business mailing address",
      "Report email",
      "Generate one editorial image per resource page (uses provider credits)",
      "Enable weekly email reports",
    ])
      expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it("uses a single column on phones and a sidebar only on large screens", async () => {
    const { container } = renderPage();
    await screen.findByLabelText("Site URL");
    const grid = container.querySelector("[data-testid='settings-layout']");
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid?.className).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_380px\]/);
    expect((grid as HTMLElement).style.gridTemplateColumns).toBe("");
  });

  it("blocks saving with inline errors when a URL or email is invalid", async () => {
    renderPage();
    const siteUrl = await screen.findByLabelText("Site URL");
    fireEvent.change(siteUrl, { target: { value: "brianhanson.com" } });
    fireEvent.change(screen.getByLabelText("Reply-to email"), {
      target: { value: "brian@" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));

    await waitFor(() =>
      expect(siteUrl).toHaveAttribute("aria-invalid", "true"),
    );
    expect(siteUrl).toHaveAccessibleDescription(
      /Enter your full web address starting with https:\/\//,
    );
    expect(screen.getByLabelText("Reply-to email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(h.updates).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Fix the highlighted fields",
        variant: "destructive",
      }),
    );

    // Fixing the field clears its error and allows the save.
    fireEvent.change(siteUrl, {
      target: { value: "https://brianhanson.com/" },
    });
    fireEvent.change(screen.getByLabelText("Reply-to email"), {
      target: { value: "brian@realagency.com" },
    });
    expect(siteUrl).not.toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));
    await waitFor(() => expect(h.updates).toHaveLength(2));
    expect(h.updates[0].payload.site_url).toBe("https://brianhanson.com");
  });

  it("explains a database check rejection instead of a raw constraint name", async () => {
    h.updateError = {
      code: "23514",
      message:
        'new row for relation "site_settings" violates check constraint "site_settings_site_url_https"',
    };
    renderPage();
    await screen.findByLabelText("Site URL");
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Save failed",
          description:
            "The database rejected Site URL. Use an https:// address with no path, then save again.",
        }),
      ),
    );
  });

  it("makes Report email prominent and says the Monday preview goes there", async () => {
    renderPage();
    const field = await screen.findByLabelText("Report email");
    expect(field).toHaveAccessibleDescription(
      /Monday newsletter preview is sent to this address/,
    );
    expect(
      screen.getByRole("heading", { name: "Admin email & weekly reports" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No address set/)).toBeInTheDocument();
  });

  it("counts the live sitemap and drops the stale robots.txt warning", async () => {
    renderPage();
    const card = (
      await screen.findByRole("heading", { name: /Sitemap & Crawlers/ })
    ).closest("section") as HTMLElement;
    expect(await within(card).findByText("362 URLs in sitemap")).toBeVisible();
    expect(within(card).getByText(/robots.txt/)).toHaveTextContent(
      "robots.txt: Active",
    );
    expect(screen.queryByText(/before going live/)).not.toBeInTheDocument();
  });

  it("shows the real IndexNow key, key-file check and last error instead of a placeholder", async () => {
    renderPage();
    const card = (
      await screen.findByRole("heading", { name: "IndexNow" })
    ).closest("section") as HTMLElement;
    expect(await within(card).findByText(KEY)).toBeInTheDocument();
    expect(card).not.toHaveTextContent("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6");
    expect(await within(card).findByText("Key file served")).toBeVisible();
    expect(
      within(card).getByText("Set up, but no URLs sent yet"),
    ).toBeVisible();
    expect(within(card).getByText(/IndexNow key missing/)).toBeVisible();
    expect(within(card).getByText(/0 URLs received/)).toBeVisible();
    expect(h.invoke).toHaveBeenCalledWith("submit-indexnow", {
      body: { status: true },
    });
  });

  it("reports last submission time and count once URLs have been received", async () => {
    h.indexnow = {
      key: KEY,
      received_total: 362,
      last_submission_at: "2026-09-24T08:00:00Z",
      last_submission_count: 362,
      last_error_at: null,
      last_error: null,
    };
    renderPage();
    const card = (
      await screen.findByRole("heading", { name: "IndexNow" })
    ).closest("section") as HTMLElement;
    expect(await within(card).findByText("Sending new pages")).toBeVisible();
    expect(within(card).getByText(/362 URLs received/)).toBeVisible();
    expect(within(card).getByText(/Last run sent 362 URLs/)).toBeVisible();
  });
});
