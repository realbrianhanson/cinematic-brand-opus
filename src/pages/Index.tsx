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
      <Stats />
      <EventCTA />
      <Speaking />
      <FinalCTA />
      <Footer />
    </div>
  );
};

export default Index;
