export * from "../../supabase/functions/_shared/funnelJourneys";

/** Only this nonpersonal planner enum may cross the continuation URL. */
export function funnelInitialProject(
  value: unknown,
): "follow-up" | "inquiries" | "onboarding" | undefined {
  return value === "follow-up" ||
    value === "inquiries" ||
    value === "onboarding"
    ? value
    : undefined;
}
