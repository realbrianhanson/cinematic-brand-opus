/**
 * Simple keyword overlap matching for cross-linking blog posts and pSEO pages.
 * Scores niches by word overlap with source keywords/category.
 */

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "as", "be", "was", "are",
  "this", "that", "will", "can", "has", "have", "had", "not", "you",
  "your", "we", "our", "how", "what", "why", "when", "best", "top",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export interface NicheMatch {
  nicheId: string;
  nicheName: string;
  nicheSlug: string;
  score: number;
}

export function scoreNicheMatch(
  sourceWords: string[],
  nicheName: string,
  nicheContext?: any
): number {
  const nicheWords = new Set(tokenize(nicheName));

  // Add context subtopics if available
  if (nicheContext) {
    const contextStr =
      typeof nicheContext === "string"
        ? nicheContext
        : JSON.stringify(nicheContext);
    tokenize(contextStr).forEach((w) => nicheWords.add(w));
  }

  let score = 0;
  for (const word of sourceWords) {
    if (nicheWords.has(word)) score++;
  }
  return score;
}

export function findRelatedNiches(
  sourceKeywords: string[],
  sourceCategory: string,
  niches: { id: string; name: string; slug: string; context: any }[],
  minScore = 1,
  limit = 3
): NicheMatch[] {
  const sourceWords = [
    ...tokenize(sourceCategory),
    ...sourceKeywords.flatMap((k) => tokenize(k)),
  ];

  if (sourceWords.length === 0) return [];

  const scored = niches
    .map((niche) => ({
      nicheId: niche.id,
      nicheName: niche.name,
      nicheSlug: niche.slug,
      score: scoreNicheMatch(sourceWords, niche.name, niche.context),
    }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

export function findRelatedNicheForPage(
  nicheName: string,
  nicheContext: any,
  posts: { id: string; title: string; slug: string; category_name?: string; keywords?: string[] }[],
  limit = 2
): typeof posts {
  const nicheWords = tokenize(nicheName);
  if (nicheContext) {
    const contextStr = typeof nicheContext === "string" ? nicheContext : JSON.stringify(nicheContext);
    nicheWords.push(...tokenize(contextStr));
  }

  const scored = posts
    .map((post) => {
      const postWords = [
        ...tokenize(post.title),
        ...(post.category_name ? tokenize(post.category_name) : []),
        ...(post.keywords || []).flatMap((k) => tokenize(k)),
      ];
      let score = 0;
      for (const w of postWords) {
        if (nicheWords.includes(w)) score++;
      }
      return { ...post, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
