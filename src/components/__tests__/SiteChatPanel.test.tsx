// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SiteChatPanel from "../SiteChatPanel";

vi.mock("@/components/ai-elements/conversation", () => ({
  Conversation: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ConversationContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ConversationScrollButton: () => null,
}));
vi.mock("@/components/ai-elements/message", () => ({
  Message: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MessageContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MessageResponse: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/ai-elements/shimmer", () => ({
  Shimmer: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const requests: RequestInit[] = [];
const fetcher = vi.fn();
function pendingResponse(_url: unknown, init: RequestInit) {
  requests.push(init);
  return new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
}
async function ask(text = "How do I recover my download?") {
  fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Submit$/ }));
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
}
beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  fetcher.mockReset();
  fetcher.mockImplementation(pendingResponse);
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the real public chat panel and SDK lifecycle", () => {
  it("lets a visitor stop an in-flight answer", async () => {
    render(<SiteChatPanel onClose={() => {}} />);
    await ask();
    const stop = screen.getByRole("button", { name: /^Stop$/ });
    expect(stop).toBeEnabled();
    fireEvent.click(stop);
    await waitFor(() => expect(requests[0].signal?.aborted).toBe(true));
    await screen.findByText(/Response stopped/);
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Your question" }),
      ).toBeEnabled(),
    );
  });
  it("retries the failed question without adding a second user message", async () => {
    fetcher.mockImplementationOnce(async (_url, init) => {
      requests.push(init);
      throw new Error("offline");
    });
    render(<SiteChatPanel onClose={() => {}} />);
    await ask();
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry last question" }),
    );
    await waitFor(() => expect(requests).toHaveLength(2));
    const first = JSON.parse(String(requests[0].body));
    const second = JSON.parse(String(requests[1].body));
    expect(second.messages).toEqual(first.messages);
    expect(second.messages).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));
  });
  it("aborts the old response and clears it when starting a new conversation", async () => {
    render(<SiteChatPanel onClose={() => {}} />);
    await ask();
    fireEvent.click(
      screen.getByRole("button", { name: "Start a new conversation" }),
    );
    await waitFor(() => expect(requests[0].signal?.aborted).toBe(true));
    expect(
      screen.queryByText("How do I recover my download?"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Your question" }),
    ).toBeEnabled();
  });
  it("aborts network work on close and ignores malformed saved parts", async () => {
    localStorage.setItem(
      "site-chat-conversation-v1",
      JSON.stringify([{ id: "bad", role: "user", parts: [null] }]),
    );
    const view = render(<SiteChatPanel onClose={() => {}} />);
    await ask();
    view.unmount();
    await waitFor(() => expect(requests[0].signal?.aborted).toBe(true));
  });
});
