// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ContentTypeList from "../ContentTypeList";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/publicData.functions", () => ({
  getPublicContentType: mocks.load,
}));
vi.mock("@/lib/router-compat", () => ({
  useParams: () => ({ contentType: "guides" }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PublicCTA", () => ({ default: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const result = {
  schema: { name: "Guides" },
  pages: [{ id: "one", slug: "first", title: "A useful guide" }],
  niches: [],
  page: 1,
  niche: "",
  nextPage: 2,
};
it("offers a working retry after an initial category load fails", async () => {
  mocks.load
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(result);
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <ContentTypeList />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("heading", { name: "A useful guide" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("link", { name: "Next page →" })).toHaveAttribute(
    "href",
    "/resources/guides?page=2",
  );
});
