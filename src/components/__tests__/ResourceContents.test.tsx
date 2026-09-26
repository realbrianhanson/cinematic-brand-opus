// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ResourceContents from "../ResourceContents";
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
it("links to actual unique headings and preserves authored anchors without IntersectionObserver", () => {
  render(
    <>
      <ResourceContents revision="one" />
      <div id="resource-reading-body">
        <h2 id="authored">Start here</h2>
        <h2>Start here</h2>
        <h3>Check the result</h3>
      </div>
    </>,
  );
  const links = screen.getAllByRole("link");
  expect(links[0].getAttribute("href")).toBe("#authored");
  expect(new Set(links.map((link) => link.getAttribute("href"))).size).toBe(3);
  for (const link of links)
    expect(
      document.getElementById(
        decodeURIComponent(link.getAttribute("href")!.slice(1)),
      ),
    ).not.toBeNull();
});
it("restores a shared section location after generated headings become available", () => {
  window.history.replaceState(null, "", "/#resource-section-second");
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  render(
    <>
      <ResourceContents revision="two" />
      <div id="resource-reading-body">
        <h2>First</h2>
        <h2>Second</h2>
      </div>
    </>,
  );
  expect(scroll).toHaveBeenCalledWith({ block: "start" });
});

it("updates links and anchors when a renderer filters or replaces headings", async () => {
  const view = (labels: string[]) => (
    <>
      <ResourceContents revision="same" />
      <div id="resource-reading-body">
        {labels.map((label, index) => (
          <h3 key={index}>{label}</h3>
        ))}
      </div>
    </>
  );
  const { rerender } = render(view(["First", "Second", "Third"]));
  const third = screen
    .getByRole("link", { name: "Third" })
    .getAttribute("href");
  rerender(view(["Second", "Third"]));
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: "First" })).toBeNull(),
  );
  expect(screen.getByRole("link", { name: "Third" }).getAttribute("href")).toBe(
    third,
  );
  for (const link of screen.getAllByRole("link"))
    expect(
      document.getElementById(
        decodeURIComponent(link.getAttribute("href")!.slice(1)),
      )?.textContent,
    ).toBe(link.textContent);
  rerender(view([]));
  await waitFor(() =>
    expect(
      screen.queryByRole("navigation", { name: "On this page" }),
    ).toBeNull(),
  );
});
