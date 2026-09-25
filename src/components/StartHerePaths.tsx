import { ArrowRight, Check } from "lucide-react";
import { Link, useSearchParams } from "@/lib/router-compat";
import {
  START_HERE_GOALS,
  startHereGoal,
  startHereGoalHref,
  startHereRecommendation,
} from "@/lib/startHere";
import type { ShopOffer } from "@/lib/shop";
import WorkflowDemonstration from "./WorkflowDemonstration";

export default function StartHerePaths({ offers }: { offers: ShopOffer[] }) {
  const [search] = useSearchParams();
  const goal = startHereGoal(search.get("goal"));
  const recommendation = startHereRecommendation(goal, offers);
  return (
    <>
      <nav
        aria-label="Choose what you want to do"
        className="grid border-y border-white/20 md:grid-cols-3"
      >
        {START_HERE_GOALS.map((item, index) => (
          <Link
            key={item.id}
            to={startHereGoalHref(item.id, search)}
            resetScroll={false}
            aria-current={item.id === goal ? "true" : undefined}
            className={`group flex gap-4 border-b border-white/15 px-4 py-4 md:py-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)] ${item.id === goal ? "bg-[var(--brand-accent)]/10" : "hover:bg-white/5"}`}
          >
            <span
              className="pt-1 text-xs text-[var(--brand-accent)]"
              aria-hidden="true"
            >
              0{index + 1}
            </span>
            <span>
              <span
                className={`block font-semibold ${item.id === goal ? "text-[var(--brand-accent)]" : "text-white"}`}
              >
                {item.label}
              </span>
              <span className="mt-1 block text-sm text-white/65">
                {item.detail}
              </span>
              <span
                className={`mt-3 hidden text-xs md:block ${item.id === goal ? "text-[var(--brand-accent)]" : "text-white/60"}`}
              >
                {item.id === goal ? "Your selected path" : "Choose this path →"}
              </span>
            </span>
          </Link>
        ))}
      </nav>
      <section
        aria-labelledby="your-next-step"
        className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-14"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--brand-accent)]">
            Your first project
          </p>
          <h2 id="your-next-step" className="mt-4" aria-live="polite">
            {recommendation.heading}
          </h2>
          <p className="mt-5 max-w-2xl text-white/75">
            {recommendation.description}
          </p>
          <ol className="mt-7 space-y-4">
            {recommendation.tasks.map((task, index) => (
              <li key={task} className="flex gap-4 text-white/85">
                <span className="text-[var(--brand-accent)]" aria-hidden="true">
                  {index + 1}.
                </span>
                <span>{task}</span>
              </li>
            ))}
          </ol>
          <div className="mt-7 flex gap-3 border-t border-white/15 pt-5 text-sm text-white/70">
            <Check
              size={19}
              className="mt-1 shrink-0 text-[var(--brand-accent)]"
              aria-hidden="true"
            />
            <p>
              <strong className="font-semibold text-white">
                How to check your work:{" "}
              </strong>
              {recommendation.check}
            </p>
          </div>
        </div>
        <aside
          aria-label="Resource for your selected path"
          className="self-start border-l-2 border-[var(--brand-accent)] bg-white/[0.04] p-6 sm:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-accent)]">
            {recommendation.resource.type}
          </p>
          <h3 className="mt-5 font-display text-2xl">
            {recommendation.resource.title}
          </h3>
          <p className="mt-4 text-white/75">
            {recommendation.resource.summary}
          </p>
          <Link
            to={recommendation.resource.href}
            className="mt-7 inline-flex w-full items-center justify-between gap-4 bg-[var(--brand-accent)] px-5 py-4 text-sm font-semibold text-[var(--brand-backdrop)] hover:bg-[var(--brand-accent-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
          >
            {recommendation.resource.label}
            <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
          </Link>
          <p className="mt-4 text-sm text-white/60">
            Start with one project. Choose more training when you know what you
            need help with.
          </p>
        </aside>
      </section>
      {goal === "follow-up" && <WorkflowDemonstration />}
    </>
  );
}
