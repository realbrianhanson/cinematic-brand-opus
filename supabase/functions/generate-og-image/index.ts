import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + "...";
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.55));
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length > charsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + " " + word).trim();
    }
    if (lines.length >= 3) break;
  }
  if (currentLine && lines.length < 3) lines.push(currentLine.trim());
  if (lines.length === 3 && words.length > lines.join(" ").split(" ").length) {
    lines[2] = truncateText(lines[2], lines[2].length);
  }
  return lines;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateSvg(
  title: string,
  authorName: string,
  contentTypeName: string,
  siteUrl: string
): string {
  const titleLines = wrapText(title, 1000, 48);
  const titleStartY = 315 - (titleLines.length - 1) * 30;

  let gridLines = "";
  for (let y = 0; y <= 630; y += 63) {
    gridLines += `<line x1="0" y1="${y}" x2="1200" y2="${y}" stroke="white" stroke-opacity="0.04" stroke-width="1"/>`;
  }

  const titleTexts = titleLines
    .map(
      (line, i) =>
        `<text x="100" y="${titleStartY + i * 60}" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="bold" fill="white">${escapeXml(line)}</text>`
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#1a1a2e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  ${gridLines}
  <text x="100" y="80" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="white" letter-spacing="4" text-transform="uppercase" opacity="0.9">${escapeXml(authorName.toUpperCase())}</text>
  <rect x="100" y="100" width="80" height="3" fill="#D4AF55" rx="1.5"/>
  ${titleTexts}
  <rect x="100" y="530" width="${Math.max(120, contentTypeName.length * 14 + 40)}" height="36" rx="18" fill="#D4AF55"/>
  <text x="${100 + Math.max(120, contentTypeName.length * 14 + 40) / 2}" y="553" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" fill="#0a0a0a" text-anchor="middle" letter-spacing="2">${escapeXml(contentTypeName.toUpperCase())}</text>
  <text x="1100" y="555" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="white" opacity="0.3" text-anchor="end">${escapeXml(siteUrl.replace(/^https?:\/\//, ""))}</text>
</svg>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { page_id, batch } = body;

    const { data: settings } = await supabase
      .from("site_settings")
      .select("author_name, site_url")
      .limit(1)
      .maybeSingle();

    const authorName = settings?.author_name || "Author";
    const siteUrl = (settings?.site_url || "https://example.com").replace(/\/$/, "");

    let processedCount = 0;
    let errors: string[] = [];

    if (batch) {
      const { data: pages } = await supabase
        .from("generated_pages")
        .select("id, title, slug, seo_meta, content_schema_id, content_schemas(name)")
        .eq("status", "published");

      const toProcess = (pages || []).filter((p: any) => {
        const meta = p.seo_meta as any;
        return !meta?.og_image;
      });

      for (const pg of toProcess) {
        try {
          await processPage(supabase, pg, authorName, siteUrl);
          processedCount++;
        } catch (e: any) {
          errors.push(`${pg.id}: ${e.message}`);
        }
      }
    } else if (page_id) {
      const { data: pg } = await supabase
        .from("generated_pages")
        .select("id, title, slug, seo_meta, content_schema_id, content_schemas(name)")
        .eq("id", page_id)
        .maybeSingle();

      if (!pg) {
        return new Response(JSON.stringify({ error: "Page not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await processPage(supabase, pg, authorName, siteUrl);
      processedCount = 1;
    } else {
      return new Response(
        JSON.stringify({ error: "Provide page_id or batch: true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, processed: processedCount, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("OG image generation error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processPage(
  supabase: any,
  pg: any,
  authorName: string,
  siteUrl: string
) {
  const contentTypeName = pg.content_schemas?.name || "Resource";
  const svg = generateSvg(pg.title, authorName, contentTypeName, siteUrl);

  const fileName = `og-${pg.slug}.svg`;
  const uploadBlob = new Blob([svg], { type: "image/svg+xml" });

  const { error: uploadError } = await supabase.storage
    .from("og-images")
    .upload(fileName, uploadBlob, {
      contentType: "image/svg+xml",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from("og-images")
    .getPublicUrl(fileName);

  const ogImageUrl = urlData.publicUrl;

  const existingMeta = (pg.seo_meta as any) || {};
  const { error: updateError } = await supabase
    .from("generated_pages")
    .update({
      seo_meta: { ...existingMeta, og_image: ogImageUrl },
    })
    .eq("id", pg.id);

  if (updateError) throw updateError;
}
