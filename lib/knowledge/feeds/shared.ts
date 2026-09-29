import type { KnowledgeFeed, KnowledgeSource } from "@/lib/knowledge/types";

export const USER_AGENT = "SterlingAdmin/1.0 (+https://admin.sterlingtheapp.com)";

export type PulledItem = {
  source: KnowledgeSource;
  claim: string;
  url: string;
  author: string;
  postedAt: string | null;
  imageUrl: string | null;
  /** When the fact stops being worth bringing up. Defaults to a day after it was posted. */
  expiresAt?: string | null;
  /**
   * Built from structured data (forecasts, schedules) rather than written by a person, so it
   * skips the story-overlap check and the relevance judge.
   */
  structured?: boolean;
};

export type FeedContext = {
  place: string;
  /** City name without the region, e.g. "Tokyo" from "Tokyo, Japan". */
  city: string;
  searchTerms: string;
  language: string;
  timeZone: string;
  country: string;
  lat: number | null;
  lng: number | null;
  teams: string[];
  handles: string[];
  now: Date;
};

export type FeedResult = {
  feed: KnowledgeFeed;
  found: number;
  items: PulledItem[];
  error: string | null;
  xPostsFetched?: number;
  inputTokens?: number;
  outputTokens?: number;
};

const LANGUAGE_CODES: Record<string, string> = {
  amharic: "am",
  arabic: "ar",
  bengali: "bn",
  cantonese: "zh-HK",
  chinese: "zh-CN",
  czech: "cs",
  danish: "da",
  dutch: "nl",
  english: "en",
  finnish: "fi",
  french: "fr",
  german: "de",
  greek: "el",
  hebrew: "he",
  hungarian: "hu",
  indonesian: "id",
  italian: "it",
  japanese: "ja",
  korean: "ko",
  malay: "ms",
  norwegian: "no",
  polish: "pl",
  portuguese: "pt",
  russian: "ru",
  spanish: "es",
  swedish: "sv",
  thai: "th",
  turkish: "tr",
  ukrainian: "uk",
  urdu: "ur",
  vietnamese: "vi",
};

export function languageCode(language: string): string {
  return LANGUAGE_CODES[language.trim().toLowerCase()] ?? "en";
}

const US_ZONES = new Set([
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Detroit",
  "America/Boise",
  "America/Indiana/Indianapolis",
  "America/Kentucky/Louisville",
  "Pacific/Honolulu",
]);

const ZONE_COUNTRIES: Record<string, string> = {
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
  "America/Mexico_City": "MX",
  "America/Cancun": "MX",
  "America/Sao_Paulo": "BR",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Santiago": "CL",
  "America/Lima": "PE",
  "America/Bogota": "CO",
  "America/Guayaquil": "EC",
  "America/Montevideo": "UY",
  "America/Panama": "PA",
  "America/Havana": "CU",
  "America/Puerto_Rico": "PR",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Lisbon": "PT",
  "Europe/Vienna": "AT",
  "Europe/Zurich": "CH",
  "Europe/Brussels": "BE",
  "Europe/Copenhagen": "DK",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Helsinki": "FI",
  "Europe/Prague": "CZ",
  "Europe/Warsaw": "PL",
  "Europe/Budapest": "HU",
  "Europe/Athens": "GR",
  "Europe/Istanbul": "TR",
  "Europe/Kyiv": "UA",
  "Europe/Kiev": "UA",
  "Europe/Moscow": "RU",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Taipei": "TW",
  "Asia/Singapore": "SG",
  "Asia/Bangkok": "TH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Jakarta": "ID",
  "Asia/Manila": "PH",
  "Asia/Kolkata": "IN",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Asia/Jerusalem": "IL",
  "Africa/Cairo": "EG",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA",
  "Africa/Casablanca": "MA",
  "Africa/Addis_Ababa": "ET",
  "Africa/Accra": "GH",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
};

/** Two-letter country code for a hub, from its time zone. Unknown zones fall back to the US. */
export function countryFor(timeZone: string): string {
  if (US_ZONES.has(timeZone)) return "US";
  return ZONE_COUNTRIES[timeZone] ?? "US";
}

export function cityOf(place: string): string {
  return place.split(",")[0]?.trim() || place.trim();
}

export async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(init?.timeoutMs ?? 15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return (await response.json()) as T;
}

export async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.text();
}

export function dayLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(date);
}

export function timeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
}

export function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.href.length > 600) return null;
    return url.href;
  } catch {
    return null;
  }
}
