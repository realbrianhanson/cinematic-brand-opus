import { useState } from "react";
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

const Index = () => {
  const [siteVisible, setSiteVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleLoaderComplete = () => {
    setSiteVisible(true);
    setTimeout(() => setLoaded(true), 100);
  };

  return (
    <>
      {!loaded && <Loader onComplete={handleLoaderComplete} />}
      <div
        className="min-h-screen"
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
