import { useState } from "react";
import { Check, Clock3 } from "lucide-react";
import {
  callUrl,
  type CallApplicationState,
  type CallContact,
  type CallPublication,
} from "../../../supabase/functions/_shared/callFunnels";
import type { CallShowcase } from "@/config/types";
import CalendlyBooking from "./CalendlyBooking";
import GhlBooking from "./GhlBooking";
import CallDestination from "./CallDestination";
import { QuoteFigure } from "./CallProof";
import { selectedProof } from "./callShowcase";
import { HostCard } from "./CallShowcaseSections";

function firstName(name?: string) {
  return name?.trim().split(/\s+/)[0] ?? "";
}

export function Appointment({ state }: { state: CallApplicationState | null }) {
  const booking = state?.booking;
  if (booking?.status !== "booked") return null;
  let date = "Your scheduled time will be provided by your host.";
  // Stored times are UTC; a UTC label reads as wrong to visitors, so use their own zone.
  const zone = booking.timezone === "UTC" ? undefined : booking.timezone;
  if (booking.startsAt && Number.isFinite(Date.parse(booking.startsAt))) {
    const instant = new Date(booking.startsAt);
    try {
      date =
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "full",
          timeStyle: "short",
          ...(zone ? { timeZone: zone } : {}),
        }).format(instant) + (zone ? ` (${zone})` : "");
    } catch {
      date = `${instant.toLocaleString()} (your device’s time zone)`;
    }
  }
  return (
    <div className="cf-appointment">
      <span className="cf-appointment-check" aria-hidden="true">
        <Check size={22} strokeWidth={3} />
      </span>
      <div>
        <strong>Your call is booked</strong>
        <p className="cf-appointment-time">{date}</p>
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

function ApplicationReference({ id }: { id: string }) {
  const [copyMessage, setCopyMessage] = useState("");
  return (
    <div className="cf-application-reference">
      <p>Your application reference</p>
      <code>{id}</code>
      <p className="cf-small cf-muted">
        Keep this with your booking details. If the calendar asks for an
        application reference, paste it there.
      </p>
      <button
        className="cf-text-button"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(id);
            setCopyMessage("Application reference copied.");
          } catch {
            setCopyMessage("Select the reference above to copy it.");
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
  );
}

export type BookingStageProps = {
  publication: CallPublication;
  state: CallApplicationState | null;
  preview: boolean;
  contact: CallContact | null;
  bookingNotes: string;
  bookingPhone?: string;
  showcase: CallShowcase | null;
  accent: string;
  embedCalendly: boolean;
  embedGhl?: boolean;
  refreshing: boolean;
  bookingMessage: string;
  bookingError: string;
  onScheduled: (inviteeUri: string) => void;
  onRefresh: (() => void) | null;
  onPrepare: () => void;
};

export function BookingStage({
  publication,
  state,
  preview,
  contact,
  bookingNotes,
  bookingPhone,
  showcase,
  accent,
  embedCalendly,
  embedGhl = false,
  refreshing,
  bookingMessage,
  bookingError,
  onScheduled,
  onRefresh,
  onPrepare,
}: BookingStageProps) {
  const { config } = publication;
  const status = preview ? null : state?.booking?.status;
  const name = firstName(contact?.name);
  // The last showcase quote sits beside the calendar, where people decide,
  // unless the owner chose builder proof, which always takes precedence.
  const quote = selectedProof(publication).length
    ? undefined
    : showcase?.testimonials?.at(-1);
  // Only a scheduling provider sends invites and reschedule links; a booking
  // the team recorded by hand promises neither.
  const providerBooking = state?.booking?.source !== "admin";
  const heading =
    status === "booked"
      ? name
        ? `You’re booked, ${name}`
        : "You’re on the calendar"
      : status === "cancelled"
        ? "Let’s find another time"
        : name
          ? `Thanks, ${name}. Pick a time for your call`
          : "Pick a time for your call";
  // The agenda already sits beside the calendar, so the lede never repeats it.
  const lede =
    status === "booked"
      ? providerBooking
        ? "Your calendar invite and meeting link are on the way to your inbox"
        : "The team has your call on the calendar"
      : !embedCalendly && !embedGhl
        ? "Use the calendar to reserve your time"
        : name
          ? embedGhl
            ? "Your details are already filled in, so booking takes a few clicks"
            : "Your name and email are already filled in, so booking takes a few clicks"
          : "Choose a time below and your calendar invite arrives right away";
  const aside = (
    <aside className="cf-booking-aside" aria-label="About your call">
      <p className="cf-booking-length">
        <Clock3 size={18} aria-hidden="true" />
        {config.booking.minutes}-minute call
      </p>
      {config.booking.agenda && (
        <div className="cf-booking-agenda">
          <h2>What we’ll cover</h2>
          <p>{config.booking.agenda}</p>
        </div>
      )}
      <HostCard
        brand={
          showcase?.bookingHost
            ? {
                ...config.brand,
                hostName: showcase.bookingHost.name,
                hostRole: "",
                hostBio: showcase.bookingHost.bio,
              }
            : config.brand
        }
        photo={!showcase?.bookingHost}
        label="Who you’ll talk to"
      />
      {quote && <QuoteFigure item={quote} />}
    </aside>
  );
  const refreshButton = onRefresh && (
    <button
      type="button"
      className="cf-text-button cf-refresh"
      disabled={refreshing}
      onClick={onRefresh}
    >
      {refreshing ? "Checking your booking…" : "Check booking status"}
    </button>
  );
  return (
    <section className="cf-booking-page">
      <div className="cf-booking-head">
        {preview && <p className="cf-preview-label">Booking page preview</p>}
        <h1 tabIndex={-1}>{heading}</h1>
        <p className="cf-lede">{lede}</p>
      </div>
      {status === "booked" ? (
        <div className="cf-booking-grid">
          <div className="cf-booked">
            <Appointment state={state} />
            <div className="cf-booked-actions">
              <button
                type="button"
                className="cf-button cf-button-large"
                onClick={onPrepare}
              >
                Prepare for your call
              </button>
              {providerBooking && (
                <p className="cf-small cf-muted">
                  Need a different time? Use the reschedule link in your
                  confirmation email
                </p>
              )}
              {refreshButton}
            </div>
          </div>
          {aside}
        </div>
      ) : (
        <div className="cf-booking-grid">
          <div className="cf-calendar-card">
            {status === "cancelled" && (
              <p className="cf-notice">
                Your previous booking was cancelled. Choose a new time below.
                Your application is still here
              </p>
            )}
            {embedGhl ? (
              <GhlBooking
                url={config.booking.url}
                contact={contact}
                phone={bookingPhone}
              />
            ) : embedCalendly && state ? (
              <CalendlyBooking
                url={config.booking.url}
                applicationId={state.id}
                contact={contact}
                accent={accent}
                notes={bookingNotes}
                onScheduled={onScheduled}
              />
            ) : (
              <div className="cf-calendar-link">
                <h2>Choose a time that works for you</h2>
                <p className="cf-muted">
                  Your call is not booked yet. Complete the scheduling steps on
                  the calendar to reserve your time. Check your calendar
                  confirmation email for the appointment details.
                </p>
                <CallDestination url={config.booking.url} preview={preview}>
                  {config.booking.label || "Open the calendar"}
                </CallDestination>
                {!preview && state && <ApplicationReference id={state.id} />}
              </div>
            )}
          </div>
          {aside}
        </div>
      )}
      {status !== "booked" && refreshButton}
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
    </section>
  );
}
