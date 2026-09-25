import { useRouterState } from "@tanstack/react-router";
import SiteChat from "@/components/SiteChat";
import { readPresentation } from "@/lib/offerBuilder";

/** Subscribe to navigation because the chat is a sibling of the route outlet. */
export default function PublicSiteChat() {
  const { pathname, matches } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      matches: state.matches,
    }),
  });
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/offers/preview/") ||
    pathname.replace(/\/+$/, "") === "/first-ai-build"
  )
    return null;
  const offerMatch = matches.find((match) => match.routeId === "/offers/$slug");
  const offerData = offerMatch?.loaderData as
    { offer?: { presentation?: unknown } } | undefined;
  if (readPresentation(offerData?.offer?.presentation)?.landing.focusMode)
    return null;
  return <SiteChat />;
}
