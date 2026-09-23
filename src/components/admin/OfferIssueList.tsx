import { ArrowRight } from "lucide-react";
import {
  offerStepTitles,
  type OfferIssue,
  type OfferStep,
} from "@/lib/offerBuilderValidation";

/** Each problem with a button that opens the builder step that fixes it. */
export default function OfferIssueList({
  issues,
  onGo,
}: {
  issues: OfferIssue[];
  onGo: (step: OfferStep) => void;
}) {
  if (!issues.length) return null;
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {issues.map((issue) => (
        <li
          key={`${issue.field}-${issue.message}`}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
        >
          <span>
            <strong>{issue.field}:</strong> {issue.message}
          </span>
          <button
            type="button"
            className="admin-btn-ghost shrink-0"
            onClick={() => onGo(issue.step)}
          >
            Go to {offerStepTitles[issue.step]}
            <ArrowRight size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
