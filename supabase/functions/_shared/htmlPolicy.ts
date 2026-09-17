/** One allowlist for browser, server rendering and the crawler renderer. */
export const htmlPolicy = {
  allowedTags: [
    "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
    "pre", "code", "strong", "b", "em", "i", "u", "s", "del", "sub", "sup",
    "ul", "ol", "li", "a", "img", "figure", "figcaption", "div", "span",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
    "video", "source", "iframe",
  ],
  allowedAttributes: {
    "*": ["id", "class", "title"],
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading"],
    ol: ["start"], li: ["value"],
    th: ["colspan", "rowspan", "scope"], td: ["colspan", "rowspan"],
    video: ["src", "poster", "controls", "preload", "width", "height"],
    source: ["src", "type"],
    iframe: ["src", "title", "width", "height", "loading", "allowfullscreen"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["https", "http"], video: ["https", "http"], source: ["https", "http"], iframe: ["https"] },
  allowProtocolRelative: false,
  allowedIframeHostnames: ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"],
  allowIframeRelativeUrls: false,
  // An authored rel cannot opt back into opener access on external windows.
  transformTags: {
    a: (_tagName: string, attribs: Record<string, string>) => ({
      tagName: "a", attribs: { ...attribs, rel: "noopener noreferrer" },
    }),
  },
};
