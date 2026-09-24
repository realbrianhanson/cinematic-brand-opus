import { ArrowRight, Download, ExternalLink, Mail } from "lucide-react";
import InformationPage from "@/components/InformationPage";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { supportMailto } from "@/lib/informationPages";
import { Link } from "@/lib/router-compat";

export default function Support() {
  const config = useSiteConfig();
  const emailLink = supportMailto(config.identity.contactEmail);
  return (
    <InformationPage
      eyebrow="A clear next step"
      title="How can we help?"
      intro="Start with the type of resource or purchase you need help with"
      wide
    >
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-white/15 bg-white/[0.03] p-7">
          <Download className="text-[var(--brand-accent)]" aria-hidden="true" />
          <h2 className="mt-5">Find a website download</h2>
          <p className="mt-4 text-white/75">
            Use the private access link from your confirmation page or access
            email. If you have lost it, request a new link using the email you
            entered when claiming or buying the resource
          </p>
          <Link
            to="/offer-access?recover=1"
            className="mt-6 inline-flex items-center gap-2 font-semibold text-[var(--brand-accent)] underline underline-offset-4"
          >
            Recover download access <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <p className="mt-4 text-sm text-white/60">
            Keep your access link private. A refund can turn it off
          </p>
        </section>
        <section className="rounded-xl border border-white/15 bg-white/[0.03] p-7">
          <ExternalLink
            className="text-[var(--brand-accent)]"
            aria-hidden="true"
          />
          <h2 className="mt-5">Bought on another website?</h2>
          <p className="mt-4 text-white/75">
            Some Shop listings open a separate checkout or membership platform.
            Use that provider’s receipt, access instructions, and support for
            course access, subscriptions, billing, or refunds
          </p>
          <p className="mt-4 text-white/75">
            Those purchases are managed by the destination provider and will not
            appear in this website’s download recovery
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-flex items-center gap-2 font-semibold text-[var(--brand-accent)] underline underline-offset-4"
          >
            Find the original listing{" "}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
      <section className="border-t border-white/15 pt-9">
        <Mail className="mb-4 text-[var(--brand-accent)]" aria-hidden="true" />
        <h2>Still need a hand?</h2>
        <p className="mt-4 max-w-2xl text-white/75">
          Include the resource or product name, the email used at checkout, and
          any order reference. Describe what happened and which page you were
          on. Never send passwords, private access links, or full card details
        </p>
        {emailLink ? (
          <a
            href={emailLink}
            className="mt-6 inline-block break-all font-semibold text-[var(--brand-accent)] underline underline-offset-4"
          >
            {config.identity.contactEmail}
          </a>
        ) : (
          <p className="mt-4 text-white/70">
            Contact details have not been configured yet. For purchases made
            elsewhere, use the support details on your provider’s receipt
          </p>
        )}
        {config.sections.speaking && (
          <p className="mt-6 text-white/70">
            Organizing an event?{" "}
            <Link
              to="/speaking"
              className="text-white underline underline-offset-4"
            >
              Use the speaking inquiry page
            </Link>
          </p>
        )}
      </section>
    </InformationPage>
  );
}
