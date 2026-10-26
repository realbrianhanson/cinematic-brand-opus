import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import {
  callUrl,
  type CallApplicationState,
  type CallContact,
  type CallFunnelConfig,
  type CallPublication,
} from "../../../supabase/functions/_shared/callFunnels";
import { isCalendlyUrl } from "./calendlyEmbed";
import CallApplication, {
  type CallCapture,
  type CallSubmit,
} from "./CallApplication";
import CallVideo from "./CallVideo";
import CallPreparationExtras from "./CallPreparationExtras";
import { callDraftKey, removeCallDraft } from "./callFunnelDraft";
import CallDestination from "./CallDestination";
import { Appointment, BookingStage } from "./CallBooking";
import { Proof, ShowcaseQuotes } from "./CallProof";
import { selectedProof, useCallShowcase } from "./callShowcase";
import {
  HostCard,
  ResultsRow,
  StepList,
  SystemSection,
} from "./CallShowcaseSections";
import "@/styles/call-funnels.css";

export type CallStage =
  | "invitation"
  | "application"
  | "booking"
  | "preparation"
  | "training"
  | "alternative";
export type CallFunnelExperienceProps = {
  publication: CallPublication;
  preview?: boolean;
  qualificationRules?: CallFunnelConfig["qualificationRules"];
  onSubmit?: CallSubmit;
  /** Saves an unfinished application; never awaited. */
  onCapture?: CallCapture;
  initialState?: CallApplicationState | null;
  onRefreshState?: () => Promise<CallApplicationState>;
  onViewStage?: (stage: CallStage) => void;
  /** Applicant details carried into an embedded calendar so nothing is typed twice. */
  contact?: CallContact | null;
  /** The application's answers, carried into the calendar invite. */
  bookingNotes?: string;
  onCalendlyBooked?: (inviteeUri: string) => Promise<CallApplicationState>;
};

