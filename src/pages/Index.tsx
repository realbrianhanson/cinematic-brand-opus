import { useEffect } from "react";
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
import HomeResources from "@/components/HomeResources";
import HomeTestimonials from "@/components/HomeTestimonials";
import HomeShop from "@/components/HomeShop";
import type { ShopOffer } from "@/lib/shop";
import { useSiteConfig } from "@/config/SiteConfigContext";

export default function Index({
  shopShowcase = [],
}: {
  shopShowcase?: ShopOffer[];
}) {
  const { sections } = useSiteConfig();
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const timer = window.setTimeout(
      () =>
        document
          .getElementById(hash)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      200,
    );
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="public-site min-h-screen bg-[var(--brand-backdrop)]">
      <Nav />
      <main id="main-content">
        <Hero />
        {sections.proofBar && <ProofBar />}
        {sections.event && <EventCTA />}
        <HomeShop offers={shopShowcase} />
        <HomeTestimonials />
        {sections.story && <Story />}
        {sections.expertise && <Expertise />}
        {sections.results && <Stats />}
        {sections.speaking && <Speaking />}
        <HomeResources />
        {sections.newsletter && <FinalCTA />}
      </main>
      <Footer />
    </div>
  );
}
