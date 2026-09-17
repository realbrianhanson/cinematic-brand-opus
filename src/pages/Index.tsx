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
import { siteConfig } from "@/config/site";

const { sections } = siteConfig;

const Index = () => {
  // The page is fully visible from the first paint. The intro is an overlay on
  // top of it, so no-JS visitors and storage failures still see the content.
  const [introDone, setIntroDone] = useState(false);

  const handleLoaderComplete = () => setIntroDone(true);

  // Scroll to a hash target once the page is interactive (footer/nav anchors).
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {!introDone && <Loader onComplete={handleLoaderComplete} />}
      <div className="public-site min-h-screen">
        <AmbientOrbs />
        <FilmGrain />
        <CustomCursor />
        <ScrollProgress />
        <Nav loaded />
        <main id="main-content">
          <Hero loaded />
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
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
