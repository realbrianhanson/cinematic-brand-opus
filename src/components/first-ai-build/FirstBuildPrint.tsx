import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { FirstAiPlan } from "@/lib/firstAiBuild";
import "./first-build-print.css";

/** A separate print document keeps app chrome and optional offers off the PDF. */
export function FirstBuildPrint({ plan }: { plan: FirstAiPlan }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <article className="first-build-print" aria-hidden="true">
      <header>
        <p className="first-build-print-kicker">
          YOUR FIRST AI BUILD / BRIAN HANSON
        </p>
        <h1>{plan.title}</h1>
        <p className="first-build-print-summary">{plan.summary}</p>
        <dl>
          <div>
            <dt>Building for</dt>
            <dd>{plan.forWhomLabel}</dd>
          </div>
          <div>
            <dt>Business</dt>
            <dd>{plan.businessType}</dd>
          </div>
          <div>
            <dt>Audience</dt>
            <dd>{plan.audience}</dd>
          </div>
        </dl>
        <p>{plan.whyThisFits}</p>
      </header>
      <section>
        <h2>
          <span>01</span> Your first version
        </h2>
        <ul>
          {plan.firstVersion.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3>Save these for later</h3>
        <ul>
          {plan.notYet.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3>The screens you’ll build</h3>
        <ol>
          {plan.screens.map((screen) => (
            <li key={screen.name}>
              <strong>{screen.name}.</strong> {screen.purpose}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2>
          <span>02</span> A small example. A clear result.
        </h2>
        <p className="first-build-print-note">{plan.sample.label}</p>
        <h3>What goes in</h3>
        <div className="first-build-print-example">{plan.sample.input}</div>
        <h3>What it should produce</h3>
        <div className="first-build-print-example">{plan.sample.output}</div>
      </section>
      <section className="first-build-print-prompt-section">
        <h2>
          <span>03</span> Your complete build prompt
        </h2>
        <p>
          Paste this into your app builder to create a first draft. Use
          fictional data and run every acceptance check.
        </p>
        <div className="first-build-print-prompt">{plan.buildPrompt}</div>
      </section>
      <section>
        <h2>
          <span>04</span> Check your build
        </h2>
        <ol>
          {plan.tests.map((test) => (
            <li key={test.action}>
              <strong>{test.action}</strong>
              <p>Expected: {test.expected}</p>
            </li>
          ))}
        </ol>
        <h3>Your next three moves</h3>
        <ol>
          {plan.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <footer>
        This is a practice prototype plan, not a finished production app or a
        promise of income. Use fictional data. Your chosen builder may have its
        own account requirements, limits, or fees.
      </footer>
    </article>,
    document.body,
  );
}
