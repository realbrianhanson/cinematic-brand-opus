import { BUSINESS_NEWS_LANES } from "./newsQuality.ts";

/** Custom member lanes keep their own subject; only business lanes inherit
 * the small-business editorial scope. Source integrity applies to everyone. */
export function buildNewsDigestPrompt(
  topicLane: string,
  sourceName: string,
): string {
  const promptByLane: Record<string, string> = {
    ai_tools:
      "List the 5 most useful AI product/model launches, feature releases, or practical business-tool updates from the last 24 hours. For each: exact headline, official source URL, publisher, one-sentence factual summary. Only real news with real URLs.",
    smb_marketing:
      "List the 5 most notable news items from the last 48 hours about AI use in small-business marketing, sales, conversions, or SEO. For each: headline, source URL, publisher, one-sentence factual summary. Only real news with real URLs.",
    ai_training:
      "List the 5 most notable news items from the last 48 hours about AI training, adoption in the workforce, upskilling programs, or enterprise AI enablement. For each: headline, source URL, publisher, one-sentence factual summary. Only real news with real URLs.",
    industry:
      "List the 5 most notable news items from the last 48 hours about AI adoption in specific service industries (dentists, plumbers, roofers, contractors, med spas, real estate, law firms, local retail). For each: headline, source URL, publisher, one-sentence factual summary. Only real news with real URLs.",
  };
  const scope = BUSINESS_NEWS_LANES.has(topicLane)
    ? " Each item must address a specific small-business task, customer acquisition, sales, costs, workflow, or a tool a business owner can use. Exclude geopolitical commentary, celebrity/executive opinions, stock-market speculation, school-only programs, generic AI alarm stories, and news roundups."
    : ` Keep each story directly relevant to ${sourceName}. Do not substitute unrelated AI, marketing, or small-business topics. Avoid generic roundups and unsupported commentary.`;
  return (
    (promptByLane[topicLane] ||
      `Find up to five recent, verifiable news stories about ${sourceName}. Use real source URLs and factual summaries.`) +
    scope +
    " Return English headlines and summaries, publisher names, original article URLs and the source publication timestamp (null if unverified) in the requested JSON structure. A source headline may be translated faithfully into English; never change its meaning. Prefer an original publisher or official announcement over republished/aggregated coverage. Do not force five stories: an empty list is better than irrelevant or unverified news. Never invent a source, timestamp, statistic, or practical implication."
  );
}
