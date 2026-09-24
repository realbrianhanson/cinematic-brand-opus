import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type ContentOfferScope = "page" | "content_type" | "niche" | "default";
export type ContentOfferRoute = {
  id: string;
  scope: ContentOfferScope;
  match_key: string;
  label: string;
  offer_id: string;
  headline: string;
  subtext: string;
  button_text: string;
  updated_at: string;
};
export type ContentOfferRouteInput = Omit<
  ContentOfferRoute,
  "id" | "updated_at"
>;

// Isolate the new migration contract from Lovable's regenerated schema types.
// Runtime validation below protects the public JSON boundary as well.
type RoutingDatabase = {
  public: {
    Tables: {
      content_offer_routes: {
        Row: ContentOfferRoute;
        Insert: ContentOfferRouteInput & { id?: string; updated_at?: string };
        Update: Partial<ContentOfferRouteInput>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      resolve_content_offer: {
        Args: {
          _page_key: string | null;
          _content_type_slug: string | null;
          _niche_slug: string | null;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
export const contentRoutingClient =
  supabase as unknown as SupabaseClient<RoutingDatabase>;

const slug = z
  .string()
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const resolvedSchema = z.object({
  route_id: z.string().uuid(),
  scope: z.enum(["page", "content_type", "niche", "default"]),
  offer_id: z.string().uuid(),
  slug,
  title: z.string().max(200),
  summary: z.string().max(1000),
  kind: z.enum(["free", "paid"]),
  headline: z.string().max(200),
  subtext: z.string().max(1000),
  button_text: z.string().max(80),
});
export type ResolvedContentOffer = z.infer<typeof resolvedSchema>;
export type ContentOfferContext = {
  pageId?: string;
  pageType?: string;
  contentTypeSlug?: string;
  nicheSlug?: string;
};

export function contentOfferArguments(context: ContentOfferContext) {
  const id = z.string().uuid().safeParse(context.pageId);
  const type = z
    .enum(["post", "generated", "pillar"])
    .safeParse(context.pageType);
  const contentType = slug.safeParse(context.contentTypeSlug);
  const niche = slug.safeParse(context.nicheSlug);
  return {
    _page_key:
      id.success && type.success
        ? `${type.data}:${id.data.toLowerCase()}`
        : null,
    _content_type_slug: contentType.success ? contentType.data : null,
    _niche_slug: niche.success ? niche.data : null,
  };
}

export function parseContentOffer(value: unknown): ResolvedContentOffer | null {
  const parsed = resolvedSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function resolveContentOffer(context: ContentOfferContext) {
  const { data, error } = await contentRoutingClient
    .rpc("resolve_content_offer", contentOfferArguments(context))
    .abortSignal(AbortSignal.timeout(8000));
  if (error) throw error;
  return parseContentOffer(data);
}

export function contentOfferCopy(offer: ResolvedContentOffer) {
  return {
    href: `/offers/${offer.slug}`,
    headline: offer.headline.trim() || offer.title,
    subtext: offer.subtext.trim() || offer.summary,
    buttonText:
      offer.button_text.trim() ||
      (offer.kind === "free" ? "Get the free resource" : "Explore this offer"),
  };
}
