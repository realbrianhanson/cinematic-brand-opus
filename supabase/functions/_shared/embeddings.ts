// Shared helpers for text embeddings + cosine-similarity originality checks.
// Uses Lovable AI Gateway (openai/text-embedding-3-small = 1536 dims).

const GATEWAY = "https://ai.gateway.lovable.dev/v1/embeddings";
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

export async function embedText(text: string, apiKey: string): Promise<number[] | null> {
  const trimmed = (text || "").slice(0, 8000).trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: trimmed }),
    });
    if (!res.ok) {
      console.warn("embedText failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.warn("embedText threw", e);
    return null;
  }
}

export function cosineSim(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// pgvector literal (e.g. "[0.1,0.2,...]")
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
