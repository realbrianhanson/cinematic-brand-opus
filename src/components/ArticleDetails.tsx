import { useSiteConfig } from "@/config/SiteConfigContext";
import type { PublicSiteSettings } from "@/lib/publicTypes";
import { articleSources } from "@/lib/articleReading";
export function ArticleContents({
  headings,
}: {
  headings: { id: string; title: string; level: number }[];
}) {
  if (headings.length < 3) return null;
  return (
    <nav aria-label="On this page" className="article-contents">
      <details open>
        <summary>On this page</summary>
        <ol>
          {headings.map((h) => (
            <li
              key={h.id}
              className={h.level === 3 ? "article-subheading" : ""}
            >
              <a href={`#${h.id}`}>{h.title}</a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
export function ArticleDetails({
  settings,
  sources,
}: {
  settings?: PublicSiteSettings | null;
  sources?: unknown;
}) {
  const config = useSiteConfig();
  const links = articleSources(sources);
  return (
    <aside className="article-details">
      {links.length > 0 && (
        <section aria-label="Sources">
          <h2>Sources & further reading</h2>
          <ul>
            {links.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="About the author">
        <h2>About {settings?.author_name || config.identity.name}</h2>
        {settings?.author_bio && <p>{settings.author_bio}</p>}
        {settings?.author_credentials?.length ? (
          <p>{settings.author_credentials.join(" · ")}</p>
        ) : null}
        <a href="/">About the author →</a>
      </section>
    </aside>
  );
}
