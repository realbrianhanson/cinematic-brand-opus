import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Check, RotateCcw, ShieldCheck } from "lucide-react";
import {
  callAnswerError,
  callUrl,
  cleanCallAnswers,
  evaluateCallApplication,
  visibleCallQuestions,
  type CallAnswers,
  type CallApplicationState,
  type CallContact,
  type CallFunnelConfig,
  type CallPublication,
  type CallQuestion,
} from "../../../supabase/functions/_shared/callFunnels";
import {
  type ApplicationDraft,
  callDraftKey,
  readCallDraft,
  removeCallDraft,
  saveCallDraft,
} from "./callFunnelDraft";

/** Phone and link questions get the right mobile keyboard and autofill. */
function textInputHints(question: CallQuestion) {
  const key = `${question.id} ${question.label}`.toLowerCase();
  if (/phone|mobile|\btel\b/.test(key))
    return { type: "tel", inputMode: "tel", autoComplete: "tel" } as const;
  if (/website|\burl\b|link/.test(key))
    return { type: "text", inputMode: "url", autoComplete: "url" } as const;
  return { type: "text" } as const;
}

/** Short answer lists sit in two columns so the whole step fits on screen. */
function gridChoices(question: CallQuestion) {
  return (
    question.options.length >= 4 &&
    question.options.every((option) => option.label.length <= 32)
  );
}

export type CallSubmit = (
  answers: CallAnswers,
  contact: CallContact,
  consent: boolean,
  marketingConsent?: boolean,
) => Promise<CallApplicationState>;
/** Saves an unfinished application. Fire and forget; it never blocks the visitor. */
export type CallCapture = (
  answers: CallAnswers,
  contact: CallContact,
  marketingConsent: boolean,
) => void;

