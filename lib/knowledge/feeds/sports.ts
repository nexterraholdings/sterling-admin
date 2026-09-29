import { cleanText, dayLabel, fetchJson, httpsUrl, timeLabel, type FeedContext, type FeedResult, type PulledItem } from "@/lib/knowledge/feeds/shared";

const HOUR_MS = 60 * 60_000;
const MAX_TEAMS = 4;

type SportsEvent = {
  idEvent?: string;
  strLeague?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  strTimestamp?: string | null;
  strVenue?: string | null;
  strThumb?: string | null;
};

function apiBase(): string {
  return `https://www.thesportsdb.com/api/v1/json/${process.env.THESPORTSDB_API_KEY?.trim() || "123"}`;
}

function startOf(event: SportsEvent): Date | null {
  const raw = event.strTimestamp?.trim();
  if (!raw) return null;
  const at = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

function score(value: SportsEvent["intHomeScore"]): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function findTeam(name: string): Promise<{ id: string; name: string } | null> {
  const payload = await fetchJson<{ teams?: Array<{ idTeam?: string; strTeam?: string }> | null }>(
    `${apiBase()}/searchteams.php?t=${encodeURIComponent(name)}`,
  );
  const teams = payload.teams ?? [];
  const exact = teams.find((team) => team.strTeam?.toLowerCase() === name.toLowerCase()) ?? teams[0];
  return exact?.idTeam ? { id: exact.idTeam, name: exact.strTeam ?? name } : null;
}

async function teamEvents(teamId: string): Promise<SportsEvent[]> {
  const [next, last] = await Promise.all([
    fetchJson<{ events?: SportsEvent[] | null }>(`${apiBase()}/eventsnext.php?id=${teamId}`),
    fetchJson<{ results?: SportsEvent[] | null }>(`${apiBase()}/eventslast.php?id=${teamId}`),
  ]);
  return [...(next.events ?? []), ...(last.results ?? [])];
}

function toItem(event: SportsEvent, context: FeedContext): PulledItem | null {
  const start = startOf(event);
  const home = cleanText(event.strHomeTeam, 80);
  const away = cleanText(event.strAwayTeam, 80);
  if (!start || !event.idEvent || !home || !away) return null;
  const league = cleanText(event.strLeague, 80);
  const venue = cleanText(event.strVenue, 80);
  const url = `https://www.thesportsdb.com/event/${encodeURIComponent(event.idEvent)}`;
  const ago = context.now.getTime() - start.getTime();
  const homeScore = score(event.intHomeScore);
  const awayScore = score(event.intAwayScore);

  if (ago < 0 && -ago <= 3 * 24 * HOUR_MS) {
    const when = `${dayLabel(start, context.timeZone)} at ${timeLabel(start, context.timeZone)}`;
    return {
      source: "sports",
      claim: `${home} host ${away}${league ? ` in the ${league}` : ""} on ${when}${venue ? ` at ${venue}` : ""}.`,
      url,
      author: "",
      postedAt: null,
      imageUrl: httpsUrl(event.strThumb),
      expiresAt: new Date(start.getTime() + 3 * HOUR_MS).toISOString(),
      structured: true,
    };
  }
  if (ago >= 2 * HOUR_MS && ago <= 36 * HOUR_MS && homeScore !== null && awayScore !== null) {
    return {
      source: "sports",
      claim: `Final score${league ? ` in the ${league}` : ""} on ${dayLabel(start, context.timeZone)}: ${home} ${homeScore}, ${away} ${awayScore}.`,
      url: `${url}?result`,
      author: "",
      postedAt: start.toISOString(),
      imageUrl: httpsUrl(event.strThumb),
      expiresAt: new Date(start.getTime() + 30 * HOUR_MS).toISOString(),
      structured: true,
    };
  }
  return null;
}

/** Upcoming games in the next three days and final scores from the last day and a half, for the watch's teams. */
export async function pullSports(context: FeedContext): Promise<FeedResult> {
  const names = [...new Set(context.teams.map((team) => team.trim()).filter(Boolean))].slice(0, MAX_TEAMS);
  if (names.length === 0) return { feed: "sports", found: 0, items: [], error: "Add at least one team name for sports" };
  const settled = await Promise.allSettled(
    names.map(async (name) => {
      const team = await findTeam(name);
      if (!team) throw new Error(`No team called "${name}" on TheSportsDB`);
      return teamEvents(team.id);
    }),
  );
  const errors: string[] = [];
  const seen = new Set<string>();
  const items: PulledItem[] = [];
  let found = 0;
  for (const entry of settled) {
    if (entry.status === "rejected") {
      errors.push(entry.reason instanceof Error ? entry.reason.message : "Team lookup failed");
      continue;
    }
    for (const event of entry.value) {
      found += 1;
      const item = toItem(event, context);
      if (!item || seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }
  }
  return { feed: "sports", found, items, error: errors.length > 0 ? errors.join("; ") : null };
}
