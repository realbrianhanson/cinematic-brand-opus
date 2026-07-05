import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";

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
    const [, label, href] = m;
    if (/^https?:\/\//i.test(href)) {
      out.push(
        <a
          key={`ml-${key++}`}
          href={href}
          target="_blank"
          rel="noopener nofollow"
          style={{ color: "#D4AF55", textDecoration: "underline" }}
        >
          {label}
        </a>,
      );
    } else {
      out.push(
        <Link
          key={`ml-${key++}`}
          to={href}
          style={{ color: "#D4AF55", textDecoration: "underline" }}
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
