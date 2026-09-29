import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { nearestCityLocale } from "@/lib/seeded-hubs/worldCities";
import { DEFAULT_ZONE, isTimeZone } from "@/lib/conversations/time";

export type HubLocale = {
  hubId: string;
  timeZone: string;
  language: string;
  /** Human place name the props live in, e.g. "Tokyo, Japan". */
  place: string;
  source: "region" | "nearest" | "default";
  lat: number | null;
  lng: number | null;
};

const DEFAULT_LANGUAGE = "English";
/** Farther than this from every listed city, the place name falls back to the hub's own title. */
const PLACE_MILES = 60;

type HubRow = {
  id: string;
  title: string | null;
  location_hint: string | null;
  center_lat: number | null;
  center_lng: number | null;
};

async function loadRegionOverrides(hubIds: string[]): Promise<Map<string, { timezone: string | null; language: string | null }>> {
  const map = new Map<string, { timezone: string | null; language: string | null }>();
  if (hubIds.length === 0) return map;
  const { data, error } = await supabaseAdmin.from("prop_region_runs").select("hub_id, timezone, language").in("hub_id", hubIds);
  if (error && isMissingSchemaError(error)) return map;
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ hub_id: string; timezone: string | null; language: string | null }>) {
    map.set(String(row.hub_id), { timezone: row.timezone, language: row.language });
  }
  return map;
}

function resolveLocale(hub: HubRow, override: { timezone: string | null; language: string | null } | undefined): HubLocale {
  const nearest = nearestCityLocale(Number(hub.center_lat), Number(hub.center_lng));
  const hint = hub.location_hint?.trim() ?? "";
  const place = hint || (nearest && nearest.miles <= PLACE_MILES ? nearest.city.locationHint : "") || String(hub.title ?? "").trim();
  const overrideZone = isTimeZone(override?.timezone) ? override.timezone.trim() : "";
  const overrideLanguage = override?.language?.trim() ?? "";
  return {
    hubId: String(hub.id),
    timeZone: overrideZone || nearest?.timeZone || DEFAULT_ZONE,
    language: overrideLanguage || nearest?.language || DEFAULT_LANGUAGE,
    place,
    source: overrideZone || overrideLanguage ? "region" : nearest ? "nearest" : "default",
    lat: Number.isFinite(Number(hub.center_lat)) && hub.center_lat !== null ? Number(hub.center_lat) : null,
    lng: Number.isFinite(Number(hub.center_lng)) && hub.center_lng !== null ? Number(hub.center_lng) : null,
  };
}

export async function loadHubLocales(hubIds: string[]): Promise<Map<string, HubLocale>> {
  const ids = [...new Set(hubIds.filter(Boolean))];
  const map = new Map<string, HubLocale>();
  if (ids.length === 0) return map;
  const [hubsResult, overrides] = await Promise.all([
    supabaseAdmin.from("area_discussions").select("id, title, location_hint, center_lat, center_lng").in("id", ids),
    loadRegionOverrides(ids),
  ]);
  if (hubsResult.error) throw new Error(hubsResult.error.message);
  for (const hub of (hubsResult.data ?? []) as HubRow[]) {
    map.set(String(hub.id), resolveLocale(hub, overrides.get(String(hub.id))));
  }
  return map;
}

/** Locale for each group, from the hub it belongs to. Groups with no hub are left out. */
export async function loadGroupLocales(groupIds: string[]): Promise<Map<string, HubLocale>> {
  const ids = [...new Set(groupIds.filter(Boolean))];
  const map = new Map<string, HubLocale>();
  if (ids.length === 0) return map;
  const hubOf = new Map<string, string>();
  for (let index = 0; index < ids.length; index += 200) {
    const { data, error } = await supabaseAdmin
      .from("discussion_groups")
      .select("id, discussion_id")
      .in("id", ids.slice(index, index + 200));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ id: string; discussion_id: string | null }>) {
      if (row.discussion_id) hubOf.set(String(row.id), String(row.discussion_id));
    }
  }
  const hubs = await loadHubLocales([...hubOf.values()]);
  for (const [groupId, hubId] of hubOf) {
    const locale = hubs.get(hubId);
    if (locale) map.set(groupId, locale);
  }
  return map;
}

export function zoneFor(locales: Map<string, HubLocale>, groupId: string): string {
  return locales.get(groupId)?.timeZone ?? DEFAULT_ZONE;
}
