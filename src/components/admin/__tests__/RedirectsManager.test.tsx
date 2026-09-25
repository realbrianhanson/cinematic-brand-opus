// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Call = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

const mock = vi.hoisted(() => ({
  calls: [] as Call[],
  tables: {} as Record<string, unknown[]>,
  writeError: null as null | { code: string; message: string },
}));

vi.mock("@/integrations/supabase/client", () => {
  function from(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    const run = () => {
      mock.calls.push(call);
      if (call.op === "select")
        return { data: mock.tables[table] ?? [], error: null };
      if (mock.writeError) return { data: null, error: mock.writeError };
      return { data: call.payload ?? null, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      },
      insert: (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return builder;
      },
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return builder;
      },
      delete: () => {
        call.op = "delete";
        return builder;
      },
      then: (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }
  return { supabase: { from } };
});

import RedirectsManager from "../RedirectsManager";

const RULES = [
  {
    id: "r1",
    from_path: "/my-story",
    to_path: "/about",
    status_code: 301,
    is_active: true,
    hits: 12,
    last_hit_at: "2026-09-22T10:00:00Z",
    note: null,
    created_at: "2026-09-23T00:00:00Z",
    updated_at: "2026-09-23T00:00:00Z",
  },
  {
    id: "r2",
    from_path: "/contact",
    to_path: "/speaking",
    status_code: 301,
    is_active: true,
    hits: 0,
    last_hit_at: null,
    note: null,
    created_at: "2026-09-23T00:00:00Z",
    updated_at: "2026-09-23T00:00:00Z",
  },
];
const MISSING = [
  {
    path: "/revven",
    hits: 3,
    first_seen: "2026-09-20T00:00:00Z",
    last_seen: "2026-09-21T00:00:00Z",
    last_referrer: null,
    last_user_agent_class: "bot",
  },
  {
    path: "/case-studies",
    hits: 41,
    first_seen: "2026-09-01T00:00:00Z",
    last_seen: "2026-09-22T00:00:00Z",
    last_referrer: "https://www.google.com/search",
    last_user_agent_class: "human",
  },
];

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RedirectsManager />
    </QueryClientProvider>,
  );
}

const writes = (op: Call["op"]) =>
  mock.calls.filter((c) => c.op === op && c.table === "redirect_rules");

beforeEach(() => {
  mock.calls = [];
  mock.writeError = null;
  mock.tables = {
    redirect_rules: RULES,
    not_found_hits: MISSING,
    posts: [{ slug: "ai-seo-guide", title: "AI SEO guide" }],
    pillar_pages: [{ slug: "ai-marketing", title: "AI marketing" }],
    generated_pages: [
      {
        slug: "roofers",
        title: "Prompts for roofers",
        content_schemas: { slug: "prompts" },
      },
    ],
    offers: [{ slug: "starter-kit", title: "Starter kit" }],
  };
});
afterEach(cleanup);

