// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import EditorPreview, { ArticlePreviewBody } from "../EditorPreview";

afterEach(cleanup);

const YOUTUBE =
  '<div style="position:relative;padding-bottom:56.25%"><iframe src="https://www.youtube.com/embed/abc123" allowfullscreen="true" style="position:absolute;width:100%;height:100%"></iframe></div>';

describe("editor preview fidelity", () => {
  it("renders the body with the public article styles and sanitizer", () => {
    render(
      <ArticlePreviewBody
        title="How owners use AI"
        excerpt=""
        content={`<h2>Start here</h2><p>Hello<script>alert(1)</script></p>${YOUTUBE}`}
      />,
    );
    const body = document.querySelector(".blog-content") as HTMLElement;
    expect(body).toBeTruthy();
    expect(body.className).not.toMatch(/\bprose\b/);
    expect(body.innerHTML).not.toContain("<script");
    // articleReading adds the same heading anchors the live article uses
    expect(body.querySelector("h2")?.id).toBe("article-section-1");
  });

  it("shows YouTube embeds full width at 16:9", () => {
    render(<ArticlePreviewBody title="Video" excerpt="" content={YOUTUBE} />);
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
    const body = document.querySelector(".blog-content") as HTMLElement;
    expect(body.className).toContain("[&_iframe]:w-full");
    expect(body.className).toContain("[&_iframe]:aspect-video");
  });

  it("includes the TL;DR, cover image, takeaways and FAQ like the live page", () => {
    render(
      <ArticlePreviewBody
        title="T"
        excerpt="Summary"
        content="<p>Body</p>"
        tldr="Short answer"
        featuredImage="https://example.com/cover.png"
        featuredImageAlt="A laptop on a desk"
        keyTakeaways={["First point", " "]}
        faqItems={[{ question: "Why?", answer: "Because." }]}
      />,
    );
    expect(screen.getByText("Short answer")).toBeInTheDocument();
    expect(screen.getByAltText("A laptop on a desk")).toBeInTheDocument();
    expect(screen.getByText("First point")).toBeInTheDocument();
    expect(screen.getByText("Why?")).toBeInTheDocument();
  });

  it("links a saved draft to its on-site preview", () => {
    render(
      <EditorPreview
        title="T"
        excerpt=""
        content="<p>Body</p>"
        savedSlug="my-draft"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(
      screen.getByRole("link", { name: "Preview on site" }),
    ).toHaveAttribute("href", "/blog/my-draft");
  });
});
