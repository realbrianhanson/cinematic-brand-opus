import { createServerFn } from "@tanstack/react-start";
import { createPublicServerClient } from "./publicData.server";
import { buildRuntimeConfig } from "@/config/runtime";
import { siteConfig } from "@/config/site";
/** Per-request immutable config; never share a mutable brand across SSR requests. */
export const getSiteBranding = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await createPublicServerClient()
      .from("site_branding")
      .select("settings")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error("Site branding could not be loaded");
    return data ? buildRuntimeConfig(data.settings) : siteConfig;
  },
);
