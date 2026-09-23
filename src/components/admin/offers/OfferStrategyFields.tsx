import type { OfferStrategy } from "@/lib/offerBuilder";

const questions = [
  [
    "audience",
    "Who is this for?",
    "Describe one buyer and the situation they are in.",
    2000,
  ],
  [
    "problem",
    "What is getting in their way?",
    "Use the words your customers use to describe the problem.",
    2000,
  ],
  [
    "outcome",
    "What will they be able to do?",
    "A concrete, realistic outcome makes a stronger promise.",
    2000,
  ],
  [
    "mechanism",
    "Why does your approach work?",
    "Explain the method, process, or tool that makes the result possible.",
    2000,
  ],
  [
    "deliverables",
    "What exactly do they receive?",
    "List the resources, formats, and access included in the offer.",
    3000,
  ],
  [
    "objections",
    "What might stop them?",
    "Capture questions about fit, price, effort, trust, or time.",
    3000,
  ],
  [
    "evidence",
    "What can you demonstrate?",
    "Add documented facts, examples, or results you can support.",
    3000,
  ],
  [
    "adMessage",
    "What brought them here?",
    "Paste the ad, email, or promise that sends visitors to this page.",
    2000,
  ],
] as const;

export default function OfferStrategyFields({
  value,
  onChange,
}: {
  value: OfferStrategy;
  onChange: (value: OfferStrategy) => void;
}) {
  return (
    <section className="admin-card space-y-5 p-5 md:p-6">
      <div>
        <p className="admin-eyebrow">01 · Strategy</p>
        <h2 className="text-xl font-semibold">
          Make the offer worth saying yes to
        </h2>
        <p className="admin-help mt-2">
          This private brief guides your copy and page structure. It is never
          shown to visitors.
        </p>
      </div>
      <label className="block text-sm font-medium">
        Where are visitors coming from?
        <select
          className="admin-input mt-2 w-full"
          value={value.traffic}
          onChange={(event) =>
            onChange({
              ...value,
              traffic: event.target.value as OfferStrategy["traffic"],
            })
          }
        >
          <option value="cold">Cold traffic / paid ads</option>
          <option value="email">Email audience</option>
          <option value="organic">Organic search / social</option>
          <option value="referral">A recommendation or referral</option>
          <option value="customer">Existing customers</option>
        </select>
      </label>
      {questions.map(([key, label, hint, maxLength]) => (
        <label key={key} className="block text-sm font-medium">
          {label}
          <textarea
            className="admin-input mt-2 w-full"
            rows={3}
            maxLength={maxLength}
            placeholder={hint}
            value={value[key]}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.value })
            }
          />
          <span className="admin-help mt-1 block">{hint}</span>
        </label>
      ))}
    </section>
  );
}
