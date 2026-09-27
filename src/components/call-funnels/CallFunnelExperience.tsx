import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import {
  callUrl,
  type CallApplicationState,
  type CallFunnelConfig,
  type CallPublication,
} from "../../../supabase/functions/_shared/callFunnels";
import CallApplication, { type CallSubmit } from "./CallApplication";
import CallVideo from "./CallVideo";
import CallPreparationExtras from "./CallPreparationExtras";
import { callDraftKey, removeCallDraft } from "./callFunnelDraft";
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
  initialState?: CallApplicationState | null;
  onRefreshState?: () => Promise<CallApplicationState>;
  onViewStage?: (stage: CallStage) => void;
};

function accentText(hex: string) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 >
    0.179
    ? "#000000"
    : "#ffffff";
}

function Proof({
  publication,
  alternative = false,
  preview,
  selectedIds,
  heading,
}: {
  publication: CallPublication;
  alternative?: boolean;
  preview: boolean;
  selectedIds?: string[];
  heading?: string;
}) {
  const ids =
    selectedIds ??
    (alternative
      ? publication.config.alternative.proofIds
      : publication.config.proofIds);
  const proof = ids.flatMap(
    (id) => publication.proof.find((item) => item.id === id) || [],
  );
  if (!proof.length)
    return preview ? (
      <div className="cf-proof-guidance">
        <p className="cf-eyebrow">Your customer stories belong here</p>
        <p>
          Select approved testimonials in the builder to show relevant outcomes
          and honest experiences.
        </p>
      </div>
    ) : null;
  return (
    <section className="cf-proof-section" aria-label="Customer stories">
      <h2>
        {heading ||
          publication.config.invitation.proofHeading ||
          "Hear from people who took the next step"}
      </h2>
      <div className="cf-proof-grid">
        {proof.map((item) => {
          const portrait = publication.config.proofImages[item.id];
          return (
            <figure className="cf-proof-card" key={item.id}>
              {portrait && callUrl(portrait, true) && (
                <img
                  src={portrait}
                  alt=""
                  loading="lazy"
                  width={160}
                  height={160}
                  className="cf-proof-portrait"
                />
              )}
              {item.title && <h3>{item.title}</h3>}
              <blockquote>{item.content}</blockquote>
              <figcaption>{item.attribution}</figcaption>
              {!preview && item.source_url && callUrl(item.source_url) && (
                <a
                  className="cf-small cf-plain-link"
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View original story{" "}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )}
            </figure>
          );
        })}
      </div>
    </section>
  );
}

function Destination({
  url,
  children,
  preview,
}: {
  url: string;
  children: React.ReactNode;
  preview: boolean;
}) {
  if (preview)
    return (
      <>
        <button type="button" className="cf-button" disabled>
          {children}
          <ArrowUpRight size={19} aria-hidden="true" />
        </button>
        <p className="cf-small cf-muted">
          External actions are disabled in preview.
        </p>
      </>
    );
  if (!url || !callUrl(url, true))
    return (
      <p className="cf-notice">
        This next step is not available yet. Please check back soon.
      </p>
    );
  return (
    <a
      className="cf-button"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={19} aria-hidden="true" />
    </a>
  );
}

