import { cleanText, fetchJson, fetchText, httpsUrl, languageCode, type FeedContext, type FeedResult, type PulledItem } from "@/lib/knowledge/feeds/shared";

const MAX_ITEMS = 12;
const WINDOW_MS = 36 * 60 * 60_000;

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeEntities(match[1] ?? "").trim() : "";
}

function withinWindow(postedAt: string | null, now: Date): boolean {
  if (!postedAt) return false;
  const age = now.getTime() - new Date(postedAt).getTime();
  return age >= -60 * 60_000 && age <= WINDOW_MS;
}

function newest(items: PulledItem[]): PulledItem[] {
  const seen = new Set<string>();
  return items
    .sort((a, b) => new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime())
    .filter((item) => {
      const key = item.claim.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS);
}

function query(context: FeedContext): string {
  return context.searchTerms.trim() || `"${context.city}"`;
}

async function googleNews(context: FeedContext): Promise<{ found: number; items: PulledItem[] }> {
  const lang = languageCode(context.language);
  const base = lang.split("-")[0] ?? "en";
  const hl = lang.includes("-") ? lang : `${base}-${context.country}`;
  const ceidLang = lang.startsWith("zh") ? (lang === "zh-HK" ? "zh-Hant" : "zh-Hans") : base;
  const params = new URLSearchParams({
    q: `${query(context)} when:1d`,
    hl,
    gl: context.country,
    ceid: `${context.country}:${ceidLang}`,
  });
  const xml = await fetchText(`https://news.google.com/rss/search?${params.toString()}`);
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const items: PulledItem[] = [];
  for (const block of blocks) {
    const publisher = tag(block, "source");
    let title = tag(block, "title");
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    const url = httpsUrl(tag(block, "link"));
    const published = new Date(tag(block, "pubDate"));
    const postedAt = Number.isNaN(published.getTime()) ? null : published.toISOString();
    const claim = cleanText(title, 400);
    if (!url || claim.length < 12 || !withinWindow(postedAt, context.now)) continue;
    items.push({ source: "news", claim, url, author: cleanText(publisher, 80), postedAt, imageUrl: null });
  }
  return { found: blocks.length, items: newest(items) };
}

type GdeltPayload = {
  articles?: Array<{ url?: string; title?: string; seendate?: string; domain?: string; socialimage?: string }>;
};

function gdeltDate(value: string | undefined): string | null {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return null;
  return new Date(Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!, +match[4]!, +match[5]!, +match[6]!)).toISOString();
}

async function gdelt(context: FeedContext): Promise<{ found: number; items: PulledItem[] }> {
  const params = new URLSearchParams({
    query: `${query(context)} sourcelang:${context.language.trim().toLowerCase() || "english"}`,
    mode: "artlist",
    format: "json",
    timespan: "1d",
    maxrecords: "40",
    sort: "datedesc",
  });
  const payload = await fetchJson<GdeltPayload>(`https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`);
  const articles = payload.articles ?? [];
  const items: PulledItem[] = [];
  for (const article of articles) {
    const url = httpsUrl(article.url);
    const claim = cleanText(article.title, 400);
    const postedAt = gdeltDate(article.seendate);
    if (!url || claim.length < 12 || !withinWindow(postedAt, context.now)) continue;
    items.push({
      source: "news",
      claim,
      url,
      author: cleanText(article.domain, 80),
      postedAt,
      imageUrl: httpsUrl(article.socialimage),
    });
  }
  return { found: articles.length, items: newest(items) };
}

/** Headlines from the last day and a half. Google News first; GDELT when Google fails or finds nothing. */
export async function pullNews(context: FeedContext): Promise<FeedResult> {
  let googleError: string | null = null;
  try {
    const result = await googleNews(context);
    if (result.items.length > 0) return { feed: "news", ...result, error: null };
  } catch (error) {
    googleError = error instanceof Error ? error.message : "Google News failed";
  }
  try {
    const result = await gdelt(context);
    return { feed: "news", ...result, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GDELT failed";
    return { feed: "news", found: 0, items: [], error: googleError ? `${googleError}; ${message}` : message };
  }
}
