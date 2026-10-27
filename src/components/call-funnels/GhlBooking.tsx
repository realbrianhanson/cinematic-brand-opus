import { useEffect } from "react";
import type { CallContact } from "../../../supabase/functions/_shared/callFunnels";
import {
  ghlBookingWidgetId,
  ghlEmbedUrl,
} from "../../../supabase/functions/_shared/ghlBooking";

/** GHL's own embed script sizes the frame to its content. */
function loadEmbedScript(origin: string) {
  const src = `${origin}/js/form_embed.js`;
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
  const origin = new URL(url).origin;
  useEffect(() => loadEmbedScript(origin), [origin]);
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
