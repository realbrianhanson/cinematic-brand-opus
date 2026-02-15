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
        <CustomCursor />
        <ScrollProgress />
        <Nav loaded={loaded} />
        <Hero loaded={loaded} />
        <ProofBar />
        <Divider />
        <Story />
        <Divider />
        <Expertise />
        <Stats />
        <Divider />
        <EventCTA />
        <Divider />
        <Speaking />
        <Divider />
        <FinalCTA />
        <Footer />
      </div>
    </>
  );
};

export default Index;