describe("RedirectsManager", () => {
  it("explains the automatic behaviour in plain English", async () => {
    mount();
    expect(
      screen.getByRole("heading", { level: 1, name: "Redirects" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Page not found screen unless a redirect rule is saved/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/add a rule when a better page exists/i),
    ).toBeInTheDocument();
    await screen.findByText("/case-studies");
    // Brian's copy rule: no paragraph ends with a period.
    for (const p of document.querySelectorAll("p")) {
      expect(p.textContent?.trim().endsWith("."), p.textContent ?? "").toBe(
        false,
      );
    }
  });

  it("lists missing pages by visits, busiest first", async () => {
    mount();
    const table = await screen.findByRole("table", { name: "Missing pages" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("/case-studies");
    expect(rows[0]).toHaveTextContent("41");
    expect(rows[0]).toHaveTextContent("www.google.com/search");
    expect(rows[1]).toHaveTextContent("/revven");
    expect(rows[1]).toHaveTextContent(/crawler/i);
  });

  it("creates a rule from a missing page in one step", async () => {
    mount();
    const table = await screen.findByRole("table", { name: "Missing pages" });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Redirect /case-studies to another page",
      }),
    );
    const input = screen.getByLabelText("Send visitors to");
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "/blog/ai-seo-guide" } });
    fireEvent.click(screen.getByRole("button", { name: "Save redirect" }));
    await waitFor(() => expect(writes("insert")).toHaveLength(1));
    expect(writes("insert")[0].payload).toEqual({
      from_path: "/case-studies",
      to_path: "/blog/ai-seo-guide",
      status_code: 301,
      note: null,
    });
  });

  it("checks the destination before saving", async () => {
    mount();
    const table = await screen.findByRole("table", { name: "Missing pages" });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Redirect /revven to another page",
      }),
    );
    fireEvent.change(screen.getByLabelText("Send visitors to"), {
      target: { value: "about" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save redirect" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Start with / for a page on this site",
    );
    expect(writes("insert")).toHaveLength(0);
  });

  it("shows database refusals in plain words", async () => {
    mock.writeError = {
      code: "22023",
      message:
        "That page already redirects somewhere else, so point this rule at the final page instead",
    };
    mount();
    const table = await screen.findByRole("table", { name: "Missing pages" });
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Redirect /revven to another page",
      }),
    );
    fireEvent.change(screen.getByLabelText("Send visitors to"), {
      target: { value: "/my-story" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save redirect" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already redirects somewhere else",
    );
  });

  it("offers published pages as suggestions", async () => {
    mount();
    await waitFor(() =>
      expect(
        document.querySelector('datalist option[value="/blog/ai-seo-guide"]'),
      ).not.toBeNull(),
    );
    for (const path of [
      "/",
      "/about",
      "/speaking",
      "/guides/ai-marketing",
      "/resources/prompts/roofers",
      "/offers/starter-kit",
    ])
      expect(
        document.querySelector(`datalist option[value="${path}"]`),
        path,
      ).not.toBeNull();
  });

  it("turns a rule off and on", async () => {
    mount();
    const table = await screen.findByRole("table", { name: "Redirect rules" });
    fireEvent.click(
      within(table).getByRole("switch", { name: "Rule for /contact is on" }),
    );
    await waitFor(() => expect(writes("update")).toHaveLength(1));
    expect(writes("update")[0].payload).toEqual({ is_active: false });
    expect(writes("update")[0].filters).toEqual([["id", "r2"]]);
  });

  it("edits a rule", async () => {
    mount();
    const table = await screen.findByRole("table", { name: "Redirect rules" });
    fireEvent.click(
      within(table).getByRole("button", { name: "Edit rule for /my-story" }),
    );
    fireEvent.change(screen.getByLabelText("Send visitors to"), {
      target: { value: "/speaking" },
    });
    fireEvent.change(screen.getByLabelText("Redirect type"), {
      target: { value: "302" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save redirect" }));
    await waitFor(() => expect(writes("update")).toHaveLength(1));
    expect(writes("update")[0].payload).toEqual({
      from_path: "/my-story",
      to_path: "/speaking",
      status_code: 302,
      note: null,
    });
    expect(writes("update")[0].filters).toEqual([["id", "r1"]]);
  });

  it("asks before deleting a rule", async () => {
    mount();
    const table = await screen.findByRole("table", { name: "Redirect rules" });
    fireEvent.click(
      within(table).getByRole("button", { name: "Delete rule for /my-story" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(writes("delete")).toHaveLength(0);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete rule" }),
    );
    await waitFor(() => expect(writes("delete")).toHaveLength(1));
    expect(writes("delete")[0].filters).toEqual([["id", "r1"]]);
  });

  it("adds a rule for any old address", async () => {
    mount();
    await screen.findByRole("table", { name: "Redirect rules" });
    fireEvent.click(screen.getByRole("button", { name: "Add a rule" }));
    fireEvent.change(screen.getByLabelText("Old address"), {
      target: { value: "/Social-Media/" },
    });
    fireEvent.change(screen.getByLabelText("Send visitors to"), {
      target: { value: "https://go.aiforbusiness.com/summit" },
    });
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Old social page" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save redirect" }));
    await waitFor(() => expect(writes("insert")).toHaveLength(1));
    expect(writes("insert")[0].payload).toEqual({
      from_path: "/social-media",
      to_path: "https://go.aiforbusiness.com/summit",
      status_code: 301,
      note: "Old social page",
    });
  });
});
