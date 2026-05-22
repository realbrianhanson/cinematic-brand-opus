import { useState } from "react";
import CustomCursor from "@/components/CustomCursor";
import ScrollProgress from "@/components/ScrollProgress";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import ProofBar from "@/components/ProofBar";
import Story from "@/components/Story";
import Expertise from "@/components/Expertise";
import EventCTA from "@/components/EventCTA";
import Testimonials from "@/components/Testimonials";
import Speaking from "@/components/Speaking";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Loader from "@/components/Loader";
import SectionReveal from "@/components/SectionReveal";
import PageHead from "@/components/PageHead";
import { Helmet } from "react-helmet-async";

const Index = () => {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <PageHead
        title="Brian Hanson | Authority, Leadership, Legacy"
        description="Keynote speaker and advisor Brian Hanson helps founders build authority, lead with clarity, and grow durable businesses through applied A.I. and modern leadership."
        url="https://brianhanson.com/"
        type="website"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Person",
          name: "Brian Hanson",
          jobTitle: "Keynote Speaker, Advisor & Operator",
          url: "https://brianhanson.com/",
          description:
            "Brian Hanson helps founders and executives build authority, lead with clarity, and grow durable businesses through applied A.I., marketing, and leadership strategy.",
          knowsAbout: [
            "Artificial Intelligence",
            "Leadership",
            "Marketing Strategy",
            "Business Growth",
            "Personal Branding",
          ],
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Brian Hanson",
          url: "https://brianhanson.com/",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://brianhanson.com/resources?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        })}</script>
      </Helmet>

      <Loader onComplete={() => setLoaded(true)} />

      <div className="public-site min-h-screen relative">
        {/* Fixed texture layers */}
        <div className="bg-grain" aria-hidden />
        <div className="bg-vignette" aria-hidden />

        <CustomCursor />
        <ScrollProgress />
        <Nav loaded={loaded} />

        <main id="main-content" className="relative" style={{ zIndex: 2 }}>
          <Hero loaded={loaded} />
          <ProofBar />
          <SectionReveal><Story /></SectionReveal>
          <Expertise />
          <SectionReveal><EventCTA /></SectionReveal>
          <SectionReveal><Testimonials /></SectionReveal>
          <SectionReveal><Speaking /></SectionReveal>
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
