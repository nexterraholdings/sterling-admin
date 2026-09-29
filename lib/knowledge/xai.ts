import type { PulledItem } from "@/lib/knowledge/feeds/shared";

export const XAI_MODEL = process.env.XAI_MODEL?.trim() || "grok-4.7";

const MAX_ITEMS = 8;
const DEFAULT_FOCUS = "everyday local life: events, openings and closures, weather, transit, sports, food, and things people are talking about";

export type XaiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  xPostsFetched: number;
};

export type PullResult = XaiUsage & {
  /** Items the model returned, before the citation check. */
  found: number;
  items: PulledItem[];
};

export class XaiError extends Error {
  usage: XaiUsage;

  constructor(message: string, usage?: Partial<XaiUsage>) {
    super(message);
    this.name = "XaiError";
    this.usage = {
      model: usage?.model ?? XAI_MODEL,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      xPostsFetched: usage?.xPostsFetched ?? 0,
    };
  }
}

export function xaiConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

/** Comparable key for a source URL. X posts compare by status id, since citations use x.com/i/status/<id>. */
export function citationKey(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^(www|mobile|m)\./, "");
    if (host === "x.com" || host === "twitter.com") {
      const status = url.pathname.match(/\/status(?:es)?\/(\d+)/);
      return status ? `x:${status[1]}` : null;
    }
    return `${host}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
}

function isXUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^(www|mobile|m)\./, "");
    return host === "x.com" || host === "twitter.com";
  } catch {
    return false;
  }
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cleanHandle(value: string): string {
  return value.trim().replace(/^@+/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function parseWhen(value: unknown, now: Date): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  if (at.getTime() > now.getTime() + 60 * 60_000) return null;
  if (at.getTime() < now.getTime() - 7 * 24 * 60 * 60_000) return null;
  return at.toISOString();
}

function parseImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.href.length > 600) return null;
    return url.href;
  } catch {
    return null;
  }
}

function outputText(payload: ResponsesPayload): string {
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function citedKeys(payload: ResponsesPayload): Set<string> {
  const urls: string[] = [];
  for (const entry of payload.citations ?? []) {
    if (typeof entry === "string") urls.push(entry);
    else if (entry && typeof entry === "object" && typeof entry.url === "string") urls.push(entry.url);
  }
  for (const item of payload.output ?? []) {
    for (const content of item?.content ?? []) {
      for (const annotation of content?.annotations ?? []) {
        if (typeof annotation?.url === "string") urls.push(annotation.url);
      }
    }
  }
  const keys = new Set<string>();
  for (const url of urls) {
    const key = citationKey(url);
    if (key) keys.add(key);
  }
  return keys;
}

function parseJsonObject(text: string): unknown {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

type ResponsesPayload = {
  error?: { message?: string } | string;
  model?: string;
  citations?: Array<string | { url?: string }>;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; annotations?: Array<{ url?: string }> }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    server_side_tool_usage_details?: { x_posts_fetched?: number };
  };
};

export async function pullFromX(input: {
  place: string;
  searchTerms: string;
  handles: string[];
  now?: Date;
}): Promise<PullResult> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) throw new XaiError("XAI_API_KEY is not configured");

  const now = input.now ?? new Date();
  const place = input.place.trim() || "this city";
  const handles = [...new Set(input.handles.map(cleanHandle).filter(Boolean))].slice(0, 20);
  const focus = input.searchTerms.trim() || DEFAULT_FOCUS;
  const xTool: Record<string, unknown> = {
    type: "x_search",
    from_date: utcDay(new Date(now.getTime() - 24 * 60 * 60_000)),
    to_date: utcDay(now),
  };
  if (handles.length > 0) xTool.allowed_x_handles = handles;

  const task = [
    `Place: ${place}`,
    `Focus: ${focus}`,
    ...(handles.length > 0 ? [`Look at posts from these accounts first: ${handles.map((handle) => `@${handle}`).join(", ")}`] : []),
    `Find up to ${MAX_ITEMS} separate, concrete things that happened, were announced, or are coming up in ${place}.`,
    "Each one must come from an X post or article you actually opened in search results from the last 24 hours. Never write an item from memory.",
    "Skip elections, candidates, ballot measures, and campaigns. Skip crimes, accidents, and lawsuits that name private people. Skip deaths and disasters. Skip medical and financial claims, rumors, and ads.",
    "Return JSON only, no prose, in this shape:",
    '{"items":[{"source":"x or web","claim":"one plain English sentence of what happened, with names, places, and numbers exactly as the source gives them","url":"exact URL of the post or article","author":"@handle or publisher","posted_at":"ISO 8601 time or null","image_url":"direct image URL from that post or article, or null"}]}',
    'If nothing qualifies, return {"items":[]}.',
  ].join("\n");

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: XAI_MODEL,
      include: ["no_inline_citations"],
      input: [
        {
          role: "system",
          content: "You research what is happening in one place so neighbors there can talk about it. Use search. Report only what the sources say.",
        },
        { role: "user", content: task },
      ],
      tools: [xTool, { type: "web_search" }],
    }),
    signal: AbortSignal.timeout(50_000),
  });

  const payload = (await response.json().catch(() => null)) as ResponsesPayload | null;
  const usage: XaiUsage = {
    model: payload?.model || XAI_MODEL,
    inputTokens: Number(payload?.usage?.input_tokens ?? 0),
    outputTokens: Number(payload?.usage?.output_tokens ?? 0),
    xPostsFetched: Number(payload?.usage?.server_side_tool_usage_details?.x_posts_fetched ?? 0),
  };
  if (!response.ok || !payload) {
    const detail = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
    throw new XaiError(detail || `xAI returned ${response.status}`, usage);
  }

  const parsed = parseJsonObject(outputText(payload)) as { items?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.items)) throw new XaiError("xAI did not return the item list", usage);

  const cited = citedKeys(payload);
  const seen = new Set<string>();
  const items: PulledItem[] = [];
  for (const raw of parsed.items.slice(0, MAX_ITEMS * 2) as Array<Record<string, unknown>>) {
    const url = cleanText(raw?.url, 600);
    const claim = cleanText(raw?.claim, 400);
    const keyForUrl = citationKey(url);
    if (!claim || claim.length < 12 || !keyForUrl) continue;
    if (!cited.has(keyForUrl) || seen.has(keyForUrl)) continue;
    seen.add(keyForUrl);
    items.push({
      source: isXUrl(url) ? "x" : "web",
      claim,
      url,
      author: cleanText(raw?.author, 80),
      postedAt: parseWhen(raw?.posted_at, now),
      imageUrl: parseImage(raw?.image_url),
    });
    if (items.length >= MAX_ITEMS) break;
  }

  return { ...usage, found: parsed.items.length, items };
}
