import { useSiteConfig } from "@/config/SiteConfigContext";

export default function FormPrivacyLink() {
  const { footer } = useSiteConfig();
  if (!footer.privacyUrl) return null;
  return (
    <a
      href={footer.privacyUrl}
      className="underline underline-offset-4 hover:text-white"
    >
      Privacy notice
    </a>
  );
}
