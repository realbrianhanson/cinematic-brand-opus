import { useEffect } from "react";
import type { CallContact } from "../../../supabase/functions/_shared/callFunnels";
import {
  ghlBookingWidgetId,
  ghlEmbedUrl,
} from "../../../supabase/functions/_shared/ghlBooking";

/**
 * GHL's own embed script sizes the frame to its content. It is pinned to
 * GHL's host rather than taken from the funnel's booking link, so config can
 * never choose which script runs on the page.
 */
const EMBED_SCRIPT = "https://link.msgsndr.com/js/form_embed.js";

function loadEmbedScript() {
  const src = EMBED_SCRIPT;
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  document.body.appendChild(script);
}

export default function GhlBooking({
  url,
  contact,
  phone,
}: {
  url: string;
  contact: CallContact | null;
  phone?: string;
}) {
  useEffect(loadEmbedScript, []);
  return (
    <iframe
      id={`${ghlBookingWidgetId(url)}_cf`}
      className="cf-ghl"
      src={ghlEmbedUrl(url, contact, phone)}
      title="Choose a call time"
      scrolling="no"
      allow="payment"
    />
  );
}
