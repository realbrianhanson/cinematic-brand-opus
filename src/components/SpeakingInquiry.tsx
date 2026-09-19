import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Copy } from "lucide-react";

interface SpeakingInquiryProps {
  href: string;
}

function destination(href: string) {
  try {
    if (!/^mailto:/i.test(href)) return null;
    const [rawRecipient, query = ""] = href.slice(7).split("?");
    const recipient = decodeURIComponent(rawRecipient);
    // Keep the configured recipient, but never carry arbitrary email headers
    // or control characters into the visitor's email application.
    if (
      /\p{Cc}/u.test(recipient) ||
      !/^[^\s@<>?,;:%]+@[^\s@<>?,;:%]+\.[^\s@<>?,;:%]+$/.test(recipient)
    )
      return null;
    const rawSubject = new URLSearchParams(query).get("subject");
    const subject = (rawSubject || "Speaking inquiry")
      .replace(/\p{Cc}/gu, " ")
      .slice(0, 100);
    return { recipient, subject };
  } catch {
    return null;
  }
}

const fieldClass =
  "mt-2 w-full rounded-sm border border-white/20 bg-white/[0.04] px-3 py-2.5 text-base text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]";

export default function SpeakingInquiry({ href }: SpeakingInquiryProps) {
  const target = destination(href);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const copyRef = useRef<HTMLTextAreaElement>(null);

  if (!target) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const read = (key: string, max: number) =>
      String(values.get(key) ?? "")
        .replace(/\p{Cc}/gu, (character) =>
          character === "\n" || character === "\t" ? character : "",
        )
        .trim()
        .slice(0, max);
    const name = read("name", 80);
    const email = read("email", 120);
    const eventName = read("event", 120);
    if (!name || !eventName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus(
        "Please add your name, a valid email address, and the event name.",
      );
      return;
    }
    const body = [
      "Speaking inquiry",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Event: ${eventName}`,
      `Date: ${read("date", 80) || "To be confirmed"}`,
      `Audience: ${read("audience", 120) || "To be confirmed"}`,
      "",
      read("details", 700) || "I'd like to discuss a keynote or workshop.",
    ].join("\n");
    setDraft(`To: ${target.recipient}\nSubject: ${target.subject}\n\n${body}`);
    setStatus(
      "Review and send the draft in your email app. This form has not sent a message. If no email app opens, copy the draft below.",
    );
    try {
      window.location.assign(
        `mailto:${encodeURIComponent(target.recipient).replace("%40", "@")}?subject=${encodeURIComponent(target.subject)}&body=${encodeURIComponent(body)}`,
      );
    } catch {
      setStatus(
        "Copy the draft below and send it from your email app. This form has not sent a message.",
      );
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setStatus(
        "Draft copied. Paste it into your email app and send it when ready.",
      );
    } catch {
      copyRef.current?.focus();
      copyRef.current?.select();
      setStatus(
        "Select and copy the draft below, then paste it into your email app.",
      );
    }
  };

  return (
    <div className="rounded-sm border border-white/15 bg-white/[0.025] p-5 sm:p-7">
      <h3 className="font-display text-2xl text-white">
        Tell us about your event
      </h3>
      <p
        id="speaking-inquiry-help"
        className="mt-2 text-sm leading-relaxed text-white/75"
      >
        A few details will help us discuss the right session for your audience.
        This opens a draft in your email app for you to review and send.
      </p>
      <form
        onSubmit={submit}
        onChange={() => {
          setDraft("");
          setStatus("");
        }}
        aria-describedby="speaking-inquiry-help"
        className="mt-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-white/85">
            Your name <span className="text-white/60">(required)</span>
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              className={fieldClass}
            />
          </label>
          <label className="text-sm text-white/85">
            Email <span className="text-white/60">(required)</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={120}
              className={fieldClass}
            />
          </label>
          <label className="text-sm text-white/85">
            Event name <span className="text-white/60">(required)</span>
            <input
              name="event"
              required
              maxLength={120}
              className={fieldClass}
            />
          </label>
          <label className="text-sm text-white/85">
            Date or timeframe
            <input
              name="date"
              maxLength={80}
              placeholder="A date, month, or flexible"
              className={fieldClass}
            />
          </label>
          <label className="text-sm text-white/85 sm:col-span-2">
            Who will be in the room?
            <input
              name="audience"
              maxLength={120}
              placeholder="Audience, approximate size, and location"
              className={fieldClass}
            />
          </label>
          <label className="text-sm text-white/85 sm:col-span-2">
            What would you like them to take away?
            <textarea
              name="details"
              rows={3}
              maxLength={700}
              className={`${fieldClass} resize-y`}
            />
          </label>
        </div>
        <button
          type="submit"
          className="mt-5 inline-flex items-center gap-2 rounded-sm bg-[var(--brand-accent)] px-5 py-3 font-body text-sm font-bold text-[var(--brand-backdrop)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
        >
          Open email draft <ArrowUpRight size={17} aria-hidden="true" />
        </button>
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-sm leading-relaxed text-white/80"
        >
          {status}
        </p>
      </form>
      {draft && (
        <div className="mt-5 border-t border-white/15 pt-5">
          <label className="text-sm text-white/85">
            Your email draft
            <textarea
              ref={copyRef}
              value={draft}
              readOnly
              rows={7}
              className={`${fieldClass} resize-y`}
            />
          </label>
          <button
            type="button"
            onClick={copyDraft}
            className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--brand-accent-light)] underline underline-offset-4"
          >
            <Copy size={15} aria-hidden="true" /> Copy draft
          </button>
        </div>
      )}
    </div>
  );
}
