// Generates a featured image via Lovable AI Gateway (IMAGE_MODEL) and uploads
// the result to the `blog-images` storage bucket. Returns the public URL, or
// null if any step fails (callers should tolerate null).
import { IMAGE_MODEL } from "./models.ts";

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function generateFeaturedImage(
  title: string,
  excerpt: string,
  apiKey: string,
  supabaseAdmin: any,
): Promise<string | null> {
  try {
    const imagePrompt = `Create a professional, visually striking blog header image for an article titled "${title}". The image should be: a modern, clean editorial-style photograph or illustration that evokes the theme of the article. Context: ${excerpt}. Style: cinematic lighting, rich colors, no text overlays, no watermarks, suitable as a 16:9 blog featured image. High quality, editorial photography style.`;

    console.log("Generating featured image via Nano Banana 2...");
    const imgRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: "user", content: imagePrompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!imgRes.ok) {
      console.warn("Image generation failed:", imgRes.status, await imgRes.text());
      return null;
    }

    const imgData = await imgRes.json();
    const imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl || !imageUrl.startsWith("data:image/")) {
      console.warn("No image returned from model");
      return null;
    }

    const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) return null;

    const ext = base64Match[1] === "jpeg" ? "jpg" : base64Match[1];
    const bytes = base64ToUint8Array(base64Match[2]);
    const filePath = `ai-generated/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("blog-images")
      .upload(filePath, bytes, { contentType: `image/${base64Match[1]}`, upsert: false });

    if (uploadErr) {
      console.warn("Image upload failed:", uploadErr.message);
      return null;
    }

    const { data: urlData } = supabaseAdmin.storage.from("blog-images").getPublicUrl(filePath);
    console.log("Featured image uploaded:", urlData.publicUrl);
    return urlData.publicUrl;
  } catch (e) {
    console.warn("Image generation error:", e);
    return null;
  }
}
