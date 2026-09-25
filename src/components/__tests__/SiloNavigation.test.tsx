import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SiloNavigation from "../SiloNavigation";

describe("server-rendered guide resource navigation", () => {
  it("renders valid format slugs that collide with object prototype names", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <SiloNavigation
          nicheId="topic-one"
          pillarTitle="Useful guide"
          initialPages={[
            {
              id: "resource-one",
              title: "A useful checklist",
              slug: "first-checklist",
              content_schemas: { name: "Checklists", slug: "constructor" },
            },
            {
              id: "resource-two",
              title: "A useful template",
              slug: "first-template",
              content_schemas: { name: "Templates", slug: "toString" },
            },
          ]}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain('href="/resources/constructor/first-checklist"');
    expect(html).toContain('href="/resources/toString/first-template"');
    expect(html).toContain("A useful checklist");
    client.clear();
  });
});
