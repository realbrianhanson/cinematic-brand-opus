import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import IdeaListRenderer from "@/components/renderers/IdeaListRenderer";
import ChecklistRenderer from "@/components/renderers/ChecklistRenderer";
import FAQRenderer from "@/components/renderers/FAQRenderer";
import GuideRenderer from "@/components/renderers/GuideRenderer";
import TemplateRenderer from "@/components/renderers/TemplateRenderer";
import ToolRoundupRenderer from "@/components/renderers/ToolRoundupRenderer";
const renderers = [
  IdeaListRenderer,
  ChecklistRenderer,
  FAQRenderer,
  GuideRenderer,
  TemplateRenderer,
  ToolRoundupRenderer,
];
describe("resource renderer input boundaries", () => {
  it.each(renderers)(
    "renders malformed custom JSON without throwing (%#)",
    (Renderer) => {
      expect(() =>
        renderToStaticMarkup(
          <Renderer
            pageId="qa"
            nicheName="Care"
            contentJson={{ sections: "wrong", pro_tips: 123 }}
          />,
        ),
      ).not.toThrow();
    },
  );
  it.each(renderers)(
    "preserves valid titles in each resource format (%#)",
    (Renderer) => {
      const html = renderToStaticMarkup(
        <Renderer
          pageId="qa"
          nicheName="Care"
          contentJson={{
            sections: [
              {
                title: "Getting started",
                items: [
                  {
                    title: "Useful advice",
                    question: "Useful advice",
                    answer: "A useful answer",
                    description: "Practical guidance.",
                  },
                ],
              },
            ],
            pro_tips: ["Start small"],
          }}
        />,
      );
      expect(html).toContain("Useful advice");
      expect(html).toContain("Start small");
    },
  );
});
