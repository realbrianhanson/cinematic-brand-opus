import { withTimeout } from "@/lib/withTimeout";
import { supabase } from "@/integrations/supabase/client";
import {
  parseFunnelGraph,
  type FunnelGraph,
  type FunnelOffer,
  type FunnelSession,
} from "@/lib/funnelJourneys";
const database = supabase;
export type FunnelDraft = {
  id: string;
  slug: string;
  title: string;
  draft_graph: FunnelGraph;
  version: number;
  published_version: number | null;
  active: boolean;
  updated_at: string;
};
export type FunnelMetadata = { slug: string; title: string; revision: number };
export type FunnelSave = {
  id: string;
  slug: string;
  title: string;
  graph: FunnelGraph;
  expectedVersion: number;
  publish: boolean;
  active: boolean;
  requestId: string;
};
export async function listFunnelJourneys(): Promise<FunnelDraft[]> {
  const { data, error } = await withTimeout(
    Promise.resolve(
      database
        .from("funnel_journeys")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100)
        .abortSignal(AbortSignal.timeout(15000)),
    ),
  );
  if (error) throw error;
  return (data ?? []) as FunnelDraft[];
}
export async function listFunnelOffers(): Promise<FunnelOffer[]> {
  const { data, error } = await withTimeout(
    Promise.resolve(
      database
        .from("offers")
        .select("id,slug,title,checkout_mode")
        .eq("status", "published")
        .eq("funnel_only", false)
        .order("title")
        .limit(500)
        .abortSignal(AbortSignal.timeout(15000)),
    ),
  );
  if (error) throw error;
  return (data ?? []) as FunnelOffer[];
}
export async function saveFunnelJourney(
  input: FunnelSave,
): Promise<FunnelDraft> {
  parseFunnelGraph(input.graph);
  const { data, error } = await withTimeout(
    Promise.resolve(
      database.rpc("funnel_journey_save", {
        _id: input.id,
        _slug: input.slug,
        _title: input.title.trim(),
        _graph: input.graph,
        _expected_version: input.expectedVersion,
        _publish: input.publish,
        _active: input.active,
        _request_id: input.requestId,
      }),
    ),
  );
  if (error) {
    if (/revision conflict/.test(error.message))
      throw new Error(
        "Another administrator saved this journey. Reload before making further changes.",
      );
    if (/Offer target/.test(error.message))
      throw new Error(
        "Every offer destination must be published and available to public visitors.",
      );
    throw new Error(
      "The journey could not be saved. Check your connection and retry the same save, or reload.",
    );
  }
  return data as FunnelDraft;
}
async function callJourney<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("funnel-journey-api", { body }),
  );
  if (error) {
    let message = "This journey could not be loaded. Please try again.";
    if (error.context instanceof Response) {
      try {
        const detail = await withTimeout(error.context.json(), 2000);
        if (
          detail &&
          typeof detail === "object" &&
          "error" in detail &&
          typeof detail.error === "string"
        )
          message = detail.error;
      } catch {
        /* retain safe message */
      }
    }
    throw new Error(message);
  }
  return data as T;
}
export const getFunnelJourney = (slug: string) =>
  callJourney<FunnelMetadata | null>({ action: "get", slug });
export const startFunnelJourney = (slug: string, token: string) =>
  callJourney<FunnelSession>({ action: "start", slug, token });
export const loadFunnelSession = (token: string) =>
  callJourney<FunnelSession>({ action: "state", token });
export const advanceFunnelJourney = (
  token: string,
  session: FunnelSession,
  requestId: string,
  answer?: string,
) =>
  callJourney<FunnelSession>({
    action: "advance",
    token,
    stepId: session.step.id,
    expectedVersion: session.version,
    requestId,
    ...(answer === undefined ? {} : { answer }),
  });
export function newFunnelToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
