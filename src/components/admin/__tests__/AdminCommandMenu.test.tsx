// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminCommandMenu from "../AdminCommandMenu";
import { rankCommands, scoreCommand } from "../commandSearch";
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/router-compat", () => ({ useNavigate: () => navigate }));
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const search = (value: string) =>
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
const pressEnter = () =>
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
describe("admin command navigation", () => {
  it("searches business destinations and closes before navigation", () => {
    const close = vi.fn();
    render(<AdminCommandMenu open onOpenChange={close} />);
    search("speaking");
    fireEvent.click(screen.getByRole("option", { name: "Speaking inquiries" }));
    expect(close).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith("/admin/inquiries");
  });
  it("offers separate article and product creation destinations", () => {
    render(<AdminCommandMenu open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("option", { name: "New offer" }));
    expect(navigate).toHaveBeenCalledWith("/admin/offers/new");
    expect(screen.getByRole("option", { name: "New article" })).toBeTruthy();
  });
  it("is labelled as page navigation, not a content search", () => {
    render(<AdminCommandMenu open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Go to page" })).toBeTruthy();
    expect(screen.getByRole("combobox").getAttribute("aria-label")).toBe(
      "Go to an admin page",
    );
  });
  it.each([
    ["niche", "/admin/niches"],
    ["pillar", "/admin/pillars"],
    ["password", "/admin/settings"],
    ["site config", "/admin/site-settings"],
    ["email", "/admin/site-settings"],
    ["topic guide", "/admin/pillars"],
    ["offer", "/admin/offers"],
    ["seo", "/admin/pseo-dashboard"],
  ])("Enter on %s opens the highlighted best match %s", (query, route) => {
    const close = vi.fn();
    render(<AdminCommandMenu open onOpenChange={close} />);
    search(query);
    const selected = screen
      .getAllByRole("option")
      .find((option) => option.getAttribute("aria-selected") === "true");
    expect(selected, query).toBeTruthy();
    pressEnter();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(route);
    expect(close).toHaveBeenCalledWith(false);
  });
  it("drops loose letter-scatter matches", () => {
    render(<AdminCommandMenu open onOpenChange={vi.fn()} />);
    search("niche");
    expect(
      screen.queryByRole("option", { name: "Search performance" }),
    ).toBeNull();
    search("pillar");
    expect(screen.queryByRole("option", { name: "Media library" })).toBeNull();
    search("zzqx");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No matching pages/)).toBeTruthy();
  });
});
describe("command ranking", () => {
  const entries = [
    { to: "/admin/offers/new", label: "New offer", group: "Create" },
    { to: "/admin/offers", label: "Offers & shop", group: "Business" },
    {
      to: "/admin/pseo-dashboard",
      label: "Search performance",
      group: "Business",
    },
    { to: "/admin/niches", label: "Audiences & niches", group: "Settings" },
  ];
  it("ranks label prefixes above word prefixes and keywords", () => {
    expect(rankCommands(entries, "offer").map((e) => e.to)).toEqual([
      "/admin/offers",
      "/admin/offers/new",
    ]);
    expect(scoreCommand(entries[2], "niche")).toBe(0);
    expect(scoreCommand(entries[3], "niche")).toBeGreaterThan(0);
  });
  it("keeps every entry, in order, for an empty query", () => {
    expect(rankCommands(entries, "  ")).toEqual(entries);
  });
});
