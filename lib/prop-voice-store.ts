import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { isPropAccountEmail, SYSTEM_GROUP_OWNER_EMAIL } from "@/lib/prop-accounts";
import { parsePropVoice, sanitizePropVoice, type PropVoice } from "@/lib/prop-voice";
import { supabaseAdmin } from "@/lib/supabase/server";

const VOICE_COLUMNS = "user_id, personality, swear, swear_rate, grammar, abbrev, behavior, age, interests, temperament, talk, life";
const BEHAVIOR_COLUMNS = "user_id, personality, swear, swear_rate, grammar, abbrev, behavior";
const PERSONALITY_COLUMNS = "user_id, personality";
const COLUMN_SETS = [VOICE_COLUMNS, BEHAVIOR_COLUMNS, PERSONALITY_COLUMNS];
const SCHEMA_HINT = "Prop account traits are not in the database yet. Run supabase/sql/prop_account_behavior.sql and supabase/sql/prop_account_traits.sql.";

function voicePayload(userId: string, voice: PropVoice, updatedAt: string) {
  const clean = sanitizePropVoice(voice);
  return {
    user_id: userId,
    personality: clean.personality,
    swear: clean.swear,
    swear_rate: clean.swear === true ? clean.swearRate : null,
    grammar: clean.grammar,
    abbrev: clean.abbrev,
    behavior: clean.behavior,
    age: clean.traits.age,
    interests: clean.traits.interests,
    temperament: clean.traits.temperament,
    talk: clean.traits.talk,
    life: clean.traits.life,
    updated_at: updatedAt,
  };
}

export async function loadAccountVoices(): Promise<Map<string, PropVoice>> {
  const map = new Map<string, PropVoice>();
  const pageSize = 1000;
  let columnSet = 0;
  let columns: string = COLUMN_SETS[0] ?? PERSONALITY_COLUMNS;
  let from = 0;
  while (from < 20000) {
    const { data, error } = await supabaseAdmin.from("prop_account_personas").select(columns).range(from, from + pageSize - 1);
    if (error) {
      if (isMissingSchemaError(error) && columnSet < COLUMN_SETS.length - 1) {
        columnSet += 1;
        columns = COLUMN_SETS[columnSet] ?? PERSONALITY_COLUMNS;
        continue;
      }
      if (isMissingSchemaError(error)) return map;
      throw new Error(error.message);
    }
    const rows = (data ?? []) as Array<VoiceQueryRow>;
    for (const row of rows) map.set(String(row.user_id), parsePropVoice(row));
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

type VoiceQueryRow = {
  user_id: string;
  personality?: string | null;
  swear?: boolean | null;
  swear_rate?: string | null;
  grammar?: number | null;
  abbrev?: number | null;
  behavior?: string | null;
  age?: number | null;
  interests?: string | null;
  temperament?: string | null;
  talk?: string | null;
  life?: string | null;
};

export async function loadAccountVoice(userId: string): Promise<PropVoice> {
  for (const columns of COLUMN_SETS) {
    const result = await supabaseAdmin.from("prop_account_personas").select(columns).eq("user_id", userId).maybeSingle();
    if (!result.error) return parsePropVoice(result.data);
    if (!isMissingSchemaError(result.error) || columns === PERSONALITY_COLUMNS) throw new Error(result.error.message);
  }
  return parsePropVoice(null);
}

export async function saveAccountVoice(userId: string, voice: PropVoice): Promise<void> {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile || !isPropAccountEmail(profile.email) || profile.email?.toLowerCase() === SYSTEM_GROUP_OWNER_EMAIL) {
    throw new Error("Behavior settings are only for prop accounts.");
  }

  const { error } = await supabaseAdmin.from("prop_account_personas").upsert(voicePayload(userId, voice, new Date().toISOString()), {
    onConflict: "user_id",
  });
  if (error && isMissingSchemaError(error)) throw new Error(SCHEMA_HINT);
  if (error) throw new Error(error.message);
}

export async function writeAccountVoices(userIds: string[], voice: PropVoice): Promise<void> {
  if (userIds.length === 0) return;
  const now = new Date().toISOString();
  const clean = sanitizePropVoice(voice);
  const { error } = await supabaseAdmin.from("prop_account_personas").upsert(
    userIds.map((userId) => voicePayload(userId, clean, now)),
    { onConflict: "user_id" },
  );
  if (error && isMissingSchemaError(error)) throw new Error(SCHEMA_HINT);
  if (error) throw new Error(error.message);
}
