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

const checks = [];
const profileProbe = await admin
  .from("profiles")
  .select("streak_current,streak_longest,last_visit_date")
  .limit(1);
checks.push(["profiles streak columns", profileProbe.error?.message ?? "ok"]);

const visitsProbe = await admin.from("user_visits").select("user_id,visit_date").limit(1);
checks.push(["user_visits table", visitsProbe.error?.message ?? "ok"]);

for (const [name, result] of checks) {
  console.log(`${name}: ${result}`);
}

process.exit(checks.some(([, result]) => result !== "ok") ? 1 : 0);
