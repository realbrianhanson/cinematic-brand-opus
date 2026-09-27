import { callUrl } from "../../../supabase/functions/_shared/callFunnels";

/** Only construct embeds on known providers; preserve Vimeo unlisted access hashes. */
export function callVideoEmbed(raw: string): string | null {
  if (!raw || !callUrl(raw)) return null;
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
    ].includes(host)
  ) {
    const id =
      host === "youtu.be"
        ? url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1]
        : url.pathname.match(/^\/embed\/([\w-]{11})\/?$/)?.[1] ||
          (url.pathname === "/watch" ? url.searchParams.get("v") : null);
    return id && /^[\w-]{11}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : null;
  }
  if (!["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host))
    return null;
  const match =
    host === "player.vimeo.com"
      ? url.pathname.match(/^\/video\/(\d+)\/?$/)
      : url.pathname.match(/^\/(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/);
  if (!match) return null;
  const hash = url.searchParams.get("h") || match[2];
  if (hash && !/^[a-zA-Z0-9]{6,64}$/.test(hash)) return null;
  return `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${encodeURIComponent(hash)}` : ""}`;
}
