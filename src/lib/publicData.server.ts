/**
 * Server-only Supabase client for PUBLIC, published-only reads during SSR.
 *
 * - Publishable (anon) key only. RLS decides what is visible; there is no
 *   service-role access and no user session here.
 * - Created per call, `persistSession: false`, so no auth state is ever cached
 *   across requests on the shared worker.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function createPublicServerClient() {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) {
    throw new Error("Public Supabase configuration is unavailable");
  }

  return createClient<Database>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      // Opaque sb_* keys are not JWTs; PostgREST rejects them as bearer tokens.
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (
          key.startsWith("sb_") &&
          headers.get("Authorization") === `Bearer ${key}`
        ) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input as RequestInfo, { ...init, headers });
      },
    },
  });
}

export const SITE_SETTINGS_PUBLIC_COLUMNS =
  "id, site_name, site_url, author_name, author_title, author_bio, author_credentials, author_social_links, cta_url, cta_headline, cta_subtext, cta_button_text, cta_social_proof, publisher_name, publisher_url, updated_at";
