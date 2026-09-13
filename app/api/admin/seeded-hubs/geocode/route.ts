import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  state_district?: string;
  country?: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

export async function POST(req: NextRequest) {
  await requireAdmin(OPERATOR_ROLES);

  let body: { query?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = String(body.query ?? "").trim();
  if (!query) return NextResponse.json({ error: "Enter a city to search for" }, { status: 400 });
  if (query.length > 200) return NextResponse.json({ error: "That search is too long" }, { status: 400 });

  try {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      addressdetails: "1",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        // Nominatim's usage policy requires an identifying User-Agent.
        "User-Agent": "SterlingAdmin/1.0 (internal hub-seeding tool)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) throw new Error(`Geocoding service returned ${res.status}`);

    const results = (await res.json()) as NominatimResult[];
    if (!results.length) {
      return NextResponse.json({ error: `No match found for "${query}"` }, { status: 404 });
    }

    const match = results[0];
    const address = match.address ?? {};
    const cityName = address.city || address.town || address.village || address.municipality || address.county || query.split(",")[0].trim();
    const region = address.state || address.state_district || address.country || "";
    const locationHint = [cityName, region].filter(Boolean).join(", ");

    return NextResponse.json({
      lat: Number(match.lat),
      lng: Number(match.lon),
      cityName,
      locationHint,
      displayName: match.display_name,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to geocode city";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
