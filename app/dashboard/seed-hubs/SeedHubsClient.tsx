"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Tabs } from "@/components/dashboard/Tabs";
import { CoverageMap } from "@/lib/seeded-hubs/CoverageMap";
import {
  SEEDED_RADIUS_MAX,
  SEEDED_RADIUS_MIN,
  SEEDED_SIZE_PRESETS,
  clampSeededRadius,
  isValidSeededCoordinate,
  placeKindForRadius,
  type SeededHubListItem,
  type SeededPlaceKind,
} from "@/lib/seeded-hubs/types";
import { WORLD_CITIES, WORLD_CITY_REGIONS, type WorldCity } from "@/lib/seeded-hubs/worldCities";
import { HUB_NAME_HINT, sanitizeHubNameInput } from "@/lib/hub-name";

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 disabled:opacity-50";

async function readApiJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.status === 404
        ? "That admin API route is missing. Refresh the page and try again."
        : "The server returned a page instead of data. Refresh and try again."
    );
  }
}

function RadiusControl({ radius, onChange }: { radius: number; onChange: (next: number) => void }) {
  const placeKind = placeKindForRadius(radius);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-zinc-400">
        <span>Radius</span>
        <span className="tabular-nums text-zinc-200">
          {radius} mi · {placeKind === "neighborhood" ? "neighborhood" : "city"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(clampSeededRadius(radius - 1))}
          disabled={radius <= SEEDED_RADIUS_MIN}
          className="h-8 w-8 shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
          aria-label="Decrease radius by 1 mile"
        >
          −
        </button>
        <input
          type="number"
          min={SEEDED_RADIUS_MIN}
          max={SEEDED_RADIUS_MAX}
          step={1}
          value={radius}
          onChange={(e) => onChange(clampSeededRadius(Number(e.target.value)))}
          className={`${inputCls} h-8 w-[4.5rem] py-1 text-center tabular-nums`}
          aria-label="Coverage radius in miles"
        />
        <button
          type="button"
          onClick={() => onChange(clampSeededRadius(radius + 1))}
          disabled={radius >= SEEDED_RADIUS_MAX}
          className="h-8 w-8 shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
          aria-label="Increase radius by 1 mile"
        >
          +
        </button>
        <input
          type="range"
          min={SEEDED_RADIUS_MIN}
          max={SEEDED_RADIUS_MAX}
          step={1}
          value={radius}
          onChange={(e) => onChange(clampSeededRadius(Number(e.target.value)))}
          className="min-w-0 flex-1 accent-emerald-400"
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {SEEDED_SIZE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.radiusMiles)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 transition ${
              placeKind === preset.id
                ? "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40"
                : "bg-zinc-950 text-zinc-400 ring-zinc-800 hover:text-zinc-200"
            }`}
          >
            {preset.label} {preset.radiusMiles}
          </button>
        ))}
      </div>
    </div>
  );
}

type CustomCity = { title: string; locationHint: string; lat: number; lng: number };

function BulkPlantTab({ onPlanted }: { onPlanted: () => void }) {
  const [radius, setRadius] = useState(30);
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [citySearch, setCitySearch] = useState("");
  const [selectedCities, setSelectedCities] = useState<Record<string, boolean>>({});
  const [customCities, setCustomCities] = useState<CustomCity[]>([]);
  const [customQuery, setCustomQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [listText, setListText] = useState("");
  const [listResolving, setListResolving] = useState(false);
  const [listProgress, setListProgress] = useState<{ done: number; total: number } | null>(null);
  const [listErrors, setListErrors] = useState<Array<{ query: string; error: string }>>([]);
  const [planting, setPlanting] = useState(false);
  const [results, setResults] = useState<{ created: SeededHubListItem[]; errors: Array<{ title: string; error: string }> } | null>(null);

  const [plantedTitles, setPlantedTitles] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/seeded-hubs");
        const json = await readApiJson<{ hubs?: SeededHubListItem[] }>(res);
        if (!cancelled) setPlantedTitles(new Set((json.hubs ?? []).map((h) => sanitizeHubNameInput(h.title))));
      } catch {
        // Non-fatal — the picker just won't filter out existing hubs yet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableWorldCities = useMemo(
    () => WORLD_CITIES.filter((city) => !plantedTitles.has(city.title)),
    [plantedTitles],
  );

  const visibleCities = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    return availableWorldCities.filter((city) => {
      if (regionFilter !== "all" && city.region !== regionFilter) return false;
      if (!q) return true;
      return `${city.title} ${city.locationHint}`.toLowerCase().includes(q);
    });
  }, [availableWorldCities, regionFilter, citySearch]);

  const groupedByRegion = useMemo(() => {
    const groups = new Map<string, WorldCity[]>();
    for (const city of visibleCities) {
      const list = groups.get(city.region) ?? [];
      list.push(city);
      groups.set(city.region, list);
    }
    return groups;
  }, [visibleCities]);

  const selectedCount = Object.values(selectedCities).filter(Boolean).length + customCities.length;

  function toggleCity(title: string) {
    setSelectedCities((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  function toggleRegion(region: string) {
    const citiesInRegion = availableWorldCities.filter((c) => c.region === region);
    const allOn = citiesInRegion.every((c) => selectedCities[c.title]);
    setSelectedCities((prev) => {
      const next = { ...prev };
      for (const city of citiesInRegion) next[city.title] = !allOn;
      return next;
    });
  }

  function existingTitles() {
    return new Set([
      ...WORLD_CITIES.map((c) => c.title),
      ...customCities.map((c) => c.title),
      ...plantedTitles,
    ]);
  }

  function uniqueTitleFor(cityName: string): string {
    const base = sanitizeHubNameInput(cityName) || "hub";
    const taken = existingTitles();
    if (!taken.has(base)) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}${i}`.slice(0, 24);
      if (!taken.has(candidate)) return candidate;
    }
    return `${base}${Date.now()}`.slice(0, 24);
  }

  async function geocodeCity(query: string): Promise<{ lat: number; lng: number; cityName: string; locationHint: string }> {
    const res = await fetch("/api/admin/seeded-hubs/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const json = await readApiJson<{
      error?: string;
      lat?: number;
      lng?: number;
      cityName?: string;
      locationHint?: string;
    }>(res);
    if (!res.ok || json.lat == null || json.lng == null) {
      throw new Error(json.error || `Could not find "${query}"`);
    }
    return { lat: json.lat, lng: json.lng, cityName: json.cityName || query, locationHint: json.locationHint || query };
  }

  async function addCustomCityByName() {
    const query = customQuery.trim();
    if (!query) {
      toast.error("Enter a city (and state or country) to search for");
      return;
    }
    setGeocoding(true);
    try {
      const found = await geocodeCity(query);
      if (!isValidSeededCoordinate(found.lat, found.lng)) throw new Error(`Could not resolve coordinates for "${query}"`);
      const title = uniqueTitleFor(found.cityName);
      setCustomCities((prev) => [...prev, { title, locationHint: found.locationHint, lat: found.lat, lng: found.lng }]);
      setCustomQuery("");
      toast.success(`Found ${found.locationHint}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to find that city");
    } finally {
      setGeocoding(false);
    }
  }

  function removeCustomCity(title: string) {
    setCustomCities((prev) => prev.filter((c) => c.title !== title));
  }

  async function resolveList() {
    const lines = [...new Set(listText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
    if (lines.length === 0) {
      toast.error("Paste at least one city, one per line");
      return;
    }
    if (lines.length > 100) {
      toast.error("Resolve at most 100 cities at a time");
      return;
    }
    setListResolving(true);
    setListErrors([]);
    setListProgress({ done: 0, total: lines.length });
    const failed: Array<{ query: string; error: string }> = [];
    const added: CustomCity[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      try {
        const found = await geocodeCity(line);
        if (!isValidSeededCoordinate(found.lat, found.lng)) throw new Error("Could not resolve coordinates");
        const taken = new Set([...existingTitles(), ...added.map((c) => c.title)]);
        let title = sanitizeHubNameInput(found.cityName) || "hub";
        if (taken.has(title)) {
          for (let n = 2; n < 100 && taken.has(title); n++) title = `${sanitizeHubNameInput(found.cityName)}${n}`.slice(0, 24);
        }
        added.push({ title, locationHint: found.locationHint, lat: found.lat, lng: found.lng });
      } catch (e) {
        failed.push({ query: line, error: e instanceof Error ? e.message : "Failed to resolve" });
      }
      setListProgress({ done: i + 1, total: lines.length });
      // Nominatim's usage policy caps public requests at ~1/sec.
      if (i < lines.length - 1) await new Promise((r) => setTimeout(r, 1100));
    }
    setCustomCities((prev) => [...prev, ...added]);
    setListErrors(failed);
    setListText(failed.map((f) => f.query).join("\n"));
    setListResolving(false);
    setListProgress(null);
    if (added.length) toast.success(`Resolved ${added.length} cit${added.length === 1 ? "y" : "ies"}`);
    if (failed.length) toast.error(`${failed.length} line${failed.length === 1 ? "" : "s"} couldn't be resolved`);
  }

  async function plantBatch() {
    const picked = WORLD_CITIES.filter((c) => selectedCities[c.title]);
    const cities = [
      ...picked.map((c) => ({ title: c.title, center_lat: c.lat, center_lng: c.lng, location_hint: c.locationHint })),
      ...customCities.map((c) => ({ title: c.title, center_lat: c.lat, center_lng: c.lng, location_hint: c.locationHint })),
    ];
    if (cities.length === 0) {
      toast.error("Select at least one city");
      return;
    }
    setPlanting(true);
    setResults(null);
    try {
      const res = await fetch("/api/admin/seeded-hubs/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radius_miles: radius, cities }),
      });
      const json = await readApiJson<{
        error?: string;
        created?: SeededHubListItem[];
        errors?: Array<{ title: string; error: string }>;
      }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to plant hubs");
      const created = json.created ?? [];
      const errors = json.errors ?? [];
      setResults({ created, errors });
      if (created.length) {
        toast.success(`Planted ${created.length} hub${created.length === 1 ? "" : "s"}`);
        setSelectedCities({});
        setCustomCities([]);
        onPlanted();
      }
      if (errors.length) toast.error(`${errors.length} failed to plant`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to plant hubs");
    } finally {
      setPlanting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
              placeholder="Search cities…"
              className={`${inputCls} max-w-xs`}
            />
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className={`${inputCls} w-auto`}
            >
              <option value="all">All regions</option>
              {WORLD_CITY_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 max-h-[28rem] space-y-4 overflow-y-auto pr-1">
            {[...groupedByRegion.entries()].map(([region, cities]) => (
              <div key={region}>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{region}</p>
                  <button
                    type="button"
                    onClick={() => toggleRegion(region)}
                    className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Toggle all
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {cities.map((city) => {
                    const checked = Boolean(selectedCities[city.title]);
                    return (
                      <label
                        key={city.title}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                          checked
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                            : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCity(city.title)}
                          className="h-3.5 w-3.5 shrink-0 accent-emerald-400"
                        />
                        <span className="truncate">{city.locationHint}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {groupedByRegion.size === 0 && (
              <p className="py-8 text-center text-sm text-zinc-500">
                {availableWorldCities.length === 0 ? "All curated cities are already planted." : "No cities match."}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-4">
          <p className="mb-1 text-sm font-semibold text-zinc-200">Add a city by name</p>
          <p className="mb-3 text-[11px] text-zinc-500">Type a city and state or country — the exact coordinates are found automatically.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addCustomCityByName();
              }}
              placeholder="Brickell, Miami, FL"
              className={`${inputCls} max-w-xs`}
            />
            <button
              type="button"
              onClick={() => void addCustomCityByName()}
              disabled={geocoding || !customQuery.trim()}
              className="rounded-xl bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {geocoding ? "Finding…" : "Find & add"}
            </button>
          </div>

          <div className="mt-4 border-t border-zinc-800 pt-4">
            <p className="mb-1 text-sm font-semibold text-zinc-200">Or paste a list</p>
            <p className="mb-2 text-[11px] text-zinc-500">One city per line, e.g. "Austin, TX" or "Lyon, France".</p>
            <textarea
              value={listText}
              onChange={(e) => setListText(e.target.value)}
              placeholder={"Austin, TX\nDenver, CO\nLyon, France"}
              className={`${inputCls} min-h-[80px] resize-y font-mono text-xs`}
              disabled={listResolving}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void resolveList()}
                disabled={listResolving || !listText.trim()}
                className="rounded-xl bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {listResolving ? "Resolving…" : "Resolve & add all"}
              </button>
              {listProgress && (
                <p className="text-[11px] text-zinc-500">
                  Resolving {listProgress.done} of {listProgress.total}…
                </p>
              )}
            </div>
            {listErrors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-rose-300">
                {listErrors.map((e, i) => (
                  <li key={i}>
                    {e.query}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-[11px] text-zinc-500">{HUB_NAME_HINT}</p>
          {customCities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {customCities.map((city) => (
                <span
                  key={city.title}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-200"
                >
                  {city.locationHint}
                  <button
                    type="button"
                    onClick={() => removeCustomCity(city.title)}
                    className="text-zinc-500 hover:text-rose-300"
                    aria-label={`Remove ${city.locationHint}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {results && (
          <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm font-semibold text-zinc-200">
              Planted {results.created.length}
              {results.errors.length ? ` · ${results.errors.length} failed` : ""}
            </p>
            {results.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-rose-300">
                {results.errors.map((e, i) => (
                  <li key={i}>
                    {e.title}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="h-fit space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Bulk plant</p>
        <RadiusControl radius={radius} onChange={setRadius} />
        <p className="text-xs text-zinc-500">Applies to every city in this batch.</p>
        <div className="rounded-xl bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
          <span className="font-semibold text-zinc-100">{selectedCount}</span> cit{selectedCount === 1 ? "y" : "ies"} selected
        </div>
        <button
          type="button"
          onClick={() => void plantBatch()}
          disabled={planting || selectedCount === 0}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {planting ? "Planting…" : `Plant ${selectedCount || ""} hub${selectedCount === 1 ? "" : "s"}`}
        </button>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          New hubs are hidden from store apps until shown from the Manage hubs tab.
        </p>
      </div>
    </div>
  );
}

function MapTab({ onOpenInManageTab }: { onOpenInManageTab: (id: string) => void }) {
  const [hubs, setHubs] = useState<SeededHubListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [pendingCenter, setPendingCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");
  const [radius, setRadius] = useState(30);
  const [planting, setPlanting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<{ lat: number; lng: number; radius: number } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ lat: number; lng: number } | null>(null);
  const selectedHub = hubs.find((h) => h.id === selectedHubId) ?? null;

  useEffect(() => {
    if (!fullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seeded-hubs");
      const json = await readApiJson<{ error?: string; hubs?: SeededHubListItem[] }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to load seeded hubs");
      setHubs(json.hubs ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load seeded hubs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startPlantAt(lat: number, lng: number) {
    setSelectedHubId(null);
    setLivePreview(null);
    setMoveTarget(null);
    setPendingCenter({ lat, lng });
    setTitle("");
    setHint("");
    setRadius(30);
  }

  function cancelPlant() {
    setPendingCenter(null);
  }

  function selectHubOnMap(id: string) {
    setPendingCenter(null);
    setMoveTarget(null);
    setSelectedHubId(id);
    const hub = hubs.find((h) => h.id === id);
    if (hub) setLivePreview({ lat: hub.center_lat, lng: hub.center_lng, radius: hub.radius_miles });
  }

  function closeEdit() {
    setSelectedHubId(null);
    setLivePreview(null);
    setMoveTarget(null);
  }

  // While a hub is selected for editing, clicking elsewhere on the map moves
  // that hub there instead of starting a new plant.
  function handleMapClick(lat: number, lng: number) {
    if (selectedHubId) {
      setLivePreview((prev) => (prev ? { ...prev, lat, lng } : { lat, lng, radius: 30 }));
      setMoveTarget({ lat, lng });
    } else {
      startPlantAt(lat, lng);
    }
  }

  function handleHubSaved(updated: SeededHubListItem) {
    setHubs((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
    setLivePreview({ lat: updated.center_lat, lng: updated.center_lng, radius: updated.radius_miles });
  }

  function handleHubDeleted(hubId: string) {
    setHubs((prev) => prev.filter((h) => h.id !== hubId));
    closeEdit();
  }

  async function confirmPlant() {
    if (!pendingCenter) return;
    setPlanting(true);
    try {
      const res = await fetch("/api/admin/seeded-hubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          center_lat: pendingCenter.lat,
          center_lng: pendingCenter.lng,
          radius_miles: radius,
          location_hint: hint.trim() || null,
          place_kind: placeKindForRadius(radius),
        }),
      });
      const json = await readApiJson<{ error?: string; hub?: SeededHubListItem }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to plant hub");
      if (json.hub) setHubs((prev) => [...prev, json.hub as SeededHubListItem]);
      toast.success(`Planted ${json.hub?.title ?? title}`);
      setPendingCenter(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to plant hub");
    } finally {
      setPlanting(false);
    }
  }

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[1000] grid gap-0 bg-zinc-950 lg:grid-cols-[1fr_18rem]"
          : "grid gap-4 lg:grid-cols-[1fr_18rem]"
      }
    >
      <div
        className={
          fullscreen
            ? "relative h-full overflow-hidden bg-zinc-950"
            : "relative h-[36rem] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
        }
      >
        {loading && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-zinc-950/60">
            <p className="text-sm text-zinc-400">Loading hubs…</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="absolute right-3 top-3 z-[500] rounded-lg bg-zinc-950/85 px-3 py-1.5 text-xs font-semibold text-zinc-200 ring-1 ring-zinc-800 backdrop-blur hover:bg-zinc-900"
        >
          {fullscreen ? "Exit full screen (Esc)" : "Full screen"}
        </button>
        <CoverageMap
          lat={pendingCenter?.lat ?? livePreview?.lat ?? null}
          lng={pendingCenter?.lng ?? livePreview?.lng ?? null}
          radiusMiles={pendingCenter ? radius : livePreview?.radius ?? 30}
          placeKind={livePreview ? placeKindForRadius(livePreview.radius) : undefined}
          hubs={hubs}
          selectedHubId={selectedHubId}
          onSelectHub={selectHubOnMap}
          onCenterChange={handleMapClick}
        />
      </div>

      <div
        className={
          fullscreen
            ? "h-full space-y-4 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-4"
            : "h-fit space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
        }
      >
        {selectedHub ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Edit hub</p>
              <button
                type="button"
                onClick={() => onOpenInManageTab(selectedHub.id)}
                className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
              >
                Open in Manage hubs ↗
              </button>
            </div>
            <p className="-mt-2 text-[11px] text-zinc-500">Click elsewhere on the map to move this hub.</p>
            <HubEditForm
              key={selectedHub.id}
              hub={selectedHub}
              onSaved={handleHubSaved}
              onDeleted={handleHubDeleted}
              onLiveChange={setLivePreview}
              onClose={closeEdit}
              moveTo={moveTarget}
            />
          </>
        ) : !pendingCenter ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Plant from map</p>
            <p className="text-xs leading-relaxed text-zinc-500">
              Click anywhere on the map to drop a pin and plant a hub there. Click an existing hub's pin to edit it right here.
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Plant from map</p>
            <p className="text-[11px] tabular-nums text-zinc-500">
              {pendingCenter.lat.toFixed(4)}, {pendingCenter.lng.toFixed(4)}
            </p>
            <label className="block text-[11px] font-medium text-zinc-400">
              Hub name
              <input
                value={title}
                onChange={(e) => setTitle(sanitizeHubNameInput(e.target.value))}
                placeholder="brickell"
                className={`${inputCls} mt-1`}
                maxLength={24}
                autoFocus
              />
            </label>
            <p className="-mt-2 text-[11px] text-zinc-500">{HUB_NAME_HINT}</p>
            <label className="block text-[11px] font-medium text-zinc-400">
              Display place
              <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Brickell, Miami" className={`${inputCls} mt-1`} />
            </label>
            <RadiusControl radius={radius} onChange={setRadius} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelPlant}
                disabled={planting}
                className="flex-1 rounded-xl border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmPlant()}
                disabled={planting || !sanitizeHubNameInput(title)}
                className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {planting ? "Planting…" : "Plant hub"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Full edit form for one seeded hub: name, place, coordinates, radius,
 * store visibility, and delete. Used both by the Manage hubs tab and by the
 * Map tab's side panel (via `onLiveChange`, which lets the map preview the
 * coverage circle as fields are edited). Keep this the single source of
 * truth for hub editing so the two surfaces never drift apart. */
function HubEditForm({
  hub,
  onSaved,
  onDeleted,
  onLiveChange,
  onClose,
  moveTo,
}: {
  hub: SeededHubListItem;
  onSaved: (hub: SeededHubListItem) => void;
  onDeleted: (hubId: string) => void;
  onLiveChange?: (fields: { lat: number; lng: number; radius: number }) => void;
  onClose?: () => void;
  /** Set (to a fresh object) when the map is clicked elsewhere while this hub
   * is being edited, so the click moves the hub instead of starting a new
   * plant. A new object reference every time is what makes the effect below
   * re-fire even if someone clicks the same spot twice in a row. */
  moveTo?: { lat: number; lng: number } | null;
}) {
  const [busy, setBusy] = useState(false);
  const [seededVisible, setSeededVisible] = useState(hub.seeded_visible);
  const [title, setTitle] = useState(hub.title);
  const [hint, setHint] = useState(hub.location_hint ?? "");
  const [description, setDescription] = useState(hub.description ?? "");
  const [lat, setLat] = useState(String(hub.center_lat));
  const [lng, setLng] = useState(String(hub.center_lng));
  const [radius, setRadius] = useState(clampSeededRadius(hub.radius_miles));

  useEffect(() => {
    if (!moveTo) return;
    setLat(String(moveTo.lat));
    setLng(String(moveTo.lng));
  }, [moveTo]);

  const onLiveChangeRef = useRef(onLiveChange);
  onLiveChangeRef.current = onLiveChange;
  useEffect(() => {
    onLiveChangeRef.current?.({ lat: Number(lat), lng: Number(lng), radius });
  }, [lat, lng, radius]);

  async function saveHub() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/seeded-hubs/${hub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.trim() || null,
          location_hint: hint.trim() || null,
          radius_miles: radius,
          center_lat: Number(lat),
          center_lng: Number(lng),
        }),
      });
      const json = await readApiJson<{ error?: string; hub?: SeededHubListItem }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to save hub");
      toast.success(`Saved ${json.hub?.title ?? title}`);
      if (json.hub) {
        setTitle(json.hub.title);
        setHint(json.hub.location_hint ?? "");
        setDescription(json.hub.description ?? "");
        setLat(String(json.hub.center_lat));
        setLng(String(json.hub.center_lng));
        setRadius(clampSeededRadius(json.hub.radius_miles));
        onSaved(json.hub);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save hub");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStoreVisible(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/seeded-hubs/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [hub.id], seeded_visible: next }),
      });
      const json = await readApiJson<{ error?: string; hubs?: SeededHubListItem[] }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to update visibility");
      toast.success(next ? "Now visible on store apps" : "Hidden from store apps");
      setSeededVisible(next);
      const updated = json.hubs?.find((h) => h.id === hub.id);
      if (updated) onSaved(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update visibility");
    } finally {
      setBusy(false);
    }
  }

  async function deleteHub() {
    const hasContent = hub.group_count > 0 || hub.comment_count > 0 || hub.unique_participant_count > 0;
    const confirmed = window.confirm(
      hasContent
        ? `Permanently delete ${hub.title}?\n\nThis also deletes ${hub.group_count} nested group(s), ${hub.comment_count} post(s), and ${hub.unique_participant_count} member(s). This cannot be undone.`
        : `Permanently delete ${hub.title}? This cannot be undone.`
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/seeded-hubs/${hub.id}`, { method: "DELETE" });
      const json = await readApiJson<{ error?: string; deleted?: { title?: string } }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to delete hub");
      toast.success(`Deleted ${json.deleted?.title ?? hub.title}`);
      onDeleted(hub.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete hub");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-50">Edit hub</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleStoreVisible(!seededVisible)}
            disabled={busy}
            className={`rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-40 ${
              seededVisible
                ? "border border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25"
                : "bg-sky-400 text-zinc-950 hover:bg-sky-300"
            }`}
          >
            {seededVisible ? "Hide from store apps" : "Show on store apps"}
          </button>
          <button
            type="button"
            onClick={() => void deleteHub()}
            disabled={busy}
            className="rounded-xl border border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
          >
            Delete
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-800 px-2.5 py-2 text-sm font-semibold text-zinc-400 hover:bg-zinc-800"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-medium text-zinc-400">
          Hub name
          <input
            value={title}
            onChange={(e) => setTitle(sanitizeHubNameInput(e.target.value))}
            className={`${inputCls} mt-1`}
            maxLength={24}
          />
        </label>
        <label className="text-[11px] font-medium text-zinc-400">
          Display place
          <input value={hint} onChange={(e) => setHint(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-[11px] font-medium text-zinc-400">
          Latitude
          <input value={lat} onChange={(e) => setLat(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-[11px] font-medium text-zinc-400">
          Longitude
          <input value={lng} onChange={(e) => setLng(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </div>
      <p className="-mt-1 text-[11px] text-zinc-500">{HUB_NAME_HINT}</p>

      <label className="block text-[11px] font-medium text-zinc-400">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputCls} mt-1 min-h-[64px] resize-y`}
        />
      </label>

      <RadiusControl radius={radius} onChange={setRadius} />

      <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
        <p className="text-xs text-zinc-500">
          {hub.group_count} groups · {hub.unique_participant_count} members · {hub.comment_count} posts
        </p>
        <button
          type="button"
          onClick={() => void saveHub()}
          disabled={busy}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

type HubListFilter = "all" | "store" | "hidden";

function ManageHubsTab({ initialSelectedId }: { initialSelectedId?: string }) {
  const [hubs, setHubs] = useState<SeededHubListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<HubListFilter>("all");
  const [selectedId, setSelectedId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seeded-hubs");
      const json = await readApiJson<{ error?: string; hubs?: SeededHubListItem[] }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to load seeded hubs");
      setHubs(json.hubs ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load seeded hubs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const appliedInitialSelect = useRef(false);
  useEffect(() => {
    if (appliedInitialSelect.current || !initialSelectedId || hubs.length === 0) return;
    if (hubs.some((h) => h.id === initialSelectedId)) {
      setSelectedId(initialSelectedId);
      appliedInitialSelect.current = true;
    }
  }, [initialSelectedId, hubs]);

  const filtering = search.trim().length > 0 || visibility !== "all";

  const visibleHubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return hubs.filter((hub) => {
      if (visibility === "store" && !hub.seeded_visible) return false;
      if (visibility === "hidden" && hub.seeded_visible) return false;
      if (!q) return true;
      return `${hub.title} ${hub.location_hint ?? ""}`.toLowerCase().includes(q);
    });
  }, [hubs, search, visibility]);

  const selectedHub = hubs.find((h) => h.id === selectedId) ?? null;

  function handleSaved(updated: SeededHubListItem) {
    setHubs((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
  }

  function handleDeleted(hubId: string) {
    setHubs((prev) => prev.filter((h) => h.id !== hubId));
    setSelectedId("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-200">
            {visibleHubs.length} hub{visibleHubs.length === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              filterOpen || filtering
                ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/40"
                : "border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            Filter
          </button>
        </div>
        {filterOpen && (
          <div className="mt-3 space-y-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or place"
              className={inputCls}
            />
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["store", "On store"],
                  ["hidden", "Hidden"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVisibility(id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                    visibility === id
                      ? "bg-emerald-500/20 text-emerald-100 ring-emerald-500/40"
                      : "bg-zinc-950 text-zinc-400 ring-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 max-h-[36rem] space-y-1 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
          ) : visibleHubs.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No planted hubs found.</p>
          ) : (
            visibleHubs.map((hub) => {
              const active = selectedId === hub.id;
              return (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => setSelectedId(hub.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition ${
                    active ? "bg-emerald-500/10 ring-1 ring-emerald-500/40" : "hover:bg-zinc-950"
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${active ? "text-emerald-100" : "text-zinc-100"}`}>
                      {hub.title}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500">{hub.location_hint || "No place hint"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {hub.seeded_visible && (
                      <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200 ring-1 ring-sky-500/25">
                        Store
                      </span>
                    )}
                    <span className="text-[11px] tabular-nums text-zinc-600">{hub.radius_miles}mi</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        {!selectedHub ? (
          <div className="flex h-full min-h-[20rem] items-center justify-center text-center">
            <div>
              <p className="text-base font-medium text-zinc-200">Pick a hub to edit</p>
              <p className="mt-1 text-sm text-zinc-500">Choose a planted hub on the left.</p>
            </div>
          </div>
        ) : (
          <HubEditForm key={selectedHub.id} hub={selectedHub} onSaved={handleSaved} onDeleted={handleDeleted} />
        )}
      </div>
    </div>
  );
}

type SeedHubsTab = "plant" | "map" | "manage";

export function SeedHubsClient() {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [tab, setTab] = useState<SeedHubsTab>("plant");
  const [pendingHubId, setPendingHubId] = useState<string | undefined>(undefined);

  function goManageHub(id: string) {
    setPendingHubId(id);
    setTab("manage");
  }

  return (
    <div className="space-y-6">
      <Tabs
        key={tab}
        tabs={[
          { id: "plant", label: "Bulk plant", color: "emerald" },
          { id: "map", label: "Map", color: "violet" },
          { id: "manage", label: "Manage hubs", color: "blue" },
        ]}
        defaultTab={tab}
        variant="segmented"
        onChange={(id) => setTab(id as SeedHubsTab)}
      />

      {tab === "plant" && <BulkPlantTab onPlanted={() => setRefreshNonce((n) => n + 1)} />}
      {tab === "map" && <MapTab onOpenInManageTab={goManageHub} />}
      {tab === "manage" && <ManageHubsTab key={refreshNonce} initialSelectedId={pendingHubId} />}
    </div>
  );
}
