import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import {
  speakingEmailHref,
  submitSpeakingInquiry,
  type SpeakingInquiryInput,
} from "@/lib/speakingInquiries";
import { parseSpeakingInquiry } from "../../supabase/functions/_shared/speakingInquiries";
import FormPrivacyLink from "@/components/FormPrivacyLink";

interface SpeakingInquiryProps {
  href: string;
}
const fieldClass =
  "mt-2 w-full rounded-sm border border-white/20 bg-white/[0.04] px-3 py-2.5 text-base text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]";

export default function SpeakingInquiry({ href }: SpeakingInquiryProps) {
  const emailHref = speakingEmailHref(href);
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  const lastAttempt = useRef<{ signature: string; requestId: string } | null>(
    null,
  );
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (submitted || error) statusRef.current?.focus();
  }, [submitted, error]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current || submitted) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    setError("");
    pendingRef.current = true;
    setPending(true);
    try {
      const signature = JSON.stringify(values);
      if (!lastAttempt.current || lastAttempt.current.signature !== signature)
        lastAttempt.current = { signature, requestId: crypto.randomUUID() };
      const input: SpeakingInquiryInput = parseSpeakingInquiry({
        ...values,
        request_id: lastAttempt.current.requestId,
      });
      await submitSpeakingInquiry({
        ...input,
        website: String(values.website ?? ""),
      });
      setSubmitted(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "We couldn’t confirm your inquiry. Please try again",
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <div className="rounded-sm border border-white/15 bg-white/[0.025] p-5 sm:p-7">
      {submitted ? (
        <div
          ref={statusRef}
          tabIndex={-1}
          role="status"
          className="py-8 text-center outline-none"
        >
          <CheckCircle2
            size={36}
            aria-hidden="true"
            className="mx-auto text-[var(--brand-accent)]"
          />
          <h3 className="mt-5 font-display text-3xl text-white">
            Your inquiry is in
          </h3>
          <p className="mx-auto mt-3 max-w-md text-white/75 leading-relaxed">
            Thanks for sharing your event. We’ll review the details and follow
            up at the email address you provided
          </p>
        </div>
      ) : (
        <>
          <h3 className="font-display text-2xl text-white">
            Tell us about your event
          </h3>
          <p
            id="speaking-inquiry-help"
            className="mt-2 text-sm leading-relaxed text-white/75"
          >
            A few details help us find the right session for your audience. No
            commitment required
          </p>
          <form
            method="post"
            onSubmit={submit}
            aria-describedby="speaking-inquiry-help"
            className="mt-5"
            aria-busy={pending}
          >
            <fieldset
              disabled={pending || !hydrated}
              className="grid gap-4 sm:grid-cols-2"
            >
              <legend className="sr-only">Your speaking inquiry</legend>
              <label className="text-sm text-white/85">
                Your name <span className="text-white/60">(required)</span>
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
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
                  maxLength={254}
                  className={fieldClass}
                />
              </label>
              <label className="text-sm text-white/85">
                Event name <span className="text-white/60">(required)</span>
                <input
                  name="event_name"
                  required
                  maxLength={160}
                  className={fieldClass}
                />
              </label>
              <label className="text-sm text-white/85">
                Date or timeframe
                <input
                  name="event_date"
                  maxLength={100}
                  placeholder="A date, month, or flexible"
                  className={fieldClass}
                />
              </label>
              <label className="text-sm text-white/85 sm:col-span-2">
                Event format
                <select
                  name="event_format"
                  defaultValue="undecided"
                  className={`${fieldClass} [&_option]:bg-neutral-950`}
                >
                  <option value="undecided">Still deciding</option>
                  <option value="in_person">In person</option>
                  <option value="virtual">Virtual</option>
                </select>
              </label>
              <label className="text-sm text-white/85 sm:col-span-2">
                Who will be in the room?
                <input
                  name="audience"
                  maxLength={300}
                  placeholder="Audience, approximate size, and location"
                  className={fieldClass}
                />
              </label>
              <label className="text-sm text-white/85 sm:col-span-2">
                What would you like them to take away?
                <textarea
                  name="message"
                  rows={4}
                  maxLength={3000}
                  placeholder="Your goals, topic ideas, or anything else we should know"
                  className={`${fieldClass} resize-y`}
                />
              </label>
              <div className="hidden" aria-hidden="true">
                <label>
                  Website
                  <input
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    maxLength={200}
                  />
                </label>
              </div>
            </fieldset>
            <button
              type="submit"
              disabled={pending || !hydrated}
              className="mt-5 inline-flex items-center gap-2 rounded-sm bg-[var(--brand-accent)] px-5 py-3 font-body text-sm font-bold text-[var(--brand-backdrop)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
            >
              {pending ? (
                <>
                  Sending inquiry{" "}
                  <Loader2
                    size={17}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                </>
              ) : (
                <>
                  Send speaking inquiry{" "}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </>
              )}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-white/55">
              Your details are used to respond to this inquiry. You won’t be
              added to a mailing list. <FormPrivacyLink />
            </p>
            {error && (
              <div
                ref={statusRef}
                role="alert"
                tabIndex={-1}
                className="mt-4 rounded-sm border border-red-300/25 p-4 text-sm text-red-100 outline-none"
              >
                {error}
              </div>
            )}
          </form>
          <noscript>
            <p className="mt-4 text-sm text-white/75">
              Enable JavaScript to use the inquiry form, or contact us by email
              below
            </p>
          </noscript>
          {emailHref && (
            <p className="mt-5 text-sm text-white/65">
              Prefer email?{" "}
              <a
                href={emailHref}
                className="text-[var(--brand-accent-light)] underline underline-offset-4"
              >
                Contact us directly
              </a>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
