import { useMemo, useState } from "react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { emptyCallFunnelConfig, publicCallConfig } from "@/lib/callFunnels";
import CallFunnelExperience from "@/components/call-funnels/CallFunnelExperience";
export default function CallFunnelTemplate() {
  const site = useSiteConfig();
  const base = useMemo(() => {
    const c = emptyCallFunnelConfig();
    c.brand.name = site.identity.name;
    c.brand.hostName = site.identity.name;
    c.brand.hostRole = site.identity.tagline;
    c.brand.hostImage = site.story.portraitSrc ?? "";
    c.invitation.video.poster = c.brand.hostImage;
    c.preparation.video.poster = c.brand.hostImage;
    c.training.video.poster = c.brand.hostImage;
    c.alternative.video.poster = c.brand.hostImage;
    return c;
  }, [site]);
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const config = { ...base, theme: { ...base.theme, mode } };
  return (
    <>
      <div
        data-theme-media
        className="flex flex-wrap items-center justify-center gap-3 bg-slate-950 p-4 text-white"
      >
        <p>Video + Application template preview</p>
        <button
          className="rounded border border-white/40 px-4 py-2"
          aria-pressed={mode === "dark"}
          onClick={() => setMode("dark")}
        >
          Dark design
        </button>
        <button
          className="rounded border border-white/40 px-4 py-2"
          aria-pressed={mode === "light"}
          onClick={() => setMode("light")}
        >
          White design
        </button>
        <a
          className="rounded bg-white px-4 py-2 text-slate-950"
          href="/admin/call-funnels"
        >
          Use this template
        </a>
      </div>
      <CallFunnelExperience
        publication={{
          id: "template-preview",
          slug: "video-application",
          title: "Video + Application",
          revision: 1,
          config: publicCallConfig(config),
          proof: [],
        }}
        preview
        qualificationRules={config.qualificationRules}
      />
    </>
  );
}
