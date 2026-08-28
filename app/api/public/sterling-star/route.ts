import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin, supabaseAdminIsMock } from "@/lib/supabase/server";
import { getRequestClientMeta } from "@/lib/auth/request-meta";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*[\p{L}\p{M}.]$/u;
const PLACE_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*[\p{L}\p{M}.]?$/u;
const HANDLE_RE =
  /(?:@[\w.]{2,}|https?:\/\/\S+|(?:instagram|tiktok|youtube|youtu\.be|x\.com|twitter|facebook|linkedin)\.[\w./-]+)/i;

const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 8;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function clean(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function validatePlace(value: string, label: string): string | null {
  if (value.length < 2) return `Enter a valid ${label}.`;
  if (!PLACE_RE.test(value)) return `Enter a valid ${label}.`;
  return null;
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.STERLING_STAR_INGEST_SECRET;
  if (expectedSecret) {
    const provided =
      req.headers.get("x-sterling-ingest-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      null;
    if (!secretsMatch(provided, expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const { ip } = await getRequestClientMeta();
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many applications. Try again later." }, { status: 429 });
  }

  if (supabaseAdminIsMock || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server is not configured correctly." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = clean(body.fullName ?? body.name, 80);
  const email = clean(body.email, 254).toLowerCase();
  const socials = clean(body.socials, 400);
  const ageRaw = clean(body.age, 3);
  const city = clean(body.city, 80);
  const state = clean(body.state, 80);
  const country = clean(body.country, 80);

  if (!fullName || !NAME_RE.test(fullName) || !fullName.includes(" ")) {
    return NextResponse.json({ error: "Enter your first and last name." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.includes("..")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!socials || socials.length < 3 || (!HANDLE_RE.test(socials) && !/^@?[\w.]{2,}$/.test(socials))) {
    return NextResponse.json({ error: "Enter at least one social media handle." }, { status: 400 });
  }
  if (!/^\d+$/.test(ageRaw)) {
    return NextResponse.json({ error: "Enter your age as a whole number." }, { status: 400 });
  }
  const age = Number(ageRaw);
  if (age < 18) {
    return NextResponse.json({ error: "You must be 18 or older to apply." }, { status: 400 });
  }
  if (age > 120) {
    return NextResponse.json({ error: "Enter a valid age." }, { status: 400 });
  }
  const cityErr = validatePlace(city, "city");
  const stateErr = validatePlace(state, "state");
  const countryErr = validatePlace(country, "country");
  if (cityErr || stateErr || countryErr) {
    return NextResponse.json({ error: cityErr || stateErr || countryErr }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("sterling_star_applications").insert({
    full_name: fullName,
    email,
    socials,
    age,
    city,
    state,
    country,
    source: "sterling-landing",
  });

  if (error) {
    console.error("sterling_star_applications insert failed:", error.message);
    return NextResponse.json({ error: "Could not save your application. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
