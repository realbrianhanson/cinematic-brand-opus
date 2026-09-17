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
import { siteConfig, absoluteUrl } from "@/config/site";

const { identity, metadata, sections } = siteConfig;

const HOMEPAGE_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Person",
    name: identity.name,
    jobTitle: identity.role,
    url: absoluteUrl("/"),
    description: metadata.socialDescription,
    knowsAbout: identity.knowsAbout,
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: identity.name,
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/resources")}?q={search_term_string}`,
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

  useEffect(() => {
    const scripts = HOMEPAGE_LD.map((data, i) => {
      const el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = `home-ld-${i}`;
      el.textContent = JSON.stringify(data);
      document.head.appendChild(el);
      return el;
    });
    return () => {
      for (const s of scripts) s.remove();
    };
  }, []);

  return (
    <>
      <PageHead
        title={metadata.defaultTitle}
        description={metadata.defaultDescription}
        url={absoluteUrl("/")}
        type="website"
      />
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
        {sections.proofBar && <ProofBar />}
        <Divider />
        {sections.story && (
          <>
            <SectionReveal><Story /></SectionReveal>
            <Divider />
          </>
        )}
        {sections.expertise && <Expertise />}
        {sections.results && <Stats />}
        <Divider />
        {sections.event && (
          <>
            <SectionReveal><EventCTA /></SectionReveal>
            <Divider />
          </>
        )}
        {sections.speaking && (
          <>
            <SectionReveal><Speaking /></SectionReveal>
            <Divider />
          </>
        )}
        {sections.newsletter && <FinalCTA />}
        <Footer />
      </div>
    </>
  );
};

export default Index;