function Appointment({ state }: { state: CallApplicationState | null }) {
  const booking = state?.booking;
  if (booking?.status !== "booked") return null;
  let date = "Your scheduled time will be provided by your host.";
  if (booking.startsAt && Number.isFinite(Date.parse(booking.startsAt))) {
    const instant = new Date(booking.startsAt);
    try {
      date =
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "full",
          timeStyle: "short",
          ...(booking.timezone ? { timeZone: booking.timezone } : {}),
        }).format(instant) +
        (booking.timezone
          ? ` (${booking.timezone})`
          : " (your device’s time zone)");
    } catch {
      date = `${instant.toLocaleString()} (your device’s time zone)`;
    }
  }
  return (
    <div className="cf-appointment">
      <CheckCircle2 size={25} aria-hidden="true" />
      <div>
        <strong>Your call is booked</strong>
        <p>{date}</p>
        <p className="cf-small cf-muted">
          {booking.source === "admin"
            ? "Recorded by the team."
            : "Confirmed by the scheduling provider."}
        </p>
        <div className="cf-inline-links">
          {booking.manageUrl && callUrl(booking.manageUrl) && (
            <a
              className="cf-plain-link"
              href={booking.manageUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage your booking
            </a>
          )}
          {booking.meetingUrl && callUrl(booking.meetingUrl) && (
            <a
              className="cf-plain-link"
              href={booking.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Join your call
            </a>
          )}
        </div>
      </div>
    </div>
  );
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
        <p className="cf-eyebrow">
          {stage === "preparation"
            ? "Make the most of your conversation"
            : "Your preparation training"}
        </p>
        <h1 tabIndex={-1}>
          {stage === "preparation"
            ? config.preparation.headline
            : config.training.headline}
        </h1>
        <p>
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
          <div className="cf-centered">
            <button
              className="cf-button"
              type="button"
              onClick={() => navigate("training")}
            >
              Open the training <ArrowRight size={19} aria-hidden="true" />
            </button>
          </div>
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
          ? "Your checklist, notes and native video position are saved in this tab for up to 7 days."
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
  initialState = null,
  onRefreshState,
  onViewStage,
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
  const [copyMessage, setCopyMessage] = useState("");
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
        <ArrowRight size={21} aria-hidden="true" />
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
        <span>{config.brand.name}</span>
        <span className="cf-brand-divider" aria-hidden="true" />
        <span className="cf-small">
          {stage === "invitation" || stage === "application"
            ? "A conversation about what’s next"
            : stage === "alternative"
              ? "Your next step"
              : "Your call experience"}
        </span>
      </header>
      <main ref={pageRef} className="cf-main">
        {(stage === "invitation" || stage === "application") && (
          <>
            <section className="cf-invitation">
              <p className="cf-eyebrow">{config.invitation.audience}</p>
              <h1 tabIndex={-1}>{config.invitation.headline}</h1>
              <p className="cf-lede">{config.invitation.description}</p>
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
            <div className="cf-content-width">
              <Proof publication={publication} preview={preview} />
            </div>
            <section
              className="cf-application-band"
              ref={appRef}
              aria-labelledby={appId}
            >
              <div className="cf-application-intro">
                <p className="cf-eyebrow">Your next step starts here</p>
                <h2 id={appId} tabIndex={-1} ref={headingRef}>
                  {config.application.heading}
                </h2>
                <p>{config.application.intro}</p>
              </div>
              {state ? (
                <div className="cf-application-card cf-centered">
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
                  onSubmit={onSubmit}
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
            </section>
            {(config.brand.hostName || config.brand.hostBio) && (
              <section className="cf-host cf-content-width">
                {config.brand.hostImage &&
                  callUrl(config.brand.hostImage, true) && (
                    <img
                      src={config.brand.hostImage}
                      alt={config.brand.hostName}
                      loading="lazy"
                      width={300}
                      height={350}
                    />
                  )}
                <div>
                  <p className="cf-eyebrow">Meet your host</p>
                  <h2>{config.brand.hostName}</h2>
                  {config.brand.hostRole && (
                    <p className="cf-host-role">{config.brand.hostRole}</p>
                  )}
                  <p className="cf-prose">{config.brand.hostBio}</p>
                </div>
              </section>
            )}
            <section className="cf-closing cf-content-width">
              <h2>{config.invitation.closingHeadline}</h2>
              {cta}
            </section>
          </>
        )}
        {stage === "booking" && (
          <section className="cf-post-page">
            <div className="cf-post-heading">
              <p className="cf-eyebrow">
                {preview
                  ? "Booking page preview"
                  : "Your application is received"}
              </p>
              <h1 tabIndex={-1}>
                {state?.booking?.status === "booked"
                  ? "You’re on the calendar."
                  : state?.booking?.status === "cancelled"
                    ? "Let’s find another time."
                    : "Let’s make time for your next step."}
              </h1>
              <p>{config.booking.agenda}</p>
            </div>
            <div className="cf-booking-card">
              <div className="cf-booking-icon">
                <CalendarDays size={30} aria-hidden="true" />
              </div>
              <p className="cf-duration">
                <Clock3 size={18} aria-hidden="true" /> {config.booking.minutes}
                -minute conversation
              </p>
              <Appointment state={preview ? null : state} />
              {state?.booking?.status === "booked" && !preview ? (
                <button
                  type="button"
                  className="cf-button"
                  onClick={() => navigate("preparation")}
                >
                  Prepare for your call{" "}
                  <ArrowRight size={19} aria-hidden="true" />
                </button>
              ) : (
                <>
                  <h2>
                    {state?.booking?.status === "cancelled"
                      ? "Your previous booking was cancelled"
                      : "Choose a time that works for you"}
                  </h2>
                  <p className="cf-muted">
                    {state?.booking?.status === "cancelled"
                      ? "Use the calendar to choose a new appointment. Your application is still here."
                      : "Your call is not booked yet. Complete the scheduling steps on the calendar to reserve your time. Check your calendar confirmation email for the appointment details."}
                  </p>
                  <Destination url={config.booking.url} preview={preview}>
                    {config.booking.label || "Open the calendar"}
                  </Destination>
                </>
              )}
              {!preview && state && (
                <div className="cf-application-reference">
                  <p>Your application reference</p>
                  <code>{state.id}</code>
                  <p className="cf-small cf-muted">
                    Keep this with your booking details. If the calendar asks
                    for an application reference, paste it there.
                  </p>
                  <button
                    className="cf-text-button"
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(state.id);
                        setCopyMessage("Application reference copied.");
                      } catch {
                        setCopyMessage(
                          "Select the reference above to copy it.",
                        );
                      }
                    }}
                  >
                    Copy reference
                  </button>
                  {copyMessage && (
                    <p className="cf-small" role="status">
                      {copyMessage}
                    </p>
                  )}
                </div>
              )}
              {!preview && onRefreshState && (
                <button
                  type="button"
                  className="cf-secondary-button cf-refresh"
                  disabled={refreshing}
                  onClick={() => void refresh()}
                >
                  {refreshing
                    ? "Checking your booking…"
                    : "Check booking status"}
                </button>
              )}
              {bookingMessage && (
                <p className="cf-notice" role="status">
                  {bookingMessage}
                </p>
              )}
              {bookingError && (
                <p className="cf-error" role="alert">
                  {bookingError}
                </p>
              )}
            </div>
          </section>
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
              <p className="cf-eyebrow">A useful next step for you</p>
              <h1 tabIndex={-1}>{config.alternative.headline}</h1>
              <p>{config.alternative.intro}</p>
            </div>
            <CallVideo
              media={config.alternative.video}
              title="Next-step offer video"
              preview={preview}
            />
            <div className="cf-prose cf-alternative-story">
              {config.alternative.story}
            </div>
            {config.alternative.benefits.length > 0 && (
              <section className="cf-benefits" aria-label="What is included">
                {config.alternative.benefits.map((benefit, i) => (
                  <div key={i}>
                    <span className="cf-benefit-check">
                      <Check size={20} aria-hidden="true" />
                    </span>
                    <h2>{benefit.title}</h2>
                    <p>{benefit.body}</p>
                  </div>
                ))}
              </section>
            )}
            <Proof publication={publication} alternative preview={preview} />
            <div className="cf-alternative-cta">
              {config.alternative.price && (
                <p className="cf-offer-price">{config.alternative.price}</p>
              )}
              {config.alternative.billing && (
                <p className="cf-billing">{config.alternative.billing}</p>
              )}
              <Destination url={config.alternative.url} preview={preview}>
                {config.alternative.cta}
              </Destination>
            </div>
            {config.alternative.faq.length > 0 && (
              <section className="cf-faq">
                <h2>Your questions, answered</h2>
                {config.alternative.faq.map((faq, i) => (
                  <details key={i}>
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </section>
            )}
            {config.alternative.faq.length > 0 && (
              <div className="cf-alternative-cta">
                {config.alternative.price && (
                  <p className="cf-offer-price">{config.alternative.price}</p>
                )}
                {config.alternative.billing && (
                  <p className="cf-billing">{config.alternative.billing}</p>
                )}
                <Destination url={config.alternative.url} preview={preview}>
                  {config.alternative.cta}
                </Destination>
              </div>
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
