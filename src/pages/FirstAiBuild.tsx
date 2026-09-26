import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Copy,
  Download,
  Pencil,
  Rows3,
} from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import FormPrivacyLink from "@/components/FormPrivacyLink";
import {
  PROJECT_OPTIONS,
  buildFirstAiPlan,
  firstBuildInputSchema,
  firstAiPlanMarkdown,
  type FirstAiPlan,
  type FirstBuildInput,
  type ProjectId,
} from "@/lib/firstAiBuild";
import { subscribeToNewsletter } from "@/lib/newsletterSubscribe";
import type { SubscribeUiResult } from "@/lib/newsletterClient";
import { recordMeasurement } from "@/lib/measurement";
import type { ShopOffer } from "@/lib/shop";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]";
const primaryButton = `inline-flex min-h-12 items-center justify-center gap-3 rounded-md bg-[var(--brand-accent)] px-6 py-3 font-semibold text-[var(--brand-backdrop)] hover:bg-[var(--brand-accent-light)] ${focusRing}`;
const secondaryButton = `inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/25 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10 ${focusRing}`;
const inputStyle = `mt-2 block w-full rounded-md border border-white/30 bg-black/20 px-4 py-3 text-base text-white placeholder:text-white/45 ${focusRing}`;
const eyebrow =
  "text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent)]";
const sectionTitle = "font-display text-3xl leading-tight sm:text-4xl";

function BuildNewsletter() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<SubscribeUiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const done =
    result &&
    ["confirmation_sent", "already_subscribed", "already_requested"].includes(
      result.state,
    );
  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || done) return;
    submitting.current = true;
    setLoading(true);
    setResult(null);
    try {
      setResult(await subscribeToNewsletter(email.trim(), "first-ai-build"));
    } catch {
      setResult({
        state: "error",
        message:
          "We couldn’t complete your subscription. Please try again later.",
      });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }
  return (
    <section
      className="border-t border-white/15 pt-9"
      aria-labelledby="build-newsletter-title"
    >
      <h2
        id="build-newsletter-title"
        className="font-display text-2xl sm:text-3xl"
      >
        Keep building with Brian
      </h2>
      <p className="mt-3 max-w-2xl text-white/75">
        Optional: subscribe to Brian’s practical AI emails. Your plan is already
        yours to copy or download above.
      </p>
      {!done && (
        <form
          onSubmit={(event) => void subscribe(event)}
          className="mt-5 max-w-2xl"
        >
          <label
            htmlFor="build-newsletter-email"
            className="text-sm font-medium"
          >
            Email address
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
            <input
              id="build-newsletter-email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              disabled={loading}
              onChange={(event) => {
                setEmail(event.target.value);
                setResult(null);
              }}
              className={`${inputStyle} mt-0 min-w-0 flex-1`}
            />
            <button
              type="submit"
              disabled={loading}
              className={`${secondaryButton} shrink-0 disabled:opacity-60`}
            >
              {loading ? "Subscribing…" : "Subscribe to Brian’s emails"}
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/65">
            We’ll send a confirmation link if needed. This subscribes you to
            emails; it doesn’t email your build plan. Unsubscribe anytime.{" "}
            <FormPrivacyLink />
          </p>
        </form>
      )}
      <p
        role="status"
        className="mt-3 text-sm text-[var(--site-accent-ink,var(--brand-accent))]"
      >
        {result?.message}
      </p>
    </section>
  );
}

function ConnectedBuildContinuation({ project }: { project: ProjectId }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let current = true;
    // Optional continuation never blocks the immediate free plan.
    void import("@/lib/funnelJourneysClient")
      .then(({ getFunnelJourney }) =>
        getFunnelJourney("first-ai-build-next-step"),
      )
      .then((journey) => {
        if (current) setAvailable(!!journey);
      })
      .catch(() => {
        /* An unpublished or unavailable journey leaves existing support links intact. */
      });
    return () => {
      current = false;
    };
  }, []);
  return available ? (
    <div className="mt-6 rounded-md border border-white/20 p-4">
      <p className="text-sm text-white/75">
        Prefer help choosing? Choose the support you want for the project you’ve
        already planned.
      </p>
      <a
        href={`/funnels/first-ai-build-next-step?project=${project}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${secondaryButton} mt-3`}
      >
        Find my next step
        <ArrowRight size={18} aria-hidden="true" />
      </a>
      <p className="mt-2 text-xs text-white/60">
        Optional. Your plan is already yours; no email is required for these
        questions.
      </p>
    </div>
  ) : null;
}

