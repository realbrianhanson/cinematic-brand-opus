// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SiteChat from "@/components/SiteChat";
vi.mock("@/components/SiteChatPanel", () => ({
  default: () => <section id="site-chat-panel">Chat panel</section>,
}));
afterEach(cleanup);
describe("compact mobile help", () => {
  it("keeps a named icon trigger on phones and opens/closes help by keyboard", async () => {
    render(<SiteChat />);
    const trigger = screen.getByRole("button", { name: "Ask a question" });
    expect(trigger.querySelector("span")?.className).toContain(
      "hidden sm:inline",
    );
    fireEvent.click(trigger);
    expect(await screen.findByText("Chat panel")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Close chat" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Chat panel")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
