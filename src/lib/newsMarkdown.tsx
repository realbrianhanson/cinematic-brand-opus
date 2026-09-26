import { Fragment, type ReactNode } from "react";

// Safe renderer for AI-generated news markdown.
//
// No HTML string is ever produced, so there is no dangerouslySetInnerHTML sink
// and nothing to sanitize after the fact: headings, paragraphs, bold spans and
// links become real React elements, and every href goes through an explicit
// scheme allowlist. Pure + SSR safe (no DOM access).

import { safeHref } from "../../supabase/functions/_shared/safeHref";
export { safeHref } from "../../supabase/functions/_shared/safeHref";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Bold and links, processed in one pass.
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i++}`}>{m[1]}</strong>);
    } else {
      const label = m[2] ?? "";
      const href = safeHref(m[3]);
      if (href) {
        nodes.push(
          <a
            key={`${keyPrefix}-a${i++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{
              color: "var(--site-accent-ink, var(--brand-accent))",
              textDecoration: "underline",
            }}
          >
            {label}
          </a>,
        );
      } else {
        // Unsafe or unusable URL: keep the label as plain text.
        nodes.push(<Fragment key={`${keyPrefix}-t${i++}`}>{label}</Fragment>);
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const H_STYLE = {
  fontFamily: "'Instrument Serif', serif",
  fontStyle: "italic" as const,
  color: "var(--site-ink, #fff)",
  margin: "2em 0 0.8em",
};

/** Renders a markdown string as React elements. */
export function renderNewsMarkdown(md: unknown): ReactNode {
  if (typeof md !== "string" || !md.trim()) return null;
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let k = 0;

  const flush = () => {
    if (!para.length) return;
    const text = para.join(" ").trim();
    blocks.push(
      <p
        key={`p${k}`}
        style={{
          margin: "0 0 1.2em 0",
          fontSize: 17,
          lineHeight: 1.8,
          color: "var(--site-text-90, rgba(255,255,255,0.9))",
        }}
      >
        {renderInline(text, `p${k}`)}
      </p>,
    );
    k++;
    para = [];
  };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      blocks.push(
        <h3 key={`h${k++}`} style={{ ...H_STYLE, fontSize: 22 }}>
          {renderInline(line.slice(4), `h${k}`)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      blocks.push(
        <h2 key={`h${k++}`} style={{ ...H_STYLE, fontSize: 28 }}>
          {renderInline(line.slice(3), `h${k}`)}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flush();
      blocks.push(
        <h2 key={`h${k++}`} style={{ ...H_STYLE, fontSize: 32 }}>
          {renderInline(line.slice(2), `h${k}`)}
        </h2>,
      );
      continue;
    }
    para.push(line);
  }
  flush();
  return <>{blocks}</>;
}
