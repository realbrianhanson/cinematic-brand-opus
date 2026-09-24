import { createFileRoute } from "@tanstack/react-router";
import { normalizeSiteUrl } from "@/lib/newsletterConfig";
import {
  handleUnsubscribeGet,
  handleUnsubscribePost,
  type UnsubscribeStore,
} from "@/lib/newsletterUnsubscribe";

async function createStore(): Promise<UnsubscribeStore> {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  return {
    async siteUrl() {
      const { data: settings } = await supabaseAdmin
        .from("site_settings")
        .select("site_url")
        .limit(1)
        .maybeSingle();
      return normalizeSiteUrl(settings?.site_url);
    },
    async unsubscribe(token) {
      const { data: row, error: readError } = await supabaseAdmin
        .from("newsletter_subscribers")
        .select("id, status")
        .eq("confirm_token", token)
        .maybeSingle();
      if (readError) return "error";
      // Suppressed rows keep their status; only active ones move to unsubscribed.
      if (!row || (row.status !== "confirmed" && row.status !== "pending"))
        return "ok";
      const { error: updateError } = await supabaseAdmin
        .from("newsletter_subscribers")
        .update({
          status: "unsubscribed",
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("confirm_token", token)
        .in("status", ["confirmed", "pending"]);
      return updateError ? "error" : "ok";
    },
  };
}

// GET only shows a confirmation page (link scanners must not unsubscribe
// readers); POST performs the change, including RFC 8058 one-click requests.
export const Route = createFileRoute("/api/public/newsletter/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        handleUnsubscribeGet(request, await createStore()),
      POST: async ({ request }) =>
        handleUnsubscribePost(request, await createStore()),
    },
  },
});
