import { dateKeyIn, instantIn } from "@/lib/conversations/time";
import { cleanText, dayLabel, fetchJson, httpsUrl, timeLabel, type FeedContext, type FeedResult, type PulledItem } from "@/lib/knowledge/feeds/shared";

const MAX_ITEMS = 6;
const DAYS_AHEAD = 4;
/** Props need time to bring an event up before it starts. */
const LEAD_MS = 3 * 60 * 60_000;
/** Standing admissions and add-ons that are listed every day, not events anyone would bring up. */
const NOT_AN_EVENT =
  /\b(admission|entry|entrance|flexi?(ble)?|flexiticket|parking|voucher|gift ?card|upgrade|add-?on|package|bundle|membership|season ticket|day pass|timed ticket|standard experience)\b/i;

type TicketmasterEvent = {
  id?: string;
  name?: string;
  url?: string;
  dates?: { start?: { localDate?: string; dateTime?: string; timeTBA?: boolean }; status?: { code?: string } };
  classifications?: Array<{ segment?: { name?: string } }>;
  images?: Array<{ url?: string; ratio?: string; width?: number }>;
  _embedded?: { venues?: Array<{ name?: string }> };
};

export function ticketmasterConfigured(): boolean {
  return Boolean(process.env.TICKETMASTER_API_KEY?.trim());
}

function isoSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

function pickImage(event: TicketmasterEvent): string | null {
  const wide = (event.images ?? [])
    .filter((image) => image.ratio === "16_9" && Number(image.width ?? 0) >= 640)
    .sort((a, b) => Number(a.width ?? 0) - Number(b.width ?? 0));
  return httpsUrl(wide[0]?.url);
}

/** Concerts, games, and shows within 20 miles over the next four days. */
export async function pullEvents(context: FeedContext): Promise<FeedResult> {
  const key = process.env.TICKETMASTER_API_KEY?.trim();
  if (!key) return { feed: "events", found: 0, items: [], error: "Add TICKETMASTER_API_KEY to pull events" };
  if (context.lat === null || context.lng === null) {
    return { feed: "events", found: 0, items: [], error: "This hub has no map location for events" };
  }
  const earliest = context.now.getTime() + LEAD_MS;
  const params = new URLSearchParams({
    apikey: key,
    latlong: `${context.lat.toFixed(4)},${context.lng.toFixed(4)}`,
    radius: "20",
    unit: "miles",
    startDateTime: isoSeconds(new Date(earliest)),
    endDateTime: isoSeconds(new Date(context.now.getTime() + DAYS_AHEAD * 24 * 60 * 60_000)),
    // A date sort only ever returns tonight in a busy city; a random sample covers the whole window.
    sort: "random",
    size: "100",
    locale: "*",
  });
  const payload = await fetchJson<{ _embedded?: { events?: TicketmasterEvent[] } }>(
    `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`,
  );
  const events = payload._embedded?.events ?? [];
  const seenNames = new Set<string>();
  const byDay = new Map<string, PulledItem[]>();
  for (const event of events) {
    const name = cleanText(event.name, 160);
    const url = httpsUrl(event.url);
    const day = event.dates?.start?.localDate;
    if (!name || !url || !day || event.dates?.status?.code === "cancelled") continue;
    if (event.classifications?.[0]?.segment?.name === "Miscellaneous" || NOT_AN_EVENT.test(name)) continue;
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    const start = event.dates?.start?.dateTime && !event.dates.start.timeTBA ? new Date(event.dates.start.dateTime) : null;
    if (start && start.getTime() < earliest) continue;
    if (!start && day <= dateKeyIn(context.timeZone, context.now)) continue;
    const venue = cleanText(event._embedded?.venues?.[0]?.name, 80);
    const when = start
      ? `${dayLabel(start, context.timeZone)} at ${timeLabel(start, context.timeZone)}`
      : dayLabel(new Date(`${day}T12:00:00Z`), "UTC");
    const list = byDay.get(day) ?? [];
    list.push({
      source: "events",
      claim: `${name} is${venue ? ` at ${venue}` : ""} on ${when}.`,
      url,
      author: "Ticketmaster",
      postedAt: null,
      imageUrl: pickImage(event),
      expiresAt: (start ?? instantIn(context.timeZone, day, 23, 59)).toISOString(),
    });
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort();
  const items: PulledItem[] = [];
  for (let round = 0; items.length < MAX_ITEMS && days.some((day) => (byDay.get(day)?.length ?? 0) > round); round += 1) {
    for (const day of days) {
      const item = byDay.get(day)?.[round];
      if (item && items.length < MAX_ITEMS) items.push(item);
    }
  }
  return { feed: "events", found: events.length, items, error: null };
}
