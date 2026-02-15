import CustomCursor from "@/components/CustomCursor";
import ScrollProgress from "@/components/ScrollProgress";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import ProofBar from "@/components/ProofBar";
import Story from "@/components/Story";
import Expertise from "@/components/Expertise";

const sections = [
  { id: "stats", label: "Stats" },
  { id: "stats", label: "Stats" },
  { id: "event", label: "Event CTA" },
  { id: "speaking", label: "Speaking" },
  { id: "cta", label: "Final CTA" },
  { id: "footer", label: "Footer" },
];

const Index = () => {
  return (
    <div className="min-h-screen">
      <CustomCursor />
      <ScrollProgress />
      <Nav />
      <Hero />
      <ProofBar />
      <Story />
      <Expertise />
      {sections.map(({ id, label }) => (
        <section
          key={id}
          id={id}
          className="flex items-center justify-center border-b border-card-border py-32 first:py-20"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="text-center">
            <span
              className="font-body text-xs uppercase tracking-[0.3em]"
              style={{ color: "var(--gold)" }}
            >
              Section
            </span>
            <h2
              className="mt-2 font-display text-5xl text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {label}
            </h2>
          </div>
        </section>
      ))}
    </div>
  );
};

export default Index;
