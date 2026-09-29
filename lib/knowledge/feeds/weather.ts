import { hourIn, instantIn } from "@/lib/conversations/time";
import { cleanText, dayLabel, fetchJson, httpsUrl, type FeedContext, type FeedResult, type PulledItem } from "@/lib/knowledge/feeds/shared";

const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max";

function describe(code: number): string {
  if (code === 0) return "clear skies";
  if (code === 1) return "mostly clear";
  if (code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 55) return "drizzle";
  if (code === 56 || code === 57 || code === 66 || code === 67) return "freezing rain";
  if (code === 61) return "light rain";
  if (code === 63) return "rain";
  if (code === 65) return "heavy rain";
  if (code === 71) return "light snow";
  if (code === 73 || code === 77) return "snow";
  if (code === 75) return "heavy snow";
  if (code === 80 || code === 81) return "rain showers";
  if (code === 82) return "heavy rain showers";
  if (code === 85 || code === 86) return "snow showers";
  if (code === 95) return "thunderstorms";
  if (code === 96 || code === 99) return "thunderstorms with hail";
  return "mixed weather";
}

type ForecastPayload = {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: Array<number | null>;
    wind_speed_10m_max?: number[];
  };
};

async function forecast(context: FeedContext, lat: number, lng: number): Promise<{ found: number; items: PulledItem[] }> {
  const imperial = context.country === "US";
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lng.toFixed(3),
    daily: DAILY,
    timezone: context.timeZone,
    forecast_days: "2",
  });
  if (imperial) {
    params.set("temperature_unit", "fahrenheit");
    params.set("wind_speed_unit", "mph");
  }
  const payload = await fetchJson<ForecastPayload>(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  const daily = payload.daily;
  const days = daily?.time ?? [];
  const unit = imperial ? "°F" : "°C";
  const items: PulledItem[] = [];
  for (const [index, day] of days.entries()) {
    const code = Number(daily?.weather_code?.[index] ?? -1);
    const high = Math.round(Number(daily?.temperature_2m_max?.[index]));
    const low = Math.round(Number(daily?.temperature_2m_min?.[index]));
    const rain = Number(daily?.precipitation_probability_max?.[index] ?? 0);
    const wind = Math.round(Number(daily?.wind_speed_10m_max?.[index] ?? 0));
    if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
    const notable =
      code >= 61 ||
      rain >= 60 ||
      high >= (imperial ? 95 : 35) ||
      low <= (imperial ? 20 : -7) ||
      wind >= (imperial ? 30 : 50);
    // Tomorrow always makes small talk; today only when it stands out and the day is still young.
    if (index === 0 && (!notable || hourIn(context.timeZone, context.now) >= 11)) continue;
    const parts = [`${describe(code)}, high of ${high}${unit} and low of ${low}${unit}`];
    if (rain >= 20) parts.push(`${Math.round(rain)}% chance of rain`);
    if (wind >= (imperial ? 25 : 40)) parts.push(`wind up to ${wind} ${imperial ? "mph" : "km/h"}`);
    const label = dayLabel(new Date(`${day}T12:00:00Z`), "UTC");
    const dayParams = new URLSearchParams(params);
    dayParams.delete("forecast_days");
    dayParams.set("start_date", day);
    dayParams.set("end_date", day);
    items.push({
      source: "weather",
      claim: `Forecast for ${context.city} on ${label}: ${parts.join(", ")}.`,
      url: `https://api.open-meteo.com/v1/forecast?${dayParams.toString()}`,
      author: "the forecast",
      postedAt: context.now.toISOString(),
      imageUrl: null,
      expiresAt: instantIn(context.timeZone, day, 23, 59).toISOString(),
      structured: true,
    });
  }
  return { found: days.length, items };
}

type AlertsPayload = {
  features?: Array<{
    properties?: {
      "@id"?: string;
      event?: string;
      headline?: string;
      status?: string;
      messageType?: string;
      sent?: string;
      expires?: string;
      ends?: string | null;
    };
  }>;
};

/** Active National Weather Service alerts for the hub's point. US only. */
async function usAlerts(lat: number, lng: number): Promise<{ found: number; items: PulledItem[] }> {
  const payload = await fetchJson<AlertsPayload>(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`, {
    headers: { Accept: "application/geo+json" },
  });
  const features = payload.features ?? [];
  const items: PulledItem[] = [];
  for (const feature of features) {
    const alert = feature.properties;
    if (!alert || alert.status !== "Actual" || alert.messageType === "Cancel") continue;
    const url = httpsUrl(alert["@id"]);
    const claim = cleanText(alert.headline || alert.event, 400);
    if (!url || !claim) continue;
    items.push({
      source: "weather",
      claim,
      url,
      author: "National Weather Service",
      postedAt: alert.sent ? new Date(alert.sent).toISOString() : null,
      imageUrl: null,
      expiresAt: alert.ends || alert.expires ? new Date(String(alert.ends || alert.expires)).toISOString() : null,
    });
  }
  return { found: features.length, items: items.slice(0, 3) };
}

export async function pullWeather(context: FeedContext): Promise<FeedResult> {
  if (context.lat === null || context.lng === null) {
    return { feed: "weather", found: 0, items: [], error: "This hub has no map location for weather" };
  }
  const [forecastResult, alertResult] = await Promise.allSettled([
    forecast(context, context.lat, context.lng),
    context.country === "US" ? usAlerts(context.lat, context.lng) : Promise.resolve({ found: 0, items: [] }),
  ]);
  const items = [
    ...(forecastResult.status === "fulfilled" ? forecastResult.value.items : []),
    ...(alertResult.status === "fulfilled" ? alertResult.value.items : []),
  ];
  const found =
    (forecastResult.status === "fulfilled" ? forecastResult.value.found : 0) + (alertResult.status === "fulfilled" ? alertResult.value.found : 0);
  const error =
    forecastResult.status === "rejected"
      ? forecastResult.reason instanceof Error
        ? forecastResult.reason.message
        : "Forecast failed"
      : null;
  return { feed: "weather", found, items, error };
}
