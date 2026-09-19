import { useState } from "react";
import { Check, Copy } from "lucide-react";

const prompt = `Turn the notes below into a client follow-up draft.
Use only the supplied facts. Do not invent prices, deadlines, agreement, or promises.
Separate confirmed decisions from open questions. If a detail is missing, list it for me to check.
Write a short subject line and an email of no more than 120 words, ending with one clear question.
Then list the statements I should verify before sending.

NOTES:
- Fictional example: Maya runs a local landscaping business.
- She wants a simpler way to follow up after quote requests.
- We discussed a website inquiry form and a weekly review of incoming requests.
- I will send a rough outline by Thursday. No price or start date was agreed.
- Open question: who will review the inquiries each week?`;

export default function WorkflowDemonstration() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">(
    "idle",
  );
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }
  return (
    <section
      className="border-t border-white/15 pt-10"
      aria-labelledby="workflow-demo-heading"
    >
      <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--brand-accent)]">
        A worked example
      </p>
      <h2 id="workflow-demo-heading">
        From messy notes to a useful follow-up.
      </h2>
      <p className="mt-4 max-w-2xl text-white/75">
        This fictional scenario shows the method: provide the facts, ask for a
        bounded draft, and check it before sending. The example below is
        illustrative, not a customer result or a live AI response.
      </p>
      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-white/15 p-6">
          <h3 className="text-[var(--brand-accent)]">1. Give it the facts</h3>
          <p className="mt-4 text-white/80">
            Maya wants better follow-up after landscaping quote requests. You
            discussed an inquiry form and a weekly review. You promised an
            outline by Thursday. Nobody agreed on a price or start date.
          </p>
          <p className="mt-4 text-sm text-white/60">
            Missing detail: who will review the inquiries?
          </p>
        </div>
        <div className="rounded-xl border border-[var(--brand-accent)]/35 bg-[var(--brand-accent)]/5 p-6">
          <h3 className="text-[var(--brand-accent)]">
            2. Review a focused draft
          </h3>
          <p className="mt-4 font-semibold">
            Subject: Next step for your quote follow-up
          </p>
          <p className="mt-4 text-white/80">
            Hi Maya, thanks for walking me through your quote-request process.
            We discussed a website inquiry form and a weekly review of new
            requests. I’ll send a rough outline by Thursday.
          </p>
          <p className="mt-4 text-white/80">
            Who on your team would review the inquiries each week?
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-white/15 p-6">
        <h3>3. Check before sending</h3>
        <ul className="mt-4 grid gap-3 text-white/75 sm:grid-cols-2">
          {[
            "Is Thursday still the deadline you agreed?",
            "Is the name correct?",
            "Does the draft avoid inventing a price or start date?",
            "Is there one clear next step?",
          ].map((item) => (
            <li key={item} className="flex gap-3">
              <Check
                size={18}
                className="mt-1 shrink-0 text-[var(--brand-accent)]"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <details className="mt-5 rounded-xl border border-white/15 p-6">
        <summary className="cursor-pointer font-semibold text-[var(--brand-accent)]">
          Try the prompt with this fictional example
        </summary>
        <pre className="mt-5 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/80">
          {prompt}
        </pre>
        <button
          type="button"
          onClick={() => void copyPrompt()}
          className="mt-5 inline-flex items-center gap-2 rounded border border-white/30 px-4 py-3 text-sm font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
        >
          <Copy size={16} aria-hidden="true" />
          {copyState === "copied" ? "Prompt copied" : "Copy example prompt"}
        </button>
        <p aria-live="polite" className="mt-3 text-sm text-white/65">
          {copyState === "copied"
            ? "Paste it into an AI tool you use, then review the result."
            : copyState === "manual"
              ? "Copy is unavailable in this browser. Select and copy the prompt above."
              : "Use fictional or approved information. Check your AI tool’s data settings before entering real client details."}
        </p>
      </details>
    </section>
  );
}
