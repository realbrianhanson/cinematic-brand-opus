/** Checkout and delivery checks live in OfferLaunchReadiness. */
export default function OfferJourneyReadiness({
  external,
  hasFollowUp,
  followUpStatus,
}: {
  external: boolean;
  hasFollowUp: boolean;
  followUpStatus?: string;
}) {
  if (external || !hasFollowUp || followUpStatus === "published") return null;
  return (
    <p className="admin-help" role="status">
      {followUpStatus
        ? "Your selected follow-up is not published, so it will not appear for visitors."
        : "The selected follow-up’s publication status could not be verified. Check it in Next step before sharing."}
    </p>
  );
}
