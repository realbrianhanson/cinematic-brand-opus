import {
  parseContentDocument,
  type ContentDocument,
} from "@/lib/contentDocument";
import type { Json } from "@/integrations/supabase/types";
import { safeHref } from "@/lib/newsMarkdown";
import { renderInlineMarkdown } from "@/lib/inlineMarkdown";
import { getItemTitle } from "@/lib/itemTitle";
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { ProTips } from "./IdeaListRenderer";

const GuideRenderer = ({
  contentJson: rawContent,
  nicheName,
  pageId,
}: {
  contentJson: unknown;
  nicheName: string;
  pageId: string;
}) => {
  const contentJson = useMemo(
    () => parseContentDocument(rawContent),
    [rawContent],
  );
  const sections = contentJson?.sections || [];
  const mistakes = contentJson?.common_mistakes || [];
  return (
    <div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        {sections.map((section, i) => (
          <div key={i} id={`guide-section-${i}`} className="mb-12">
            <h2
              className="font-display mb-4"
              style={{ fontSize: 22, color: "#fff" }}
            >
              {section.title || section.heading}
            </h2>
            {section.content && (
              <p
                className="font-body mb-4"
                style={{
                  fontSize: 15,
                  color: "rgba(255,255,255,0.7)",
                  lineHeight: 1.8,
                }}
              >
                {section.content}
              </p>
            )}
            {section.key_points && Array.isArray(section.key_points) && (
              <ul className="flex flex-col gap-2 mb-4">
                {section.key_points.map((kp: string, ki: number) => (
                  <li
                    key={ki}
                    className="font-body flex items-start gap-2"
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.7)",
                      lineHeight: 1.6,
                    }}
                  >
                    <span
                      style={{ color: "var(--brand-accent)", marginTop: 2 }}
                    >
                      →
                    </span>{" "}
                    {kp}
                  </li>
                ))}
              </ul>
            )}
            {/* Section items (e.g. strategy-guides): show each as a card with h3 name */}
            {Array.isArray(section.items) && section.items.length > 0 && (
              <div className="flex flex-col gap-4 mt-4">
                {section.items.map((it, ii: number) => (
                  <div
                    key={ii}
                    className="p-5"
                    style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "#181820",
                    }}
                  >
                    <h3
                      className="font-body font-semibold mb-2"
                      style={{
                        fontSize: 19,
                        color: "rgba(255,255,255,0.95)",
                        lineHeight: 1.35,
                      }}
                    >
                      {getItemTitle(it)}
                    </h3>
                    {it.description && (
                      <p
                        className="font-body mb-2"
                        style={{
                          fontSize: 16,
                          color: "rgba(255,255,255,0.85)",
                          lineHeight: 1.6,
                        }}
                      >
                        {renderInlineMarkdown(it.description)}
                      </p>
                    )}
                    {it.expected_impact && (
                      <p
                        className="font-body"
                        style={{
                          fontSize: 13,
                          color: "var(--brand-accent-light)",
                        }}
                      >
                        {it.expected_impact}
                      </p>
                    )}
                    {it.pro_tip && (
                      <p
                        className="font-body mt-2"
                        style={{
                          fontSize: 13,
                          color: "rgba(255,255,255,0.6)",
                          fontStyle: "italic",
                        }}
                      >
                        Pro tip: {it.pro_tip}
                      </p>
                    )}
                    {it.difficulty && (
                      <span
                        className="font-body uppercase inline-block mt-2 px-2 py-0.5"
                        style={{
                          fontSize: 12,
                          letterSpacing: "0.1em",
                          background: "rgba(var(--brand-accent-rgb),0.14)",
                          color: "var(--brand-accent)",
                          border: "1px solid rgba(var(--brand-accent-rgb),0.4)",
                        }}
                      >
                        {it.difficulty}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Tool mentions */}
            {section.tools && Array.isArray(section.tools) && (
              <div className="flex flex-col gap-3 mt-4">
                {section.tools.map((tool, ti: number) => (
                  <div
                    key={ti}
                    className="p-4 flex items-start gap-3"
                    style={{
                      border: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div>
                      <h4
                        className="font-body font-semibold"
                        style={{ fontSize: 15, color: "rgba(255,255,255,0.9)" }}
                      >
                        {tool.name}
                      </h4>
                      {tool.description && (
                        <p
                          className="font-body mt-1"
                          style={{
                            fontSize: 13,
                            color: "rgba(255,255,255,0.7)",
                          }}
                        >
                          {renderInlineMarkdown(tool.description)}
                        </p>
                      )}
                      {safeHref(tool.link) && (
                        <a
                          href={safeHref(tool.link)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-body mt-1 inline-block hover:text-[var(--brand-accent)] transition-colors"
                          style={{ fontSize: 12, color: "var(--brand-accent)" }}
                        >
                          Visit →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Common Mistakes */}
        {mistakes.length > 0 && (
          <div className="mb-12">
            <h2
              className="font-display mb-6"
              style={{ fontSize: 22, color: "#fff" }}
            >
              Common Mistakes to Avoid
            </h2>
            <div className="flex flex-col gap-4">
              {mistakes.map((m, i) => (
                <div
                  key={i}
                  className="p-5 flex items-start gap-3"
                  style={{
                    borderLeft: "3px solid #F87171",
                    background: "rgba(248,113,113,0.04)",
                  }}
                >
                  <AlertTriangle
                    size={16}
                    className="shrink-0 mt-0.5"
                    style={{ color: "#F87171" }}
                  />
                  <div>
                    <h4
                      className="font-body font-semibold mb-1"
                      style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}
                    >
                      {m.title || m.mistake}
                    </h4>
                    <p
                      className="font-body"
                      style={{
                        fontSize: 13,
                        color: "rgba(255,255,255,0.7)",
                        lineHeight: 1.5,
                      }}
                    >
                      {m.description || m.why || m.explanation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <ProTips tips={contentJson?.pro_tips} />
      </div>
    </div>
  );
};

export default GuideRenderer;
