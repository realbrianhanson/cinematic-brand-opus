import InformationPage from "@/components/InformationPage";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { isBrianOwner, supportMailto } from "@/lib/informationPages";
import { Link } from "@/lib/router-compat";

export default function SitePolicy({ kind }: { kind: "privacy" | "terms" }) {
  const config = useSiteConfig();
  const owner = config.identity.legalName || config.identity.name;
  const email = supportMailto(
    config.identity.contactEmail,
    kind === "privacy" ? "Privacy request" : "Website terms question",
  );
  const privacy = kind === "privacy";
  const sections = privacy
    ? [
        [
          "Information you provide",
          "Newsletter forms collect the email address you submit and subscription, confirmation, and unsubscribe records. Speaking forms collect the contact and event details you enter. Website downloads and purchases record your email, optional name, selected resource, order status, price where relevant, and delivery or access records. Support messages contain the information you choose to send",
        ],
        [
          "How it is used",
          "Information is used to provide requested downloads and access links, process and support orders, respond to inquiries, maintain subscription preferences, and protect the website against abuse. Claiming a free download adds you to the weekly email only if you leave its opt-in box checked, and only after you confirm by email. Unchecking the box never affects the download. Making an inquiry or a purchase does not subscribe you. Every newsletter email includes a one-click unsubscribe link",
        ],
        [
          "Technical information and browser storage",
          "The website and its hosting providers process request information such as IP addresses, browser details, visited pages, timestamps, and errors for operation, security, and service measurement. Public form protections use hashed request identifiers and rate limits. Browser storage supports administrator sign-in, preferences, recovery of unsaved editor work, and private download access. Your browser settings let you manage or clear stored information; doing so may sign you out or remove saved access",
        ],
        [
          "Optional website measurement",
          "If you allow measurement, this website records public page visits, offer views, and outbound clicks using a random session stored in your browser. The session ends after 30 minutes of inactivity or 24 hours. Source, medium, and campaign labels may connect these visits to a completed website claim or purchase; measurement records do not include names, emails, full referring URLs, or private access links. Optional session and event records are removed by a daily cleanup after 90 days. Administrator visits, preview hosts, and supported browser privacy signals are excluded. You can change your choice with Measurement preferences in the footer. Turning it off requests removal of the current browser session’s measurement records; order and access records needed to provide your purchase or download are retained separately. Declining measurement does not prevent you from using the site",
        ],
        [
          "Providers and external websites",
          `Hosting and database services support the website and store its records. ${isBrianOwner(config) ? "This installation uses Lovable, Cloudflare, and Supabase, and uses Resend for configured email delivery." : "The site uses configured hosting, database, and email-delivery providers to operate its services; contact the site operator for the providers used by this installation."} When website payments are available, Stripe handles checkout; full card details are not collected in this website’s own forms. Links, embedded media, and externally hosted offers may send your browser to other providers, which apply their own privacy notices. An external purchase is handled by that provider.`,
        ],
        [
          "Retention and requests",
          "Records are kept to operate and support the requested services, maintain transaction and consent history, and address security or recordkeeping needs. Contact us to ask about your information, correct a mistake, or request deletion. We may need to verify the request and retain records needed for active orders, security, or applicable obligations. Do not include passwords, payment-card numbers, or private download links in a request",
        ],
        [
          "Updates",
          "This notice may change as the website or its services change. The updated date identifies the current version. Questions about a separate checkout, membership, or linked website should also be directed to that provider",
        ],
      ]
    : [
        [
          "Using this website",
          `These terms cover your use of this website and the educational materials provided here by ${owner}. Use the website lawfully, respect other people’s privacy and intellectual property, and do not attempt to bypass access controls, interfere with the service, or misuse its forms.`,
        ],
        [
          "Educational information",
          "Articles, demonstrations, prompts, and resources provide general educational information. Examples labeled as demonstrations or fictional scenarios are not customer results. Check information and AI-generated output before relying on it, especially before publishing, contacting customers, spending money, or making business decisions. No particular income, ranking, conversion rate, or business result is promised",
        ],
        [
          "Downloads and access",
          "Read each offer’s description, price, included file, and any specific license before claiming or buying it. Keep private access links confidential. Access can depend on successful payment and order status; a refund may revoke future download access. Browser redirects alone do not establish a completed purchase. Specific rights included with a resource are stated in that resource or its offer; access does not by itself authorize resale of the original material",
        ],
        [
          "Prices, external offers, and support",
          "A price shown for an externally hosted offer can change at the destination. Review the provider’s final checkout, renewal conditions, cancellation and refund terms, and delivery details before buying. Purchases completed elsewhere are managed by that provider. For orders completed on this website, contact support with the order reference for access, billing, or refund questions. Nothing here removes rights that cannot be excluded under applicable law",
        ],
        [
          "Affiliate links and third-party services",
          "An offer marked as an affiliate link may earn a commission when you purchase. External software, training, checkout, and other linked services have their own terms and availability. A listing is not a guarantee of a provider’s performance or a promise that a product will suit every situation",
        ],
        [
          "Changes and availability",
          "Website content and offers may be updated, and services may occasionally be interrupted. Published materials may contain errors; please contact us so they can be reviewed. These terms apply alongside any specific terms clearly presented for an individual offer",
        ],
      ];
  return (
    <InformationPage
      eyebrow="Clear information"
      title={privacy ? "Privacy notice" : "Website terms"}
      intro={`${privacy ? "How information from this website is handled" : "What to know when using this website and its resources"}. Updated September 23, 2026`}
    >
      {sections.map(([title, text]) => (
        <section key={title}>
          <h2>{title}</h2>
          <p className="mt-4 text-white/75">{text}</p>
        </section>
      ))}
      <section className="border-t border-white/15 pt-8">
        <h2>Contact</h2>
        <p className="mt-4 text-white/75">{owner}</p>
        {email && (
          <a
            href={email}
            className="mt-2 inline-block break-all text-[var(--site-accent-ink,var(--brand-accent))] underline underline-offset-4"
          >
            {config.identity.contactEmail}
          </a>
        )}
        {isBrianOwner(config) && (
          <p className="mt-4 text-white/75">
            13475 Atlantic Blvd Unit 8 - Suite 765
            <br />
            Jacksonville, FL 32225
          </p>
        )}
        <p className="mt-5">
          <Link
            to="/support"
            className="text-[var(--site-accent-ink,var(--brand-accent))] underline underline-offset-4"
          >
            Help with downloads and purchases
          </Link>
        </p>
      </section>
    </InformationPage>
  );
}
