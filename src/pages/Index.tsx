import { useEffect, useState } from "react";
import CustomCursor from "@/components/CustomCursor";
import ScrollProgress from "@/components/ScrollProgress";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import ProofBar from "@/components/ProofBar";
import Story from "@/components/Story";
import Expertise from "@/components/Expertise";
import Stats from "@/components/Stats";
import EventCTA from "@/components/EventCTA";
import Speaking from "@/components/Speaking";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Divider from "@/components/Divider";
import Loader from "@/components/Loader";
import SectionReveal from "@/components/SectionReveal";
import AmbientOrbs from "@/components/AmbientOrbs";
import FilmGrain from "@/components/FilmGrain";
import PageHead from "@/components/PageHead";

const HOMEPAGE_LD = [
  {
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
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Brian Hanson",
    url: "https://brianhanson.com/",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://brianhanson.com/resources?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  },
];

const Index = () => {
  const [siteVisible, setSiteVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleLoaderComplete = () => {
    setSiteVisible(true);
    setTimeout(() => {
      setLoaded(true);
      const hash = window.location.hash.replace("#", "");
      if (hash) {
        setTimeout(() => {
          const el = document.getElementById(hash);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    }, 100);
  };

  return (
    <>
      <PageHead title="Brian Hanson | Authority, Leadership, Legacy" description="Brian Hanson helps founders build authority, lead with clarity, and grow durable businesses with applied A.I. and modern leadership." url="https://brianhanson.com/" type="website" />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Person",
          name: "Brian Hanson",
          jobTitle: "Keynote Speaker, Advisor & Operator",
          url: "https://brianhanson.com/",
          description: "Brian Hanson helps founders and executives build authority, lead with clarity, and grow durable businesses through applied A.I., marketing, and leadership strategy.",
          knowsAbout: ["Artificial Intelligence", "Leadership", "Marketing Strategy", "Business Growth", "Personal Branding"],
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
      {!loaded && <Loader onComplete={handleLoaderComplete} />}
      <div
        className="public-site min-h-screen"
        style={{
          opacity: siteVisible ? 1 : 0,
          transition: "opacity 0.5s ease 0.2s",
        }}
      >
        <AmbientOrbs />
        <FilmGrain />
        <CustomCursor />
        <ScrollProgress />
        <Nav loaded={loaded} />
        <Hero loaded={loaded} />
        <ProofBar />
        <Divider />
        <SectionReveal><Story /></SectionReveal>
        <Divider />
        <Expertise />
        <Stats />
        <Divider />
        <SectionReveal><EventCTA /></SectionReveal>
        <Divider />
        <SectionReveal><Speaking /></SectionReveal>
        <Divider />
        <FinalCTA />
        <Footer />
      </div>
    </>
  );
};

export default Index;
