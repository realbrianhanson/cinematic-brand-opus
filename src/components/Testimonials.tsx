import { Star } from "lucide-react";

const testimonials = [
  {
    quote:
      "Brian's approach to A.I. is the first thing that finally made sense to me as an operator. We cut two days of weekly work in the first month.",
    name: "Marcus Reilly",
    title: "Founder",
    company: "Northbound Capital",
    initials: "MR",
    bg: "linear-gradient(135deg, #d8b46a, #9c7c3c)",
  },
  {
    quote:
      "I've sat through dozens of marketing talks. Brian is one of the rare people who's actually built it. His direct response training paid for itself in a week.",
    name: "Elena Park",
    title: "CMO",
    company: "Lumen Health",
    initials: "EP",
    bg: "linear-gradient(135deg, #f1d89b, #d8b46a)",
  },
  {
    quote:
      "I shipped my first internal tool with no code, no dev, no excuses. The community keeps me moving. Best three days I've spent on my business this year.",
    name: "David Okafor",
    title: "Owner",
    company: "Okafor & Sons Logistics",
    initials: "DO",
    bg: "linear-gradient(135deg, #9c7c3c, #5b4422)",
  },
];

const Testimonials = () => {
  return (
    <section
      id="results"
      className="relative py-28 lg:py-36"
      style={{ background: "var(--bg-deep)" }}
    >
      <div className="mx-auto px-6 lg:px-14" style={{ maxWidth: 1240 }}>
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-3 mb-6">
            <div style={{ width: 40, height: 1, background: "var(--gold)" }} />
            <span
              className="font-body font-semibold uppercase"
              style={{ fontSize: 10, letterSpacing: "0.3em", color: "var(--gold)" }}
            >
              Results
            </span>
            <div style={{ width: 40, height: 1, background: "var(--gold)" }} />
          </div>
          <h2
            className="font-display max-w-3xl mx-auto"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              lineHeight: 1.08,
              fontWeight: 500,
            }}
          >
            Trusted by the <span className="gold-italic" style={{ fontWeight: 600 }}>People in the Seats</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-7">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="flex flex-col p-8"
              style={{
                background: "var(--bg-section)",
                border: "1px solid var(--hairline)",
              }}
            >
              <div className="flex gap-0.5 mb-5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} size={14} fill="var(--gold)" stroke="none" />
                ))}
              </div>
              <p
                className="font-display italic mb-8 flex-1"
                style={{ fontSize: "1.1rem", lineHeight: 1.55, color: "var(--warm-white)", fontWeight: 400 }}
              >
                “{t.quote}”
              </p>
              <div className="flex items-center gap-3 pt-5" style={{ borderTop: "1px solid var(--hairline)" }}>
                <div
                  className="rounded-full flex items-center justify-center font-body font-bold"
                  style={{
                    width: 42, height: 42, background: t.bg,
                    color: "#0b0a09", fontSize: 13, letterSpacing: "0.05em",
                  }}
                >
                  {t.initials}
                </div>
                <div>
                  <div className="font-body font-semibold" style={{ fontSize: 14, color: "var(--warm-white)" }}>
                    {t.name}
                  </div>
                  <div className="font-body" style={{ fontSize: 12, color: "var(--warm-body)" }}>
                    {t.title} · {t.company}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