export default function CallApplication({
  publication,
  preview,
  qualificationRules = [],
  marketingConsentText = "",
  onSubmit,
  onCapture,
  onComplete,
}: {
  publication: CallPublication;
  preview: boolean;
  qualificationRules?: CallFunnelConfig["qualificationRules"];
  /** Optional second checkbox for news and offers. Hidden when empty. */
  marketingConsentText?: string;
  onSubmit?: CallSubmit;
  onCapture?: CallCapture;
  onComplete: (state: CallApplicationState) => void;
}) {
  const { config } = publication;
  const uid = useId();
  const key = callDraftKey(publication, preview, qualificationRules);
  const initialPublication = useRef(publication);
  const [recovered, setRecovered] = useState<ApplicationDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [answers, setAnswers] = useState<CallAnswers>({});
  const [contact, setContact] = useState<CallContact>({ name: "", email: "" });
  const [consent, setConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  // Contact details come first, so an unfinished application is still a lead.
  const [step, setStep] = useState("contact");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const sending = useRef(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);
  const resumeStep = useRef("");
  const visible = visibleCallQuestions(config, answers);
  // A text question with the id "phone" is asked on the contact step.
  const phoneQuestion = visible.find(
    (q) => q.id === "phone" && q.type === "text",
  );
  const steps = [
    "contact",
    ...visible
      .filter((q) => q !== phoneQuestion)
      .map((q) => `question:${q.id}`),
    "review",
  ];
  const currentIndex = Math.max(0, steps.indexOf(step));
  const question = visible.find((q) => step === `question:${q.id}`);
  const errorId = `${uid}-error`;

  useEffect(() => {
    setRecovered(readCallDraft(key, initialPublication.current));
    setDraftReady(true);
  }, [key]);
  useEffect(() => {
    if (!draftReady || recovered || !Object.keys(answers).length) return;
    setStorageAvailable(saveCallDraft(key, { answers, step }));
  }, [answers, step, key, recovered, draftReady]);
  useEffect(() => {
    if (shouldFocus.current) {
      stepHeading.current?.focus({ preventScroll: true });
      shouldFocus.current = false;
      // Bring the next step fully into view: its top may have scrolled away,
      // or (on phones) the heading above the card pushes answers off screen.
      const card = cardRef.current;
      const box = card?.getBoundingClientRect();
      if (
        card &&
        box &&
        (box.top < 0 || (box.bottom > window.innerHeight && box.top > 24))
      ) {
        const reduce = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        card.scrollIntoView?.({
          block: "start",
          behavior: reduce ? "auto" : "smooth",
        });
      }
    }
  }, [step]);

  function go(next: string) {
    setError("");
    shouldFocus.current = true;
    setStep(next);
  }
  function reset() {
    removeCallDraft(key);
    setRecovered(null);
    setAnswers({});
    setContact({ name: "", email: "" });
    setConsent(false);
    setMarketingConsent(false);
    resumeStep.current = "";
    go("contact");
  }
  function contactError() {
    if (!contact.name.trim()) return "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()))
      return "Enter a valid email address.";
    if (phoneQuestion) {
      const phone = callAnswerError(phoneQuestion, answers[phoneQuestion.id]);
      if (phone) return `${phoneQuestion.label}: ${phone}`;
    }
    if (!consent) return "Please agree to be contacted about your application.";
    return "";
  }
  function capture(nextAnswers: CallAnswers) {
    if (preview || !onCapture || contactError()) return;
    onCapture(
      cleanCallAnswers(config, nextAnswers),
      { name: contact.name.trim(), email: contact.email.trim().toLowerCase() },
      marketingConsentText ? marketingConsent : false,
    );
  }
  function next() {
    const message = question
      ? callAnswerError(question, answers[question.id])
      : contactError();
    if (message) {
      setError(message);
      return;
    }
    capture(answers);
    const resume = resumeStep.current;
    resumeStep.current = "";
    go(
      step === "contact" && steps.includes(resume)
        ? resume
        : steps[currentIndex + 1] || "review",
    );
  }
  async function submit() {
    if (sending.current) return;
    const message = contactError();
    if (message) {
      go("contact");
      setError(message);
      return;
    }
    for (const q of visible) {
      const answerMessage = callAnswerError(q, answers[q.id]);
      if (answerMessage) {
        go(q === phoneQuestion ? "contact" : `question:${q.id}`);
        setError(answerMessage);
        return;
      }
    }
    sending.current = true;
    setSubmitting(true);
    setError("");
    try {
      let result: CallApplicationState;
      if (preview) {
        const evaluated = evaluateCallApplication(
          { ...config, qualificationRules, scripts: {} },
          cleanCallAnswers(config, answers),
          contact,
        );
        result = {
          id: "preview-application",
          outcome: evaluated.outcome,
          revision: publication.revision,
          submittedAt: new Date().toISOString(),
          slug: publication.slug,
          title: publication.title,
          config: publication.config,
          proof: publication.proof,
          booking: { status: "unconfirmed", startsAt: null, source: null },
        };
      } else {
        if (!onSubmit)
          throw new Error(
            "Applications are temporarily unavailable. Please try again later.",
          );
        result = await onSubmit(
          cleanCallAnswers(config, answers),
          {
            name: contact.name.trim(),
            email: contact.email.trim().toLowerCase(),
          },
          consent,
          marketingConsentText ? marketingConsent : false,
        );
      }
      if (result.revision !== publication.revision)
        throw new Error(
          "The application version changed. Please refresh this page before continuing.",
        );
      removeCallDraft(key);
      onComplete(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your application could not be sent. Your answers are still here; please try again.",
      );
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="cf-application-card" ref={cardRef}>
      {recovered ? (
        <div className="cf-recovery" role="status">
          <h3 ref={stepHeading} tabIndex={-1}>
            You have a saved application
          </h3>
          <p>
            Confirm your contact details, then pick up where you left off. Or
            start fresh.
          </p>
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-button"
              onClick={() => {
                const restored = recovered;
                setAnswers(restored.answers);
                const validSteps = [
                  ...visibleCallQuestions(config, restored.answers).map(
                    (q) => `question:${q.id}`,
                  ),
                  "review",
                ];
                setRecovered(null);
                resumeStep.current = validSteps.includes(restored.step)
                  ? restored.step
                  : "";
                go("contact");
              }}
            >
              Continue saved application
            </button>
            <button type="button" className="cf-text-button" onClick={reset}>
              Start fresh
            </button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          aria-label="Call application"
          aria-busy={submitting}
          onSubmit={(event) => {
            event.preventDefault();
            if (step === "review") void submit();
            else next();
          }}
        >
          <div className="cf-progress-row">
            <span>
              Step {currentIndex + 1} of {steps.length}
            </span>
            <span>
              {step === "review"
                ? "Review & send"
                : step === "contact"
                  ? "Your details"
                  : "A little about you"}
            </span>
          </div>
          <div
            className="cf-progress-track"
            role="progressbar"
            aria-label="Application progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={currentIndex + 1}
          >
            <span
              style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
          <fieldset disabled={submitting} className="cf-form-fields">
            {question ? (
              <div key={question.id} className="cf-question">
                <h3 id={`${uid}-question`} ref={stepHeading} tabIndex={-1}>
                  {question.label}
                  {!question.required && (
                    <span className="cf-optional"> (optional)</span>
                  )}
                </h3>
                {question.help && (
                  <p id={`${uid}-help`} className="cf-muted">
                    {question.help}
                  </p>
                )}
                {question.type === "single" ? (
                  <div
                    className={`cf-choices${gridChoices(question) ? " is-grid" : ""}`}
                    role="radiogroup"
                    aria-labelledby={`${uid}-question`}
                    aria-describedby={
                      error
                        ? errorId
                        : question.help
                          ? `${uid}-help`
                          : undefined
                    }
                    aria-required={question.required}
                  >
                    {question.options.map((option) => (
                      <label
                        className={`cf-choice ${answers[question.id] === option.id ? "is-selected" : ""}`}
                        key={option.id}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={option.id}
                          checked={answers[question.id] === option.id}
                          onChange={() => {
                            setAnswers((previous) =>
                              cleanCallAnswers(config, {
                                ...previous,
                                [question.id]: option.id,
                              }),
                            );
                            setError("");
                          }}
                        />
                        <span>{option.label}</span>
                        <Check
                          size={18}
                          aria-hidden="true"
                          className="cf-choice-check"
                        />
                      </label>
                    ))}
                  </div>
                ) : question.type === "textarea" ? (
                  <textarea
                    aria-labelledby={`${uid}-question`}
                    aria-describedby={
                      error
                        ? errorId
                        : question.help
                          ? `${uid}-help`
                          : undefined
                    }
                    aria-invalid={!!error}
                    required={question.required}
                    value={answers[question.id] || ""}
                    maxLength={2000}
                    rows={4}
                    onChange={(event) => {
                      setAnswers((previous) => ({
                        ...previous,
                        [question.id]: event.target.value,
                      }));
                      setError("");
                    }}
                  />
                ) : (
                  <input
                    aria-labelledby={`${uid}-question`}
                    aria-describedby={
                      error
                        ? errorId
                        : question.help
                          ? `${uid}-help`
                          : undefined
                    }
                    aria-invalid={!!error}
                    required={question.required}
                    {...textInputHints(question)}
                    value={answers[question.id] || ""}
                    maxLength={2000}
                    onChange={(event) => {
                      setAnswers((previous) => ({
                        ...previous,
                        [question.id]: event.target.value,
                      }));
                      setError("");
                    }}
                  />
                )}
              </div>
            ) : step === "contact" ? (
              <div className="cf-question">
                <h3 ref={stepHeading} tabIndex={-1}>
                  Where can we reach you?
                </h3>
                <label htmlFor={`${uid}-name`}>Your name</label>
                <input
                  id={`${uid}-name`}
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={160}
                  value={contact.name}
                  onChange={(event) => {
                    setContact((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }));
                    setError("");
                  }}
                />
                <label htmlFor={`${uid}-email`}>Email address</label>
                <input
                  id={`${uid}-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={contact.email}
                  onChange={(event) => {
                    setContact((previous) => ({
                      ...previous,
                      email: event.target.value,
                    }));
                    setError("");
                  }}
                />
                {phoneQuestion && (
                  <>
                    <label htmlFor={`${uid}-phone`}>
                      {phoneQuestion.label}
                    </label>
                    <input
                      id={`${uid}-phone`}
                      name="phone"
                      required={phoneQuestion.required}
                      {...textInputHints(phoneQuestion)}
                      maxLength={2000}
                      value={answers[phoneQuestion.id] || ""}
                      onChange={(event) => {
                        setAnswers((previous) => ({
                          ...previous,
                          [phoneQuestion.id]: event.target.value,
                        }));
                        setError("");
                      }}
                    />
                  </>
                )}
                <label className="cf-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => {
                      setConsent(event.target.checked);
                      setError("");
                    }}
                  />
                  <span>
                    {config.application.consentText ||
                      "I agree to be contacted about this application."}
                  </span>
                </label>
                {marketingConsentText && (
                  <label className="cf-consent">
                    <input
                      type="checkbox"
                      checked={marketingConsent}
                      onChange={(event) =>
                        setMarketingConsent(event.target.checked)
                      }
                    />
                    <span>{marketingConsentText}</span>
                  </label>
                )}
                {config.application.privacyUrl &&
                  callUrl(config.application.privacyUrl, true) &&
                  (preview ? (
                    <span className="cf-small cf-muted">
                      Privacy notice link available on the published page.
                    </span>
                  ) : (
                    <a
                      className="cf-small cf-plain-link"
                      href={config.application.privacyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Read the privacy notice
                    </a>
                  ))}
                <p className="cf-small cf-muted">
                  Your answers save as you go. You’ll review everything before
                  you send it.
                </p>
              </div>
            ) : (
              <div className="cf-question">
                <h3 ref={stepHeading} tabIndex={-1}>
                  Everything look right?
                </h3>
                <dl className="cf-review">
                  {visible
                    .filter((q) => q !== phoneQuestion)
                    .map((q) => (
                      <div key={q.id}>
                        <dt>
                          {q.label}
                          <button
                            type="button"
                            className="cf-text-button"
                            aria-label={`Edit ${q.label}`}
                            onClick={() => go(`question:${q.id}`)}
                          >
                            Edit
                          </button>
                        </dt>
                        <dd>
                          {q.type === "single"
                            ? q.options.find((o) => o.id === answers[q.id])
                                ?.label || "Not provided"
                            : answers[q.id] || "Not provided"}
                        </dd>
                      </div>
                    ))}
                  <div>
                    <dt>
                      Contact details
                      <button
                        type="button"
                        className="cf-text-button"
                        onClick={() => go("contact")}
                      >
                        Edit contact details
                      </button>
                    </dt>
                    <dd>
                      {contact.name}
                      <br />
                      {contact.email}
                      {phoneQuestion && answers[phoneQuestion.id] && (
                        <>
                          <br />
                          {answers[phoneQuestion.id]}
                        </>
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="cf-small cf-muted">
                  Submitted applications are kept for up to 90 days. Your
                  private application access in this browser lasts 7 days.
                </p>
              </div>
            )}
            {error && (
              <p className="cf-error" id={errorId} role="alert">
                {error}
              </p>
            )}
            <div className="cf-form-actions">
              {currentIndex > 0 && (
                <button
                  type="button"
                  className="cf-secondary-button"
                  onClick={() => go(steps[currentIndex - 1])}
                >
                  <ArrowLeft size={17} aria-hidden="true" /> Back
                </button>
              )}
              <button type="submit" className="cf-button">
                {submitting
                  ? "Sending your application…"
                  : step === "review"
                    ? preview
                      ? "Test application route"
                      : "Send my application"
                    : "Continue"}
              </button>
            </div>
            {Object.keys(answers).length > 0 && (
              <button
                type="button"
                className="cf-text-button cf-reset"
                onClick={reset}
              >
                <RotateCcw size={14} aria-hidden="true" /> Clear my answers
              </button>
            )}
          </fieldset>
          {preview && (
            <p className="cf-preview-note">
              Preview only. Applications are simulated; no details are sent and
              no booking is created.
            </p>
          )}
        </form>
      )}
      <p className="cf-storage-notice">
        <ShieldCheck size={15} aria-hidden="true" />
        {storageAvailable
          ? "Your details and answers save as you go, so we can help you finish if you get interrupted. Unfinished answers also stay in this tab for up to 7 days."
          : "This browser cannot save unfinished answers. Keep this page open until you submit."}
      </p>
    </div>
  );
}
