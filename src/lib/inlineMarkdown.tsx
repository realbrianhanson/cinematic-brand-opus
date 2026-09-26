import { safeHref } from "@/lib/newsMarkdown";
import { Fragment, type ReactNode } from "react";
import { Link } from "@/lib/router-compat";

// Render inline markdown links [text](url) as real anchors inside a text string.
// Internal (leading-slash) links use react-router; external links open in a new tab.
export function renderInlineMarkdown(text: unknown): ReactNode {
  if (text === null || text === undefined) return null;
  const str = String(text);
  const re = /\[([^\]]+)\]\((\/[^)\s]+|https?:\/\/[^)\s]+)\)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) out.push(str.slice(last, m.index));
    const [, label, rawHref] = m;
    const href = safeHref(rawHref);
    if (!href) {
      out.push(label);
      last = m.index + m[0].length;
      continue;
    }
    if (/^https?:\/\//i.test(href)) {
      out.push(
        <a
          key={`ml-${key++}`}
          href={href}
          target="_blank"
          rel="noopener nofollow"
          style={{
            color: "var(--site-accent-ink, var(--brand-accent))",
            textDecoration: "underline",
          }}
        >
          {label}
        </a>,
      );
    } else {
      out.push(
        <Link
          key={`ml-${key++}`}
          to={href}
          style={{
            color: "var(--site-accent-ink, var(--brand-accent))",
            textDecoration: "underline",
          }}
        >
          {label}
        </Link>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push(str.slice(last));
  return <Fragment>{out}</Fragment>;
}
