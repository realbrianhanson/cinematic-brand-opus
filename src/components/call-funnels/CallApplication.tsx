import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
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
} from "../../../supabase/functions/_shared/callFunnels";
import {
  type ApplicationDraft,
  callDraftKey,
  readCallDraft,
  removeCallDraft,
  saveCallDraft,
} from "./callFunnelDraft";

export type CallSubmit = (
  answers: CallAnswers,
  contact: CallContact,
  consent: boolean,
) => Promise<CallApplicationState>;

export default function CallApplication({
  publication,
  preview,
  qualificationRules = [],
  onSubmit,
  onComplete,
}: {
  publication: CallPublication;
  preview: boolean;
  qualificationRules?: CallFunnelConfig["qualificationRules"];
  onSubmit?: CallSubmit;
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
  const [step, setStep] = useState(`question:${config.questions[0]?.id || ""}`);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const sending = useRef(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);
  const visible = visibleCallQuestions(config, answers);
  const steps = [
    ...visible.map((q) => `question:${q.id}`),
    "contact",
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
    go(`question:${config.questions[0]?.id || ""}`);
  }
  function contactError() {
    if (!contact.name.trim()) return "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()))
      return "Enter a valid email address.";
    return "";
  }
  function next() {
    const message = question
      ? callAnswerError(question, answers[question.id])
      : contactError();
    if (message) {
      setError(message);
      return;
    }
    go(steps[currentIndex + 1] || "review");
  }
  async function submit() {
    if (sending.current) return;
    for (const q of visible) {
      const message = callAnswerError(q, answers[q.id]);
      if (message) {
        go(`question:${q.id}`);
        setError(message);
        return;
      }
    }
    const message = contactError();
    if (message) {
      go("contact");
      setError(message);
      return;
    }
    if (!consent) {
      setError("Please confirm your consent before submitting.");
      return;
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
    <div className="cf-application-card">
      <p className="cf-storage-notice">
        <ShieldCheck size={16} aria-hidden="true" />
        {storageAvailable
          ? "Unfinished answers are saved in this tab for up to 7 days. Your contact details and consent are not saved on this device."
          : "This browser cannot save unfinished answers. Keep this page open until you submit."}
      </p>
      {recovered ? (
        <div className="cf-recovery" role="status">
          <h3 ref={stepHeading} tabIndex={-1}>
            You have a saved application
          </h3>
          <p>
            Continue your answers from this tab, or start fresh. You’ll enter
            your contact details again before submitting.
          </p>
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-button"
              onClick={() => {
                const restored = recovered;
                setAnswers(restored.answers);
                const validSteps = visibleCallQuestions(
                  config,
                  restored.answers,
                ).map((q) => `question:${q.id}`);
                setRecovered(null);
                go(
                  validSteps.includes(restored.step)
                    ? restored.step
                    : "contact",
                );
              }}
            >
              Continue saved application{" "}
              <ArrowRight size={18} aria-hidden="true" />
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
                    className="cf-choices"
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
                    type="text"
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
                <p className="cf-small cf-muted">
                  Review your answers next. Nothing is submitted until you
                  choose to send your application.
                </p>
              </div>
            ) : (
              <div className="cf-question">
                <h3 ref={stepHeading} tabIndex={-1}>
                  Everything look right?
                </h3>
                <dl className="cf-review">
                  {visible.map((q) => (
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
                    </dd>
                  </div>
                </dl>
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
                <p className="cf-small cf-muted">
                  Submitted applications are kept for up to 90 days. Your
                  private application access in this browser lasts 7 days.
                </p>
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
                <ArrowRight size={18} aria-hidden="true" />
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
    </div>
  );
}