function PlanResult({
  plan,
  offers,
  onEdit,
}: {
  plan: FirstAiPlan;
  offers: ShopOffer[];
  onEdit: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const promptDetails = useRef<HTMLDetailsElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">(
    "idle",
  );
  const [downloadState, setDownloadState] = useState<
    "idle" | "started" | "error"
  >("idle");
  const workshop = offers.find(
    (offer) => offer.slug === "app-building-workshop",
  );
  const pushten = offers.find((offer) => offer.slug === "pushten");
  const followUpKit = offers.find(
    (offer) =>
      offer.slug === "ai-follow-up-starter-kit" && offer.kind === "free",
  );
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  }, []);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(plan.buildPrompt);
      setCopyState("copied");
      recordMeasurement([
        {
          type: "build_prompt_copied",
          path: "/first-ai-build",
          project: plan.projectId,
        },
      ]);
    } catch {
      setCopyState("manual");
      if (promptDetails.current) promptDetails.current.open = true;
    }
  }
  function downloadPlan() {
    let objectUrl: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      objectUrl = URL.createObjectURL(
        new Blob([firstAiPlanMarkdown(plan)], {
          type: "text/markdown;charset=utf-8",
        }),
      );
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `first-ai-build-${plan.projectId}.md`;
      document.body.appendChild(anchor);
      anchor.click();
      setDownloadState("started");
      recordMeasurement([
        {
          type: "build_plan_downloaded",
          path: "/first-ai-build",
          project: plan.projectId,
        },
      ]);
    } catch {
      setDownloadState("error");
      if (promptDetails.current) promptDetails.current.open = true;
    } finally {
      anchor?.remove();
      if (objectUrl) {
        const completedUrl = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(completedUrl), 1000);
      }
    }
  }
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-6">
        <p className={`${eyebrow} flex items-center gap-2`}>
          <CheckCheck size={18} aria-hidden="true" />
          Your starting point is ready
        </p>
        <button
          type="button"
          onClick={onEdit}
          className={`${secondaryButton} min-h-11 border-transparent px-0`}
        >
          <Pencil size={15} aria-hidden="true" />
          Edit my answers
        </button>
      </div>
      <header className="pb-10 pt-8">
        <p className="text-sm text-white/65">
          {plan.forWhomLabel}
          {plan.businessType ? ` · ${plan.businessType}` : ""}
        </p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="mt-4 scroll-mt-28 font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] tracking-tight outline-none"
        >
          {plan.title}
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-white/80">
          {plan.summary}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/65">
          {plan.whyThisFits}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void copyPrompt()}
            className={primaryButton}
          >
            <Copy size={18} aria-hidden="true" />
            Copy build prompt
          </button>
          <button
            type="button"
            onClick={downloadPlan}
            className={secondaryButton}
          >
            <Download size={18} aria-hidden="true" />
            Download full plan
          </button>
        </div>
        <div
          role="status"
          className="mt-3 space-y-1 text-sm text-[var(--site-accent-ink,var(--brand-accent))]"
        >
          {copyState === "copied" && (
            <p>Build prompt copied. Paste it into your app builder to begin.</p>
          )}
          {copyState === "manual" && (
            <p>
              Copy is unavailable here. Select and copy the text in “Your
              ready-to-use build prompt” below.
            </p>
          )}
          {downloadState === "started" && (
            <p>Download started. Your .md file opens in any text editor.</p>
          )}
          {downloadState === "error" && (
            <p>
              The download couldn’t start. Your full plan is still on this page;
              select the text to save it.
            </p>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-white/60">
          Save your plan before leaving. Your answers stay in this page and
          reset when you reload. The app builder you choose may charge for
          usage.
        </p>
      </header>

      <div className="grid gap-10 border-y border-white/15 py-9 md:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="first-version-title">
          <p className={eyebrow}>01 / Keep it small</p>
          <h2 id="first-version-title" className={`${sectionTitle} mt-3`}>
            Your first version
          </h2>
          <ul className="mt-6 space-y-4">
            {plan.firstVersion.map((item) => (
              <li key={item} className="flex gap-3 text-white/80">
                <Check
                  className="mt-1 shrink-0 text-[var(--site-accent-ink,var(--brand-accent))]"
                  size={17}
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 text-sm font-semibold">Save these for later</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-white/65">
            {plan.notYet.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="screens-title"
          className="border-white/15 md:border-l md:pl-9"
        >
          <h2
            id="screens-title"
            className="flex items-center gap-3 font-display text-2xl"
          >
            <Rows3
              size={20}
              className="text-[var(--site-accent-ink,var(--brand-accent))]"
              aria-hidden="true"
            />
            What you’ll build
          </h2>
          <ol className="mt-6 space-y-6">
            {plan.screens.map((screen, index) => (
              <li key={screen.name} className="flex gap-4">
                <span className="font-display text-xl text-[var(--site-accent-ink,var(--brand-accent))]">
                  0{index + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{screen.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    {screen.purpose}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="py-10" aria-labelledby="build-example-title">
        <p className={eyebrow}>02 / See the idea in action</p>
        <h2 id="build-example-title" className={`${sectionTitle} mt-3`}>
          A small example. A clear result.
        </h2>
        <p className="mt-3 text-sm text-white/65">{plan.sample.label}</p>
        <div className="mt-6 grid overflow-hidden rounded-lg border border-white/20 md:grid-cols-2">
          <div className="p-5 sm:p-7">
            <h3 className="text-sm font-semibold">What goes in</h3>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/75">
              {plan.sample.input}
            </p>
          </div>
          <div className="border-t border-white/20 bg-[var(--brand-accent)]/5 p-5 sm:p-7 md:border-l md:border-t-0">
            <h3 className="text-sm font-semibold text-[var(--site-accent-ink,var(--brand-accent))]">
              What it should produce
            </h3>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
              {plan.sample.output}
            </p>
          </div>
        </div>
      </section>

      <section
        className="border-y border-white/15 py-9"
        aria-labelledby="build-prompt-title"
      >
        <p className={eyebrow}>03 / Take it into your builder</p>
        <h2 id="build-prompt-title" className={`${sectionTitle} mt-3`}>
          Your ready-to-use build prompt
        </h2>
        <p className="mt-4 max-w-3xl text-white/75">
          Paste this into an app builder such as Lovable to create a first
          draft. Use the sample data, try the checks below, then ask the builder
          to fix one issue at a time.
        </p>
        <details
          ref={promptDetails}
          className="mt-6 rounded-lg border border-white/20 bg-black/15 p-5 sm:p-7"
        >
          <summary
            className={`cursor-pointer font-semibold text-[var(--brand-accent)] ${focusRing}`}
          >
            View the complete build prompt
          </summary>
          <pre className="mt-5 whitespace-pre-wrap break-words font-body text-sm leading-relaxed text-white/80">
            {plan.buildPrompt}
          </pre>
        </details>
      </section>

      <section className="py-10" aria-labelledby="build-tests-title">
        <p className={eyebrow}>04 / Make sure it works</p>
        <h2 id="build-tests-title" className={`${sectionTitle} mt-3`}>
          Three checks before you use it
        </h2>
        <ol className="mt-6 divide-y divide-white/15">
          {plan.tests.map((test, index) => (
            <li
              key={test.action}
              className="grid gap-2 py-5 sm:grid-cols-[2rem_1fr]"
            >
              <span className="font-display text-2xl text-[var(--site-accent-ink,var(--brand-accent))]">
                {index + 1}.
              </span>
              <div>
                <h3 className="font-semibold">{test.action}</h3>
                <p className="mt-2 leading-relaxed text-white/70">
                  {test.expected}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <h3 className="mt-7 text-lg font-semibold">Your next three moves</h3>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-white/75">
          {plan.nextSteps.map((step) => (
            <li key={step} className="pl-2">
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section
        className="mb-10 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/5 p-6 sm:p-9"
        aria-labelledby="build-help-title"
      >
        <p className={eyebrow}>A next step, if you want support</p>
        <h2 id="build-help-title" className={`${sectionTitle} mt-3`}>
          Want help bringing this to life?
        </h2>
        <p className="mt-4 max-w-2xl text-white/75">
          {workshop
            ? "You have a starting point. Explore the App Building Workshop to see what the training includes and whether it fits the help you need."
            : "Start with Brian’s free guide to using AI in a small business, then work through your first version one step at a time."}
        </p>
        <a
          href={
            workshop
              ? "/offers/app-building-workshop"
              : "/guides/ai-for-small-business"
          }
          onClick={() => {
            if (workshop)
              recordMeasurement([
                {
                  type: "build_training_clicked",
                  path: "/first-ai-build",
                  project: plan.projectId,
                  offer_id: workshop.id,
                },
              ]);
          }}
          className={`${primaryButton} mt-6`}
        >
          {workshop
            ? "Explore the App Building Workshop"
            : "Read the free getting-started guide"}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
        {workshop && (
          <p className="mt-3 text-xs text-white/65">
            {workshop.kind === "paid" ? "Paid training. " : ""}Review the
            current details before deciding.
          </p>
        )}
        {pushten && (
          <p className="mt-6 text-sm text-white/75">
            Looking for a longer-term next step?{" "}
            <a
              href="/offers/pushten"
              onClick={() =>
                recordMeasurement([
                  {
                    type: "build_training_clicked",
                    path: "/first-ai-build",
                    project: plan.projectId,
                    offer_id: pushten.id,
                  },
                ])
              }
              className={`text-[var(--brand-accent)] underline underline-offset-4 ${focusRing}`}
            >
              Explore PushTen and what’s included
            </a>
            .
          </p>
        )}
        {plan.projectId === "follow-up" && followUpKit && (
          <p className="mt-4 text-sm">
            <a
              href="/offers/ai-follow-up-starter-kit"
              className={`text-[var(--brand-accent)] underline underline-offset-4 ${focusRing}`}
            >
              Get the free AI Follow-Up Starter Kit
            </a>{" "}
            <span className="text-white/65">
              for more practice with follow-up.
            </span>
          </p>
        )}
        <ConnectedBuildContinuation project={plan.projectId} />
      </section>
      <BuildNewsletter />
    </div>
  );
}

export default function FirstAiBuild({
  offers = [],
}: {
  offers?: ShopOffer[];
}) {
  const [project, setProject] = useState<ProjectId | "">("");
  const [forWhom, setForWhom] = useState<FirstBuildInput["forWhom"] | "">("");
  const [businessType, setBusinessType] = useState("");
  const [audience, setAudience] = useState("");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<FirstAiPlan | null>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const editing = useRef(false);
  useEffect(() => {
    if (!plan && editing.current) {
      formHeading.current?.focus({ preventScroll: true });
      formHeading.current?.scrollIntoView({ block: "start" });
      editing.current = false;
    }
  }, [plan]);
  function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = firstBuildInputSchema.safeParse({
      project,
      forWhom,
      businessType,
      audience,
    });
    if (!parsed.success) {
      setError(
        !project || !forWhom
          ? "Choose a task and who you’re building for to create your plan."
          : "Use plain text of 120 characters or fewer for each optional answer.",
      );
      return;
    }
    setError("");
    setPlan(buildFirstAiPlan(parsed.data));
    recordMeasurement([
      {
        type: "build_plan_created",
        path: "/first-ai-build",
        project: parsed.data.project,
      },
    ]);
  }
  return (
    <div className="min-h-screen bg-[var(--site-surface,var(--brand-backdrop))] font-body text-white">
      <Nav />
      <main
        id="main-content"
        className="mx-auto min-w-0 max-w-6xl px-5 pb-20 pt-32 [overflow-wrap:anywhere] sm:px-8 sm:pt-40"
      >
        {plan ? (
          <PlanResult
            plan={plan}
            offers={offers}
            onEdit={() => {
              editing.current = true;
              setPlan(null);
            }}
          />
        ) : (
          <>
            <header className="grid gap-10 pb-12 lg:grid-cols-[1.25fr_0.8fr] lg:items-center lg:gap-16">
              <div>
                <p className={eyebrow}>
                  Your first AI build · A free tool from Brian Hanson
                </p>
                <h1 className="mt-5 font-display text-[clamp(2.7rem,6.5vw,5rem)] leading-[1.02] tracking-tight">
                  One useful idea.
                  <br />
                  <span className="italic text-[var(--site-accent-ink,var(--brand-accent))]">
                    A clear way to build it.
                  </span>
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
                  Not sure what to build with AI? Choose a business task. Get a
                  focused app idea, a ready-to-copy build prompt, and three
                  checks to see if it works.
                </p>
                <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70">
                  <span className="inline-flex items-center gap-2">
                    <Check
                      size={15}
                      className="text-[var(--site-accent-ink,var(--brand-accent))]"
                      aria-hidden="true"
                    />
                    No coding experience needed
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Check
                      size={15}
                      className="text-[var(--site-accent-ink,var(--brand-accent))]"
                      aria-hidden="true"
                    />
                    No email required
                  </span>
                </p>
                <a href="#build-planner" className={`${primaryButton} mt-6`}>
                  Find my first build{" "}
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              </div>
              <aside
                className="relative hidden border-l-2 border-[var(--brand-accent)] bg-white/[0.035] px-6 py-7 sm:px-8 lg:block"
                aria-label="An example of what your plan includes"
              >
                <p className={eyebrow}>Inside your build plan</p>
                <h2 className="mt-4 font-display text-3xl">
                  From “I should try AI”
                  <br />
                  to “I can start here.”
                </h2>
                <ol className="mt-6 divide-y divide-white/15 text-sm">
                  {[
                    "One practical project, sized for a first build",
                    "The screens and features to start with",
                    "A complete prompt to paste into your builder",
                    "Sample data and a three-point test plan",
                  ].map((item, index) => (
                    <li className="flex gap-4 py-3" key={item}>
                      <span className="text-[var(--site-accent-ink,var(--brand-accent))]">
                        0{index + 1}
                      </span>
                      <span className="text-white/80">{item}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            </header>

            <form
              onSubmit={createPlan}
              className="border-t border-white/20 pt-9"
            >
              <h2
                ref={formHeading}
                id="build-planner"
                tabIndex={-1}
                className={`${sectionTitle} scroll-mt-28 outline-none`}
              >
                Let’s find your starting point.
              </h2>
              <p className="mt-3 text-white/65">
                Two choices. Add a little context if you want to make the plan
                your own.
              </p>
              <fieldset className="mt-9">
                <legend className="text-lg font-semibold">
                  <span className="mr-3 text-[var(--site-accent-ink,var(--brand-accent))]">
                    01
                  </span>
                  Which task would you like to make easier?
                </legend>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {PROJECT_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className={`relative flex cursor-pointer gap-3 rounded-lg border p-5 transition-colors ${project === option.id ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10" : "border-white/25 hover:border-white/50"}`}
                    >
                      <input
                        type="radio"
                        name="project"
                        value={option.id}
                        required
                        checked={project === option.id}
                        onChange={() => {
                          setProject(option.id);
                          setError("");
                        }}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
                      />
                      <span>
                        <span className="block font-semibold">
                          {option.title}
                        </span>
                        <span className="mt-2 block text-sm leading-relaxed text-white/70">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="mt-9">
                <legend className="text-lg font-semibold">
                  <span className="mr-3 text-[var(--site-accent-ink,var(--brand-accent))]">
                    02
                  </span>
                  Who are you building for?
                </legend>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  {(
                    [
                      { value: "my-business", label: "My own business" },
                      { value: "client", label: "A client or business I help" },
                    ] as const
                  ).map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-5 py-4 ${forWhom === option.value ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10" : "border-white/25 hover:border-white/50"}`}
                    >
                      <input
                        type="radio"
                        name="forWhom"
                        value={option.value}
                        required
                        checked={forWhom === option.value}
                        onChange={() => {
                          setForWhom(option.value);
                          setError("");
                        }}
                        className="h-4 w-4 accent-[var(--brand-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-9 max-w-3xl rounded-lg border border-white/15 bg-white/[0.025] p-5 sm:p-6">
                <h3 className="font-semibold">
                  Make it yours{" "}
                  <span className="font-normal text-white/60">(optional)</span>
                </h3>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <label
                    htmlFor="build-business"
                    className="text-sm font-medium"
                  >
                    Type of business
                    <input
                      id="build-business"
                      type="text"
                      autoComplete="off"
                      maxLength={120}
                      value={businessType}
                      onChange={(event) => setBusinessType(event.target.value)}
                      placeholder="e.g. a local landscaping business"
                      className={inputStyle}
                    />
                  </label>
                  <label
                    htmlFor="build-audience"
                    className="text-sm font-medium"
                  >
                    Who does it help?
                    <input
                      id="build-audience"
                      type="text"
                      autoComplete="off"
                      maxLength={120}
                      value={audience}
                      onChange={(event) => setAudience(event.target.value)}
                      placeholder="e.g. homeowners asking for a quote"
                      className={inputStyle}
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-white/60">
                  A general description is enough. Use sample details, not
                  customer names or private information.
                </p>
              </div>
              {error && (
                <p
                  role="alert"
                  className="mt-5 text-sm text-[var(--site-accent-ink,var(--brand-accent))]"
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                className={`${primaryButton} mt-7 w-full sm:w-auto`}
              >
                Create my free build plan
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/60">
                Built from three practical starter playbooks, tailored to your
                choices. Your answers stay in this page. No account or payment
                needed to get your plan.
              </p>
            </form>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
