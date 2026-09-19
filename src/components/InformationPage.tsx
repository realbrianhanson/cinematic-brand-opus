import type { ReactNode } from "react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { Link } from "@/lib/router-compat";

export default function InformationPage({
  eyebrow,
  title,
  intro,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="min-h-screen text-white"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <Nav />
      <main
        id="main-content"
        className={`mx-auto px-6 pb-24 pt-32 md:pt-40 ${wide ? "max-w-6xl" : "max-w-3xl"}`}
      >
        <Link
          to="/"
          className="text-sm text-white/65 underline underline-offset-4 hover:text-white"
        >
          Home
        </Link>
        <p className="mt-10 text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
          {eyebrow}
        </p>
        <h1 className="mt-4 font-display text-5xl leading-[1.05] md:text-7xl">
          {title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
          {intro}
        </p>
        <div className="mt-12 space-y-10 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:leading-tight [&_h3]:font-semibold [&_p]:leading-relaxed [&_li]:leading-relaxed">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
