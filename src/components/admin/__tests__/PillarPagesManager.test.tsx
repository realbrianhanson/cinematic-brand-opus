// @vitest-environment jsdom
import type React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({ toast: vi.fn(), invoke: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const result = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
    chain.then = (resolve: (r: unknown) => unknown) =>
      Promise.resolve(resolve({ data, error: null }));
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => result(table === "pillar_pages" ? [] : []),
      rpc: () =>
        result([{ id: "n1", name: "Roofers", slug: "roofers", context: {} }]),
      functions: { invoke: (...args: unknown[]) => h.invoke(...args) },
    },
  };
});

import PillarPagesManager from "../PillarPagesManager";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PillarPagesManager", () => {
  it("confirms before a niche chip generates a draft guide", async () => {
    h.invoke.mockResolvedValue({
      data: { success: true, score: 82, status: "draft" },
      error: null,
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <PillarPagesManager />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Generate: Roofers/ }),
    );
    expect(h.invoke).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Generate a topic guide for Roofers?"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith("generate-pillar", {
        body: { niche_id: "n1" },
      }),
    );
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Topic guide drafted" }),
      ),
    );
  });
});