function luminance(hex: string) {
  return [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
function mix(hex: string, toward: string, amount: number) {
  const channel = (value: string, i: number) =>
    parseInt(value.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(
        channel(hex, i) + (channel(toward, i) - channel(hex, i)) * amount,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
/** The accent as small text: darkened or lightened until it reads at 4.5:1. */
function accentForText(hex: string, background: string) {
  const toward = luminance(background) > 0.5 ? "#000000" : "#ffffff";
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(hex, toward, step / 20);
    if (contrast(candidate, background) >= 4.5) return candidate;
  }
  return toward;
}

function accentText(hex: string) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 >
    0.179
    ? "#000000"
    : "#ffffff";
}

type PreparationProgress = {
  checked: number[];
  notes: string;
  position: number;
};
function Preparation({
  publication,
  state,
  stage,
  preview,
  navigate,
}: {
  publication: CallPublication;
  state: CallApplicationState | null;
  stage: "preparation" | "training";
  preview: boolean;
  navigate: (stage: CallStage) => void;
}) {
  const { config } = publication;
  const key = `call-preparation:v1:${preview ? "preview" : "live"}:${publication.id}:${publication.revision}:${state?.id || "preview"}`;
  const [progress, setProgress] = useState<PreparationProgress>({
    checked: [],
    notes: "",
    position: 0,
  });
  const [progressReady, setProgressReady] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw || raw.length > 12000) throw new Error();
      const saved = JSON.parse(raw);
      if (
        !Number.isFinite(saved.at) ||
        Date.now() - saved.at > 7 * 86400000 ||
        saved.at > Date.now() + 60000
      )
        throw new Error();
      setProgress({
        checked: Array.isArray(saved.checked)
          ? saved.checked.filter(
              (n: unknown) =>
                Number.isInteger(n) &&
                Number(n) >= 0 &&
                Number(n) < config.preparation.checklist.length,
            )
          : [],
        notes:
          typeof saved.notes === "string" ? saved.notes.slice(0, 8000) : "",
        position:
          Number.isFinite(saved.position) &&
          saved.position >= 0 &&
          saved.position <= 86400
            ? saved.position
            : 0,
      });
    } catch {
      setProgress({ checked: [], notes: "", position: 0 });
    }
    setProgressReady(true);
  }, [key, config.preparation.checklist.length]);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const hasProgress =
    progress.checked.length > 0 || !!progress.notes || progress.position > 0;
  useEffect(() => {
    if (!progressReady) return;
    try {
      if (hasProgress)
        sessionStorage.setItem(
          key,
          JSON.stringify({ ...progress, at: Date.now() }),
        );
      else sessionStorage.removeItem(key);
    } catch {
      setStorageAvailable(false);
    }
  }, [progress, key, hasProgress, progressReady]);
  return (
    <section className="cf-post-page">
      <div className="cf-post-heading">
        <h1 tabIndex={-1}>
          {stage === "preparation"
            ? config.preparation.headline
            : config.training.headline}
        </h1>
        <p className="cf-lede">
          {stage === "preparation"
            ? config.preparation.intro
            : config.training.intro}
        </p>
      </div>
      <Appointment state={preview ? null : state} />
      {stage === "preparation" ? (
        <>
          <CallVideo
            key="preparation-video"
            media={config.preparation.video}
            title="Welcome video"
            preview={preview}
          />
          {config.preparation.checklist.length > 0 && (
            <section className="cf-checklist">
              <div className="cf-section-label">
                <h2>Your preparation checklist</h2>
                <span>
                  {progress.checked.length} of{" "}
                  {config.preparation.checklist.length} checked
                </span>
              </div>
              <p className="cf-small cf-muted">
                Check these off as you finish them. This is your personal
                checklist.
              </p>
              {config.preparation.checklist.map((item, index) => (
                <label key={`${index}-${item}`}>
                  <input
                    type="checkbox"
                    checked={progress.checked.includes(index)}
                    onChange={(event) =>
                      setProgress((previous) => ({
                        ...previous,
                        checked: event.target.checked
                          ? [...new Set([...previous.checked, index])]
                          : previous.checked.filter((n) => n !== index),
                      }))
                    }
                  />
                  <span>{item}</span>
                </label>
              ))}
            </section>
          )}
          <CallPreparationExtras
            extras={config.preparation.extras}
            preview={preview}
          />
          {(preview || !!config.training.video.url) && (
            <div className="cf-centered">
              <button
                className="cf-button"
                type="button"
                onClick={() => navigate("training")}
              >
                Open the training
              </button>
            </div>
          )}
          {!!config.preparation.extras?.proofIds.length && (
            <Proof
              publication={publication}
              preview={preview}
              selectedIds={config.preparation.extras.proofIds}
              heading={config.preparation.extras.proofHeading}
            />
          )}
        </>
      ) : (
        <>
          <CallVideo
            key={`training-video-${progressReady}`}
            media={config.training.video}
            title="Preparation training"
            preview={preview}
            chapters={config.training.chapters}
            position={progress.position}
            onPosition={(position) =>
              setProgress((previous) => ({ ...previous, position }))
            }
          />
          <section className="cf-notes">
            <label htmlFor={`${publication.id}-call-notes`}>
              {config.training.notesPrompt ||
                "What would you like to discuss on your call?"}
            </label>
            <textarea
              id={`${publication.id}-call-notes`}
              rows={7}
              maxLength={8000}
              value={progress.notes}
              onChange={(event) =>
                setProgress((previous) => ({
                  ...previous,
                  notes: event.target.value,
                }))
              }
              placeholder="Capture your questions and ideas here…"
            />
            <p className="cf-small cf-muted">
              These notes stay in this tab and are not sent to the team. Copy
              anything you want to keep before closing it.
            </p>
          </section>
          <button
            className="cf-secondary-button"
            type="button"
            onClick={() => navigate("preparation")}
          >
            Back to your checklist
          </button>
        </>
      )}
      <p className="cf-small cf-muted cf-progress-notice">
        {storageAvailable
          ? "Your checklist, notes and video progress are saved in this tab for up to 7 days."
          : "This browser cannot save preparation progress. Keep this page open and copy your notes before leaving."}
      </p>
      {hasProgress && (
        <button
          type="button"
          className="cf-text-button"
          onClick={() => setProgress({ checked: [], notes: "", position: 0 })}
        >
          Clear my preparation notes and progress
        </button>
      )}
      {!preview && (
        <div className="cf-centered cf-return">
          <button
            type="button"
            className="cf-text-button"
            onClick={() => navigate("booking")}
          >
            Back to your booking
          </button>
        </div>
      )}
    </section>
  );
}

