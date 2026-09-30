import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadHubLocales, type HubLocale } from "@/lib/conversations/hub-locale";
import { milesBetween } from "@/lib/seeded-hubs/worldCities";

export const PROP_HOME_SCHEMA_HINT = "Prop homes are not in the database yet. Run supabase/sql/prop_account_home.sql.";

/** Closer than this to home, a prop is a local. */
const LOCAL_MILES = 60;

export type PropHome = {
  hubId: string;
  place: string;
  lat: number | null;
  lng: number | null;
  languages: string[];
  /** "set" when chosen by an admin, otherwise the hub where most of the prop's groups are. */
  source: "set" | "groups";
  languagesSet: boolean;
};

type StoredHome = { hubId: string | null; languages: string[] };

async function loadStoredHomes(userIds: string[]): Promise<Map<string, StoredHome>> {
  const map = new Map<string, StoredHome>();
  for (let index = 0; index < userIds.length; index += 200) {
    const { data, error } = await supabaseAdmin
      .from("prop_account_personas")
      .select("user_id, home_hub_id, languages")
      .in("user_id", userIds.slice(index, index + 200));
    if (error && isMissingSchemaError(error)) return map;
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ user_id: string; home_hub_id: string | null; languages: string[] | null }>) {
      map.set(String(row.user_id), {
        hubId: row.home_hub_id ? String(row.home_hub_id) : null,
        languages: (row.languages ?? []).map((language) => language.trim()).filter(Boolean),
      });
    }
  }
  return map;
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  for (const [value, count] of counts) if (!best || count > (counts.get(best) ?? 0)) best = value;
  return best;
}

/** Hub ids of every group each prop is in, one entry per group, from group -> prop ids and group -> locale. */
export function hubListsByProp(membersByGroup: Map<string, string[]>, localeByGroup: Map<string, HubLocale>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [groupId, userIds] of membersByGroup) {
    const hubId = localeByGroup.get(groupId)?.hubId;
    if (!hubId) continue;
    for (const userId of userIds) {
      const list = map.get(userId) ?? [];
      list.push(hubId);
      map.set(userId, list);
    }
  }
  return map;
}

export async function loadPropHomes(hubsByProp: Map<string, string[]>): Promise<Map<string, PropHome>> {
  const userIds = [...hubsByProp.keys()];
  const stored = await loadStoredHomes(userIds);
  const homeHub = new Map<string, { hubId: string; source: PropHome["source"] }>();
  for (const userId of userIds) {
    const set = stored.get(userId)?.hubId;
    const inferred = mostCommon(hubsByProp.get(userId) ?? []);
    if (set) homeHub.set(userId, { hubId: set, source: "set" });
    else if (inferred) homeHub.set(userId, { hubId: inferred, source: "groups" });
  }
  const locales = await loadHubLocales([...new Set([...homeHub.values()].map((home) => home.hubId))]);
  const homes = new Map<string, PropHome>();
  for (const [userId, home] of homeHub) {
    const locale = locales.get(home.hubId);
    if (!locale) continue;
    const languages = stored.get(userId)?.languages ?? [];
    homes.set(userId, {
      hubId: home.hubId,
      place: locale.place,
      lat: locale.lat,
      lng: locale.lng,
      languages: languages.length > 0 ? languages : [locale.language],
      source: home.source,
      languagesSet: languages.length > 0,
    });
  }
  return homes;
}

/** Where the prop is visiting from, or null when this hub is home or within 60 miles of it. */
export function visitorFrom(home: PropHome | undefined, hub: HubLocale | undefined): string | null {
  if (!home || !hub || home.hubId === hub.hubId) return null;
  if (home.lat !== null && home.lng !== null && hub.lat !== null && hub.lng !== null) {
    if (milesBetween(home.lat, home.lng, hub.lat, hub.lng) <= LOCAL_MILES) return null;
  }
  return home.place || "somewhere else";
}

/** The language this prop writes in here: the hub's when it speaks it, otherwise its own first language. */
export function writingLanguage(home: PropHome | undefined, hub: HubLocale | undefined): string | undefined {
  if (!hub) return home?.languages[0];
  if (!home) return hub.language;
  const speaks = home.languages.some((language) => language.toLowerCase() === hub.language.toLowerCase());
  return speaks ? hub.language : home.languages[0] ?? hub.language;
}

export async function savePropHome(userId: string, input: { hubId: string | null; languages: string[] }): Promise<void> {
  const languages = [...new Set(input.languages.map((language) => language.trim()).filter(Boolean))].slice(0, 4);
  const { error } = await supabaseAdmin
    .from("prop_account_personas")
    .upsert(
      { user_id: userId, home_hub_id: input.hubId || null, languages, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error && isMissingSchemaError(error)) throw new Error(PROP_HOME_SCHEMA_HINT);
  if (error) throw new Error(error.message);
}
