import { useEffect, useRef, useState } from "react";
import {
  advanceFunnelJourney,
  loadFunnelSession,
  newFunnelToken,
  startFunnelJourney,
} from "@/lib/funnelJourneysClient";
import {
  funnelProviderUrl,
  funnelInitialProject,
  type FunnelSession,
} from "@/lib/funnelJourneys";

type FunnelJourneyProps = { slug: string; initialProject?: string };
export default function FunnelJourney(props: FunnelJourneyProps) {
  const project =
    props.slug === "first-ai-build-next-step"
      ? funnelInitialProject(props.initialProject)
      : undefined;
  return (
    <FunnelJourneySession
      key={`${props.slug}:${project ?? ""}`}
      slug={props.slug}
      initialProject={project}
    />
  );
}
function FunnelJourneySession({ slug, initialProject }: FunnelJourneyProps) {
  const projectKey =
    slug === "first-ai-build-next-step"
      ? funnelInitialProject(initialProject)
      : undefined;
  const storageKey = `journey:${slug}${projectKey ? `:${projectKey}` : ""}`;
  const [session, setSession] = useState<FunnelSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const token = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [session?.step.id]);
  const pending = useRef<{
    id: string;
    answer?: string;
    session: FunnelSession;
  } | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const epoch = ++generation.current;
    let nextToken: string | null = null;
    try {
      nextToken = sessionStorage.getItem(storageKey);
    } catch {
      /* memory-only session remains functional */
    }
    if (!nextToken || !/^[a-f0-9]{64}$/.test(nextToken))
      nextToken = newFunnelToken();
    token.current = nextToken;
    try {
      sessionStorage.setItem(storageKey, nextToken);
    } catch {
      /* storage optional */
    }
    setBusy(true);
    setError("");
    setSession(null);
    pending.current = null;
    void startFunnelJourney(slug, nextToken)
      .then(async (value) => {
        if (epoch !== generation.current) return;
        setSession(value);
        const project = funnelInitialProject(initialProject);
        if (
          slug === "first-ai-build-next-step" &&
          project &&
          value.version === 0 &&
          value.step.id === "project" &&
          value.step.kind === "choice" &&
          value.step.options?.some((option) => option.id === project)
        ) {
          // Reuse only the already-selected project enum. The server validates and routes it.
          const request = {
            id: crypto.randomUUID(),
            session: value,
            answer: project,
          };
          pending.current = request;
          setAnswer(project);
          const continued = await advanceFunnelJourney(
            nextToken,
            value,
            request.id,
            project,
          );
          if (epoch === generation.current) {
            setSession(continued);
            setAnswer("");
            pending.current = null;
          }
        }
      })
      .catch((e) => {
        if (epoch === generation.current) setError(e.message);
      })
      .finally(() => {
        if (epoch === generation.current) setBusy(false);
      });
    return () => {
      generation.current = epoch + 1;
    };
  }, [slug, initialProject, storageKey]);
  const accept = (value: FunnelSession) => {
    setSession(value);
    setAnswer("");
    pending.current = null;
  };
  async function advance() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    const request = pending.current ?? {
      id: crypto.randomUUID(),
      session,
      ...(session.step.kind === "choice" ? { answer } : {}),
    };
    pending.current = request;
    try {
      accept(
        await advanceFunnelJourney(
          token.current,
          request.session,
          request.id,
          request.answer,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry this step.");
    } finally {
      setBusy(false);
    }
  }
  async function reload(restart = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    if (restart) {
      token.current = newFunnelToken();
      try {
        sessionStorage.setItem(storageKey, token.current);
      } catch {
        /* optional */
      }
    }
    try {
      accept(
        await (restart
          ? startFunnelJourney(slug, token.current)
          : loadFunnelSession(token.current)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const step = session?.step;
  const button =
    "rounded-md bg-[var(--brand-accent)] px-5 py-3 font-semibold text-[var(--brand-backdrop)] disabled:opacity-50";
  return (
    <main className="min-h-screen bg-[var(--site-surface,var(--brand-backdrop))] px-5 py-12 text-[var(--site-ink,#fff)]">
      <div className="mx-auto max-w-2xl">
        <a className="text-sm underline" href="/">
          Back to home
        </a>
        <p className="mt-8 text-sm opacity-70">
          {session?.title ?? "Your next step"}
        </p>
        {session && (
          <nav aria-label="Journey progress" className="my-5 text-sm">
            <ol className="flex flex-wrap gap-2">
              {session.visited.map((item, i) => (
                <li key={item.id}>
                  {i + 1}. {item.title} <span aria-hidden>→</span>
                </li>
              ))}
              <li aria-current="step">
                {session.visited.length + 1}. {step?.title}
              </li>
            </ol>
          </nav>
        )}
        {busy && !session && (
          <p role="status" className="py-8">
            Loading your journey…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="my-5 rounded-md border border-current p-4"
          >
            <p>{error}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <button
                type="button"
                disabled={busy}
                className="underline"
                onClick={() => void reload()}
              >
                Reload current step
              </button>
              <button
                type="button"
                disabled={busy}
                className="underline"
                onClick={() => void reload(true)}
              >
                Start again
              </button>
            </div>
          </div>
        )}
        {step && (
          <section
            key={step.id}
            aria-labelledby="journey-step-title"
            className="rounded-xl border border-white/15 p-6 sm:p-8"
          >
            <h1
              id="journey-step-title"
              ref={heading}
              tabIndex={-1}
              className="text-3xl font-semibold"
            >
              {step.title}
            </h1>
            <p className="mt-5 whitespace-pre-line leading-relaxed opacity-80">
              {step.body}
            </p>
            {step.kind === "choice" && (
              <fieldset
                disabled={busy || !!pending.current}
                className="mt-6 space-y-3"
              >
                <legend className="mb-3 text-sm">Choose one answer</legend>
                {step.options?.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-white/20 p-4"
                  >
                    <input
                      className="mt-1"
                      type="radio"
                      name="journey-answer"
                      value={option.id}
                      checked={answer === option.id}
                      onChange={() => setAnswer(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {step.kind === "offer" && (
              <div className="mt-6">
                {session.offer ? (
                  <a
                    className="inline-block underline"
                    href={`/offers/${encodeURIComponent(session.offer.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View {session.offer.title}{" "}
                    <span className="text-sm">(opens a new tab)</span>
                  </a>
                ) : (
                  <p>
                    This offer is not available right now. You can continue
                    without it.
                  </p>
                )}
                <p className="mt-3 text-sm opacity-70">
                  The offer page handles access or checkout. Continuing here
                  does not confirm a purchase or download.
                </p>
              </div>
            )}
            {step.kind === "provider" && (
              <div className="mt-6">
                {funnelProviderUrl(step.url) && (
                  <a
                    className="underline"
                    href={step.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open the provider (new tab)
                  </a>
                )}
                <p className="mt-3 text-sm opacity-70">
                  Booking, pricing and confirmation are handled by the provider.
                  Continuing here does not confirm a booking or payment.
                </p>
              </div>
            )}
            {step.kind !== "end" ? (
              <button
                type="button"
                className={`${button} mt-7`}
                disabled={
                  busy ||
                  (step.kind === "choice" && !answer && !pending.current)
                }
                onClick={() => void advance()}
              >
                {busy
                  ? "Saving progress…"
                  : pending.current
                    ? "Retry this step"
                    : "Continue"}
              </button>
            ) : (
              <p role="status" className="mt-7 font-medium">
                You’ve reached the end of this journey.
              </p>
            )}
          </section>
        )}
        <p className="mt-6 text-sm opacity-60">
          Only your selected choices and journey progress are saved. Sessions
          expire after seven days; expired records are removed daily. No name,
          email or free-text answers are requested here.
        </p>
      </div>
    </main>
  );
}
