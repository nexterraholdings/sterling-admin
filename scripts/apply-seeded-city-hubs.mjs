import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Missing .env.local");
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: inserted, error: applyError } = await admin.rpc("apply_seeded_city_hubs");
if (applyError) {
  console.error("apply_seeded_city_hubs failed:", applyError.message);
  process.exit(1);
}

const { data: seeded, error: listError } = await admin
  .from("area_discussions")
  .select("place_key,radius_miles")
  .eq("origin", "seeded")
  .neq("lifecycle_status", "expired");
if (listError) {
  console.error("Could not count seeded hubs:", listError.message);
  process.exit(1);
}

const rows = seeded ?? [];
const gazetteer = rows.filter((row) => /^[a-z]{2}:/.test(String(row.place_key ?? "")));
const oneMileKeys = gazetteer
  .filter((row) => Number(row.radius_miles) === 1)
  .map((row) => String(row.place_key));

if (oneMileKeys.length > 0) {
  const { error: bumpError } = await admin
    .from("area_discussions")
    .update({ radius_miles: 30 })
    .eq("origin", "seeded")
    .in("place_key", oneMileKeys);
  if (bumpError) {
    console.error("Could not set metro radius:", bumpError.message);
    process.exit(1);
  }
}

const us = gazetteer.filter((row) => String(row.place_key).startsWith("us:")).length;
const br = gazetteer.filter((row) => String(row.place_key).startsWith("br:")).length;
const europe = gazetteer.length - us - br;

console.log(JSON.stringify({
  inserted: inserted ?? 0,
  gazetteer: gazetteer.length,
  unitedStates: us,
  brazil: br,
  europe,
  otherSeeded: rows.length - gazetteer.length,
  radiusUpdated: oneMileKeys.length,
}, null, 2));
