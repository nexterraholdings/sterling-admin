import { instantIn } from "@/lib/conversations/time";
import { cleanText, dayLabel, fetchJson, httpsUrl, timeLabel, type FeedContext, type FeedResult, type PulledItem } from "@/lib/knowledge/feeds/shared";

const MAX_ITEMS = 6;
const DAYS_AHEAD = 4;

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
  const params = new URLSearchParams({
    apikey: key,
    latlong: `${context.lat.toFixed(4)},${context.lng.toFixed(4)}`,
    radius: "20",
    unit: "miles",
    startDateTime: isoSeconds(context.now),
    endDateTime: isoSeconds(new Date(context.now.getTime() + DAYS_AHEAD * 24 * 60 * 60_000)),
    sort: "date,asc",
    size: "60",
    locale: "*",
  });
  const payload = await fetchJson<{ _embedded?: { events?: TicketmasterEvent[] } }>(
    `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`,
  );
  const events = payload._embedded?.events ?? [];
  const seenNames = new Set<string>();
  const items: PulledItem[] = [];
  for (const event of events) {
    const name = cleanText(event.name, 160);
    const url = httpsUrl(event.url);
    const day = event.dates?.start?.localDate;
    if (!name || !url || !day || event.dates?.status?.code === "cancelled") continue;
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    const start = event.dates?.start?.dateTime && !event.dates.start.timeTBA ? new Date(event.dates.start.dateTime) : null;
    const venue = cleanText(event._embedded?.venues?.[0]?.name, 80);
    const when = start
      ? `${dayLabel(start, context.timeZone)} at ${timeLabel(start, context.timeZone)}`
      : dayLabel(new Date(`${day}T12:00:00Z`), "UTC");
    items.push({
      source: "events",
      claim: `${name} is${venue ? ` at ${venue}` : ""} on ${when}.`,
      url,
      author: "Ticketmaster",
      postedAt: null,
      imageUrl: pickImage(event),
      expiresAt: (start ?? instantIn(context.timeZone, day, 23, 59)).toISOString(),
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return { feed: "events", found: events.length, items, error: null };
}