function Experience({
  publication,
  preview = false,
  qualificationRules,
  onSubmit,
  onCapture,
  initialState = null,
  onRefreshState,
  onViewStage,
  contact = null,
  bookingNotes = "",
  onCalendlyBooked,
}: CallFunnelExperienceProps) {
  const { config } = publication;
  const [state, setState] = useState(initialState);
  const [stage, setStage] = useState<CallStage>(
    initialState
      ? initialState.outcome === "alternative"
        ? "alternative"
        : "booking"
      : "invitation",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [applicationAttempt, setApplicationAttempt] = useState(0);
  const refreshLock = useRef(false);
  const appRef = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const appId = useId();
  useEffect(() => {
    if (initialState) setState(initialState);
  }, [initialState]);
  useEffect(() => {
    if (
      !preview &&
      (stage === "preparation" || stage === "training") &&
      state?.booking?.status !== "booked"
    )
      setStage("booking");
  }, [preview, stage, state?.booking?.status]);
  const accent = /^#[a-f0-9]{6}$/i.test(config.theme.accent)
    ? config.theme.accent
    : "#92f2cc";
  const style = {
    "--cf-accent": accent,
    "--cf-accent-ink": accentText(accent),
    "--cf-accent-text": accentForText(
      accent,
      config.theme.mode === "light" ? "#ffffff" : "#0b1220",
    ),
  } as CSSProperties;
  function navigate(next: CallStage) {
    if (
      !preview &&
      (next === "preparation" || next === "training") &&
      state?.booking?.status !== "booked"
    )
      next = "booking";
    setStage(next);
    onViewStage?.(next);
    requestAnimationFrame(() => {
      if (next === "application") {
        appRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
        headingRef.current?.focus({ preventScroll: true });
      } else {
        pageRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
        pageRef.current
          ?.querySelector<HTMLElement>("h1")
          ?.focus({ preventScroll: true });
      }
    });
  }
  const embedCalendly =
    !preview &&
    !!state &&
    !!onCalendlyBooked &&
    isCalendlyUrl(config.booking.url);
  async function confirmBooking(inviteeUri: string) {
    // Never drop a booking because a status check is running; confirmation is idempotent.
    if (!onCalendlyBooked) return;
    refreshLock.current = true;
    setRefreshing(true);
    setBookingError("");
    setBookingMessage("Confirming your booking…");
    try {
      const updated = await onCalendlyBooked(inviteeUri);
      setState(updated);
      setBookingMessage("");
      requestAnimationFrame(() =>
        pageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (cause) {
      setBookingMessage("");
      setBookingError(
        cause instanceof Error
          ? cause.message
          : "Your time is reserved with Calendly. Check your email for the details.",
      );
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }
  async function refresh() {
    if (!onRefreshState || refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    setBookingError("");
    setBookingMessage("");
    try {
      const updated = await onRefreshState();
      if (updated.id !== state?.id || updated.revision !== publication.revision)
        throw new Error(
          "This application has changed. Refresh the page to see its current status.",
        );
      setState(updated);
      setBookingMessage(
        updated.booking?.status === "booked"
          ? "Your booking has been confirmed."
          : updated.booking?.status === "cancelled"
            ? "Your booking is marked as cancelled."
            : "We have not received a booking confirmation yet. Complete your booking on the calendar, then check again.",
      );
    } catch (cause) {
      setBookingError(
        cause instanceof Error
          ? cause.message
          : "We could not check your booking. Please try again.",
      );
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }
  const { showcase, results } = useCallShowcase(publication.slug);
  // A published video takes the hero; the portrait then moves to the host card.
  const heroVideo = !!config.invitation.video.url;
  const portrait =
    !heroVideo &&
    config.brand.hostImage &&
    callUrl(config.brand.hostImage, true)
      ? config.brand.hostImage
      : "";
  const showcaseQuotes = showcase?.testimonials ?? [];
  const useFunnelProof =
    selectedProof(publication).length > 0 || !showcaseQuotes.length;
  const journeyStep =
    stage === "alternative"
      ? -1
      : stage === "invitation" || stage === "application"
        ? 0
        : stage === "booking" &&
            (preview || state?.booking?.status !== "booked")
          ? 1
          : 2;
  const cta = (
    <div className="cf-cta-group">
      <button
        className="cf-button cf-button-large"
        type="button"
        onClick={() =>
          navigate(
            state
              ? state.outcome === "alternative"
                ? "alternative"
                : "booking"
              : "application",
          )
        }
      >
        {state
          ? "Continue to your next step"
          : config.invitation.cta || "Apply for a call"}
      </button>
      {config.invitation.ctaSubline && (
        <p className="cf-small cf-muted">{config.invitation.ctaSubline}</p>
      )}
    </div>
  );
  return (
    <div
      className="call-funnel"
      data-cf-theme={config.theme.mode}
      data-cf-font={config.theme.font}
      style={style}
    >
      {preview && (
        <div className="cf-preview-bar">
          <strong>Template preview</strong>
          <span>
            Test the application or explore each page. Nothing is submitted.
          </span>
          <nav aria-label="Preview funnel pages">
            {(
              [
                ["invitation", "Invitation"],
                ["application", "Application"],
                ["booking", "Booking"],
                ["preparation", "Preparation"],
                ["training", "Training"],
                ["alternative", "Alternative offer"],
              ] as [CallStage, string][]
            ).map(([value, label]) => (
              <button
                type="button"
                aria-pressed={stage === value}
                key={value}
                onClick={() => navigate(value)}
              >
                {label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="cf-text-button"
            onClick={() => {
              removeCallDraft(
                callDraftKey(publication, true, qualificationRules),
              );
              setState(null);
              setApplicationAttempt((attempt) => attempt + 1);
              setBookingMessage("");
              setBookingError("");
              navigate("application");
            }}
          >
            Restart application
          </button>
        </div>
      )}
      <header className="cf-brand">
        <span className="cf-brand-name">{config.brand.name}</span>
        {journeyStep >= 0 && (
          <ol className="cf-journey" aria-label="Your progress">
            {["Apply", "Book your call", "Prepare"].map((label, index) => (
              <li
                key={label}
                className={
                  index < journeyStep
                    ? "is-done"
                    : index === journeyStep
                      ? "is-current"
                      : undefined
                }
                aria-current={index === journeyStep ? "step" : undefined}
              >
                <span className="cf-journey-marker" aria-hidden="true">
                  {index < journeyStep ? <Check size={13} /> : index + 1}
                </span>
                <span className="cf-journey-label">
                  {index < journeyStep && (
                    <span className="cf-sr-only">Done: </span>
                  )}
                  {label}
                </span>
              </li>
            ))}
          </ol>
        )}
      </header>
      <main ref={pageRef} className="cf-main">
        {(stage === "invitation" || stage === "application") && (
          <>
            <section
              className={`cf-hero${heroVideo ? " has-video" : portrait ? " has-portrait" : ""}`}
            >
              <div className="cf-hero-copy">
                {config.invitation.audience && (
                  <p className="cf-kicker">{config.invitation.audience}</p>
                )}
                <h1 tabIndex={-1}>{config.invitation.headline}</h1>
                {config.invitation.description && (
                  <p className="cf-lede">{config.invitation.description}</p>
                )}
                {cta}
              </div>
              {heroVideo && (
                <div className="cf-hero-video">
                  {config.invitation.watchPrompt && (
                    <p className="cf-watch-prompt">
                      {config.invitation.watchPrompt}
                    </p>
                  )}
                  <CallVideo
                    media={config.invitation.video}
                    title="Invitation video"
                    preview={preview}
                  />
                </div>
              )}
              {portrait && (
                <figure className="cf-hero-portrait">
                  <img
                    src={portrait}
                    alt={
                      config.brand.hostName
                        ? `Portrait of ${config.brand.hostName}`
                        : ""
                    }
                    width={730}
                    height={912}
                    fetchPriority="high"
                  />
                  {(config.brand.hostName || config.brand.hostRole) && (
                    <figcaption>
                      {config.brand.hostName && (
                        <strong>{config.brand.hostName}</strong>
                      )}
                      {config.brand.hostRole && (
                        <span>{config.brand.hostRole}</span>
                      )}
                    </figcaption>
                  )}
                </figure>
              )}
            </section>
            {results.length > 0 && (
              <div className="cf-wide">
                <ResultsRow results={results} />
              </div>
            )}
            {/* The builder preview keeps an empty slot so owners see where a video goes. */}
            {preview && !heroVideo && (
              <section className="cf-video-section cf-wide">
                {config.invitation.watchPrompt && (
                  <p className="cf-watch-prompt">
                    {config.invitation.watchPrompt}
                  </p>
                )}
                <CallVideo
                  media={config.invitation.video}
                  title="Invitation video"
                  preview={preview}
                />
              </section>
            )}
            {showcase?.system && <SystemSection system={showcase.system} />}
            <div className="cf-wide">
              {useFunnelProof ? (
                <Proof publication={publication} preview={preview} />
              ) : (
                <ShowcaseQuotes
                  heading={
                    config.invitation.proofHeading ||
                    "Hear from people who took the next step"
                  }
                  items={showcaseQuotes}
                />
              )}
            </div>
            <section className="cf-apply" ref={appRef} aria-labelledby={appId}>
              <div className="cf-apply-layout cf-wide">
                <div className="cf-apply-head">
                  <h2 id={appId} tabIndex={-1} ref={headingRef}>
                    {config.application.heading}
                  </h2>
                  {config.application.intro && (
                    <p>{config.application.intro}</p>
                  )}
                </div>
                <div className="cf-apply-form">
                  {state ? (
                    <div className="cf-application-card cf-received">
                      <CheckCircle2 aria-hidden="true" size={36} />
                      <h3>Your application is received</h3>
                      <p>You can return to your next step below.</p>
                      {cta}
                    </div>
                  ) : (
                    <CallApplication
                      key={applicationAttempt}
                      publication={publication}
                      preview={preview}
                      qualificationRules={qualificationRules}
                      marketingConsentText={showcase?.marketingConsent}
                      onSubmit={onSubmit}
                      onCapture={onCapture}
                      onComplete={(accepted) => {
                        setState(accepted);
                        navigate(
                          accepted.outcome === "qualified"
                            ? "booking"
                            : "alternative",
                        );
                      }}
                    />
                  )}
                </div>
                <div className="cf-apply-extra">
                  {showcase?.steps && <StepList steps={showcase.steps} />}
                  <HostCard
                    brand={config.brand}
                    label="Who you’ll talk to"
                    photo={!portrait}
                  />
                </div>
              </div>
            </section>
            <section className="cf-closing cf-wide">
              <h2>{config.invitation.closingHeadline}</h2>
              {config.invitation.promise && (
                <p className="cf-promise">{config.invitation.promise}</p>
              )}
              {cta}
              {config.invitation.reassurance && (
                <p className="cf-reassurance">
                  {config.invitation.reassurance}
                </p>
              )}
            </section>
          </>
        )}
        {stage === "booking" && (
          <BookingStage
            publication={publication}
            state={state}
            preview={preview}
            contact={contact}
            bookingNotes={bookingNotes}
            showcase={showcase}
            accent={accent}
            embedCalendly={embedCalendly}
            refreshing={refreshing}
            bookingMessage={bookingMessage}
            bookingError={bookingError}
            onScheduled={(uri) => void confirmBooking(uri)}
            onRefresh={!preview && onRefreshState ? () => void refresh() : null}
            onPrepare={() => navigate("preparation")}
          />
        )}
        {(stage === "preparation" || stage === "training") && (
          <Preparation
            publication={publication}
            state={state}
            stage={stage}
            preview={preview}
            navigate={navigate}
          />
        )}
        {stage === "alternative" && (
          <section className="cf-alternative cf-post-page">
            <div className="cf-post-heading">
              <h1 tabIndex={-1}>{config.alternative.headline}</h1>
              <p className="cf-lede">{config.alternative.intro}</p>
            </div>
            <CallVideo
              media={config.alternative.video}
              title="Next-step offer video"
              preview={preview}
            />
            <div className="cf-alternative-layout">
              <div className="cf-alternative-main">
                {config.alternative.story && (
                  <p className="cf-prose cf-alternative-story">
                    {config.alternative.story}
                  </p>
                )}
                {config.alternative.benefits.length > 0 && (
                  <ul className="cf-benefits" aria-label="What is included">
                    {config.alternative.benefits.map((benefit, i) => (
                      <li key={i}>
                        <span className="cf-benefit-check" aria-hidden="true">
                          <Check size={16} />
                        </span>
                        <div>
                          <h2>{benefit.title}</h2>
                          <p>{benefit.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="cf-alternative-cta">
                {config.alternative.price && (
                  <p className="cf-offer-price">{config.alternative.price}</p>
                )}
                {config.alternative.billing && (
                  <p className="cf-billing">{config.alternative.billing}</p>
                )}
                <CallDestination url={config.alternative.url} preview={preview}>
                  {config.alternative.cta}
                </CallDestination>
              </div>
            </div>
            <Proof publication={publication} alternative preview={preview} />
            {config.alternative.faq.length > 0 && (
              <>
                <section className="cf-faq">
                  <h2>Your questions, answered</h2>
                  {config.alternative.faq.map((faq, i) => (
                    <details key={i}>
                      <summary>{faq.question}</summary>
                      <p>{faq.answer}</p>
                    </details>
                  ))}
                </section>
                <div className="cf-alternative-cta is-closing">
                  {config.alternative.price && (
                    <p className="cf-offer-price">{config.alternative.price}</p>
                  )}
                  {config.alternative.billing && (
                    <p className="cf-billing">{config.alternative.billing}</p>
                  )}
                  <CallDestination
                    url={config.alternative.url}
                    preview={preview}
                  >
                    {config.alternative.cta}
                  </CallDestination>
                </div>
              </>
            )}
          </section>
        )}
      </main>
      <footer className="cf-footer">
        <span>{config.brand.name}</span>
        {!preview &&
          config.application.privacyUrl &&
          callUrl(config.application.privacyUrl, true) && (
            <a
              href={config.application.privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy
            </a>
          )}
      </footer>
    </div>
  );
}

/** A published revision or changed preview questions starts an isolated visitor experience. */
export default function CallFunnelExperience(props: CallFunnelExperienceProps) {
  return (
    <div className="cf-viewport">
      <Experience
        key={callDraftKey(
          props.publication,
          !!props.preview,
          props.qualificationRules,
        )}
        {...props}
      />
    </div>
  );
}
