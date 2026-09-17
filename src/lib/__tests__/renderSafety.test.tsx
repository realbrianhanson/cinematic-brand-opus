import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Asset,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { safeHtml } from "../safeHtml";
import { buildPageHead } from "../seoHead";
import Loader from "@/components/Loader";

describe("server rendering safety", () => {
  it("keeps rich article content and removes executable HTML without a DOM", () => {
    const content = `<h2 id="intro">Introduction</h2><p><strong>Useful</strong> copy</p><script>alert(1)</script><img src="https://example.com/image.png" onerror="alert(2)"><a href="javascript:alert(3)">Bad</a><iframe src="https://evil.test/"></iframe><iframe src="https://www.youtube-nocookie.com/embed/abc" title="Video"></iframe>`;
    const html = renderToStaticMarkup(
      <article dangerouslySetInnerHTML={{ __html: safeHtml(content) }} />,
    );
    expect(html).toContain('<h2 id="intro">Introduction</h2>');
    expect(html).toContain("<strong>Useful</strong>");
    expect(html).toContain("https://www.youtube-nocookie.com/embed/abc");
    expect(html).not.toMatch(/<script|onerror|javascript:|evil\.test/);
  });

  it("cannot break out of the real TanStack JSON-LD script renderer", () => {
    const data = {
      headline: '</script><script>alert("stored")</script>\u2028\u2029',
    };
    const script = buildPageHead({
      title: "Test",
      description: "Test",
      url: "https://example.com",
      jsonLd: [data],
    }).scripts[0];
    const router = createRouter({ routeTree: createRootRoute() });
    const html = renderToStaticMarkup(
      <RouterContextProvider router={router}>
        <Asset
          tag="script"
          attrs={{ type: script.type }}
          children={script.children}
        />
      </RouterContextProvider>,
    );
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toContain("</script><script>");
    expect(JSON.parse(script.children)).toEqual(data);
  });

  it("does not cover the no-JavaScript page with an opaque intro", () => {
    expect(renderToStaticMarkup(<Loader onComplete={() => {}} />)).toBe("");
  });
});
