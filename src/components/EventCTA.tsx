import { ArrowRight, Calendar } from "lucide-react";

const days = [
  {
    day: "Day 1",
    title: "The A.I. Foundation",
    body: "Cut through the noise. Learn the exact tools and frameworks that work for real businesses today — not theory, not hype.",
  },
  {
    day: "Day 2",
    title: "Marketing on Autopilot",
    body: "Plug A.I. into your offers, content, and customer flow. Build a marketing engine that runs while you sleep.",
  },
  {
    day: "Day 3",
    title: "Build Without Code",
    body: "Ship a real tool — landing page, automation, mini-app — using the same no-code stack behind 3,000+ Revven users.",
  },
];

const EventCTA = () => {
  return (
    <section
      id="event"
      className="relative py-28 lg:py-36"
      style={{ background: "var(--bg-warm)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(241,216,155,0.10), transparent 70%)",
        }}
      />
      <div className="relative mx-auto px-6 lg:px-14" style={{ maxWidth: 1240 }}>
        <div className="text-center mb-14">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full"
            style={{ border: "1px solid var(--hairline)", background: "rgba(216,180,106,0.05)" }}
          >
            <Calendar size={13} color="var(--gold)" />
            <span
              className="font-body font-semibold uppercase"
              style={{ fontSize: 11, letterSpacing: "0.18em", color: "var(--gold)" }}
            >
              Next cohort starts soon · AIForBeginners.com
            </span>
          </div>
          <h2
            className="font-display max-w-3xl mx-auto"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              lineHeight: 1.08,
              fontWeight: 500,
            }}
          >
            3 Days That <span className="gold-italic" style={{ fontWeight: 600 }}>Change How You Do Business</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-14">
          {days.map((d, i) => (
            <div
              key={i}
              className="p-8 transition-transform duration-300 hover:-translate-y-1.5"
              style={{
                background: "var(--bg-section)",
                border: "1px solid var(--hairline)",
              }}
              data-hover
            >
              <div
                className="font-body font-bold uppercase mb-4"
                style={{ fontSize: 11, letterSpacing: "0.25em", color: "var(--gold)" }}
              >
                {d.day}
              </div>
              <h3
                className="font-display mb-3"
                style={{ fontSize: "1.5rem", lineHeight: 1.2, color: "var(--warm-white)", fontWeight: 600 }}
              >
                {d.title}
              </h3>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--warm-body)" }}>{d.body}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <a
            href="https://aiforbeginners.com"
            target="_blank"
            rel="noopener noreferrer"
            data-hover
            className="inline-flex items-center gap-2 font-body font-bold uppercase rounded-sm"
            style={{
              fontSize: 13,
              letterSpacing: "0.12em",
              background: "linear-gradient(135deg, #f1d89b, #d8b46a 60%, #9c7c3c)",
              color: "#0b0a09",
              padding: "22px 44px",
              boxShadow: "0 22px 60px -22px rgba(216,180,106,0.6)",
            }}
          >
            Register Free — AIForBeginners.com
            <ArrowRight size={16} strokeWidth={2.5} />
          </a>
          <p className="mt-4 font-body" style={{ fontSize: 13, color: "var(--warm-body)" }}>
            100% free. No credit card. Just show up ready to learn.
          </p>
        </div>
      </div>
    </section>
  );
};

export default EventCTA;
