// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminCommandMenu from "../AdminCommandMenu";
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
describe("admin command navigation", () => {
  it("searches business destinations and closes before navigation", () => {
    const close = vi.fn();
    render(<AdminCommandMenu open onOpenChange={close} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "speaking" },
    });
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
});
