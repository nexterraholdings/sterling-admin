"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  LifecyclePill,
  personLabel,
  formatRelativeTime,
} from "@/app/dashboard/discussions/discussionUi";
import {
  SEEDED_RADIUS_MAX,
  SEEDED_RADIUS_MIN,
  SEEDED_SIZE_PRESETS,
  clampSeededRadius,
  isValidSeededCoordinate,
  placeKindForRadius,
  type CityHubsLaunchState,
  type NearbyUserHub,
  type SeededHubListItem,
  type SeededPlaceKind,
} from "@/lib/seeded-hubs/types";
import { CoverageMap } from "@/lib/seeded-hubs/CoverageMap";
import {
  HUB_NAME_HINT,
  hubNameConflictMessage,
  hubNameFormatError,
  hubNamesCollide,
  sanitizeHubNameInput,
  type HubNameConflict,
} from "@/lib/hub-name";

type NearbySort = "distance" | "members" | "posts" | "title";
type ListMode = "range" | "all";

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
        : "The server returned a page instead of data. Refresh and try again.",
    );
  }
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function KindBadge({ kind }: { kind: SeededPlaceKind | null | undefined }) {
  const neighborhood = kind === "neighborhood";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        neighborhood
          ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/25"
          : "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25"
      }`}
    >
      {neighborhood ? "Nabe" : "City"}
    </span>
  );
}

export function SeedHubsClient() {
  const [planting, setPlanting] = useState(false);
  const [seededHubs, setSeededHubs] = useState<SeededHubListItem[]>([]);
  const [seededSearch, setSeededSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");

  const [title, setTitle] = useState("");
  const [hint, setHint] = useState("");
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [placeKind, setPlaceKind] = useState<SeededPlaceKind>("city");
  const [radius, setRadius] = useState(30);

  const [nearby, setNearby] = useState<NearbyUserHub[]>([]);
  const [allHubs, setAllHubs] = useState<NearbyUserHub[]>([]);
  const [listMode, setListMode] = useState<ListMode>("all");
  const [nearbyQuery, setNearbyQuery] = useState("");
  const [nearbySort, setNearbySort] = useState<NearbySort>("distance");
  const [selectedSources, setSelectedSources] = useState<Record<string, boolean>>({});
  const [selectedSeeded, setSelectedSeeded] = useState<Record<string, boolean>>({});
  const [loadingSeeded, setLoadingSeeded] = useState(true);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [loadingAll, setLoadingAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launch, setLaunch] = useState<CityHubsLaunchState | null>(null);
  const [nameStatus, setNameStatus] = useState<{ available: boolean | null; error: string | null }>({
    available: null,
    error: null,
  });
  const nearbyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const sourceHubs = listMode === "all" ? allHubs : nearby;
  const selectedSourceIds = useMemo(
    () => Object.entries(selectedSources).filter(([, on]) => on).map(([id]) => id),
    [selectedSources],
  );
  const selectedRows = useMemo(
    () => sourceHubs.filter((hub) => selectedSources[hub.id]),
    [sourceHubs, selectedSources],
  );
  const selectedPosts = selectedRows.reduce((sum, hub) => sum + hub.comment_count, 0);
  const selectedMembers = selectedRows.reduce((sum, hub) => sum + hub.unique_participant_count, 0);
  const selectedHub = seededHubs.find((hub) => hub.id === selectedId) ?? null;

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const coordsReady = isValidSeededCoordinate(latNum, lngNum);
  const coverageDirty = Boolean(
    selectedHub &&
      (clampSeededRadius(radius) !== clampSeededRadius(selectedHub.radius_miles) ||
        (hint.trim() || null) !== (selectedHub.location_hint?.trim() || null) ||
        placeKind !== (selectedHub.place_kind === "neighborhood" ? "neighborhood" : "city") ||
        !Number.isFinite(latNum) ||
        !Number.isFinite(lngNum) ||
        Math.abs(latNum - selectedHub.center_lat) > 1e-5 ||
        Math.abs(lngNum - selectedHub.center_lng) > 1e-5),
  );

  const visibleSeeded = useMemo(() => {
    const q = seededSearch.trim().toLowerCase();
    if (!q) return seededHubs;
    return seededHubs.filter((hub) => `${hub.title} ${hub.location_hint ?? ""}`.toLowerCase().includes(q));
  }, [seededHubs, seededSearch]);

  const storeVisibleCount = useMemo(
    () => seededHubs.filter((hub) => hub.seeded_visible).length,
    [seededHubs],
  );
  const selectedSeededIds = useMemo(
    () => seededHubs.filter((hub) => selectedSeeded[hub.id]).map((hub) => hub.id),
    [seededHubs, selectedSeeded],
  );
  const selectedHiddenCount = selectedSeededIds.filter(
    (id) => !seededHubs.find((hub) => hub.id === id)?.seeded_visible,
  ).length;
  const selectedVisibleCount = selectedSeededIds.length - selectedHiddenCount;
  const allSeededSelected = seededHubs.length > 0 && selectedSeededIds.length === seededHubs.length;

  const filteredHubs = useMemo(() => {
    const annotated = sourceHubs.map((hub) => {
      if (!coordsReady) return hub;
      const distance = Math.round(milesBetween(latNum, lngNum, hub.center_lat, hub.center_lng) * 100) / 100;
      return { ...hub, distance_miles: distance, in_range: distance <= radius };
    });
    const q = nearbyQuery.trim().toLowerCase();
    const rows = q
      ? annotated.filter((hub) => {
          const hay = `${hub.title} ${hub.location_hint ?? ""} ${personLabel(hub.creator)}`.toLowerCase();
          return hay.includes(q);
        })
      : annotated;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (nearbySort === "members") return b.unique_participant_count - a.unique_participant_count;
      if (nearbySort === "posts") return b.comment_count - a.comment_count;
      if (nearbySort === "title") return a.title.localeCompare(b.title);
      const da = a.distance_miles ?? Number.POSITIVE_INFINITY;
      const db = b.distance_miles ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
    return sorted;
  }, [sourceHubs, nearbyQuery, nearbySort, coordsReady, latNum, lngNum, radius]);

  const inCoverageCount = filteredHubs.filter((hub) => hub.in_range !== false && hub.distance_miles != null).length;

  const localNameConflict = useMemo((): HubNameConflict | null => {
    if (!planting || !title) return null;
    const seeded = seededHubs.find((hub) => hubNamesCollide(hub.title, title));
    if (seeded) {
      return { id: seeded.id, title: seeded.title, origin: "seeded", lifecycle_status: null };
    }
    const user = [...allHubs, ...nearby].find((hub) => hubNamesCollide(hub.title, title));
    if (user) {
      return { id: user.id, title: user.title, origin: "user", lifecycle_status: user.lifecycle_status };
    }
    return null;
  }, [planting, title, seededHubs, allHubs, nearby]);

  useEffect(() => {
    if (!planting) {
      setNameStatus({ available: null, error: null });
      return;
    }
    const formatError = title ? hubNameFormatError(title) : "Hub name is required.";
    if (formatError) {
      setNameStatus({ available: false, error: title ? formatError : null });
      return;
    }
    if (localNameConflict) {
      setNameStatus({ available: false, error: hubNameConflictMessage(localNameConflict) });
      return;
    }
    setNameStatus({ available: null, error: null });
    if (nameDebounce.current) clearTimeout(nameDebounce.current);
    let cancelled = false;
    nameDebounce.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/seeded-hubs?checkName=${encodeURIComponent(title)}`);
          const json = await readApiJson<{ available?: boolean; error?: string }>(res);
          if (cancelled) return;
          if (!res.ok) throw new Error(json.error || "Could not check hub name");
          setNameStatus({
            available: json.available === true,
            error: json.available === true ? null : String(json.error || "That hub name is already in use."),
          });
        } catch (e) {
          if (cancelled) return;
          setNameStatus({
            available: null,
            error: e instanceof Error ? e.message : "Could not check hub name",
          });
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      if (nameDebounce.current) clearTimeout(nameDebounce.current);
    };
  }, [planting, title, localNameConflict]);

  const loadSeeded = useCallback(async () => {
    setLoadingSeeded(true);
    try {
      const res = await fetch("/api/admin/seeded-hubs");
      const json = await readApiJson<{ error?: string; hubs?: SeededHubListItem[] }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to load seeded hubs");
      setSeededHubs(json.hubs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load seeded hubs");
    } finally {
      setLoadingSeeded(false);
    }
  }, []);

  useEffect(() => {
    void loadSeeded();
  }, [loadSeeded]);

  const loadLaunch = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/seeded-hubs/release");
      const json = await readApiJson<{ error?: string; launch?: CityHubsLaunchState }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to load launch state");
      setLaunch(json.launch ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load launch state");
    }
  }, []);

  useEffect(() => {
    void loadLaunch();
  }, [loadLaunch]);

  const loadNearby = useCallback(async (override?: { lat?: number; lng?: number; radius?: number }) => {
    const centerLat = override?.lat ?? Number(lat);
    const centerLng = override?.lng ?? Number(lng);
    const miles = override?.radius ?? radius;
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return;
    setError(null);
    setLoadingNearby(true);
    try {
      const params = new URLSearchParams({
        lat: String(centerLat),
        lng: String(centerLng),
        radius: String(miles),
      });
      const res = await fetch(`/api/admin/seeded-hubs/nearby?${params}`);
      const json = await readApiJson<{ error?: string; hubs?: NearbyUserHub[] }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to load nearby hubs");
      setNearby((json.hubs ?? []) as NearbyUserHub[]);
      setSelectedSources({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load nearby hubs");
    } finally {
      setLoadingNearby(false);
    }
  }, [lat, lng, radius]);

  const loadAllUserHubs = useCallback(async () => {
    setLoadingAll(true);
    try {
      const res = await fetch("/api/admin/seeded-hubs/user-hubs");
      const json = await readApiJson<{ error?: string; hubs?: NearbyUserHub[] }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to load user hubs");
      setAllHubs((json.hubs ?? []) as NearbyUserHub[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load user hubs");
    } finally {
      setLoadingAll(false);
    }
  }, []);

  useEffect(() => {
    void loadAllUserHubs();
  }, [loadAllUserHubs]);

  function applyHub(hub: SeededHubListItem) {
    setPlanting(false);
    setSelectedId(hub.id);
    setTitle(hub.title);
    setHint(hub.location_hint ?? "");
    setDescription(hub.description ?? "");
    setLat(String(hub.center_lat));
    setLng(String(hub.center_lng));
    const miles = clampSeededRadius(Number(hub.radius_miles) || 30);
    setPlaceKind(hub.place_kind === "neighborhood" ? "neighborhood" : "city");
    setRadius(miles);
  }

  function startPlant() {
    setPlanting(true);
    setSelectedId("");
    setTitle("");
    setHint("");
    setDescription("");
    setLat("");
    setLng("");
    setPlaceKind("city");
    setRadius(30);
    setNearby([]);
    setSelectedSources({});
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function setCoverageRadius(next: number) {
    const miles = clampSeededRadius(next);
    setRadius(miles);
    setPlaceKind(placeKindForRadius(miles));
  }

  function applySize(kind: SeededPlaceKind) {
    const preset = SEEDED_SIZE_PRESETS.find((item) => item.id === kind);
    if (preset) setCoverageRadius(preset.radiusMiles);
  }

  useEffect(() => {
    if (!coordsReady) return;
    if (nearbyDebounce.current) clearTimeout(nearbyDebounce.current);
    nearbyDebounce.current = setTimeout(() => {
      void loadNearby({ lat: latNum, lng: lngNum, radius });
    }, 450);
    return () => {
      if (nearbyDebounce.current) clearTimeout(nearbyDebounce.current);
    };
  }, [coordsReady, latNum, lngNum, radius, loadNearby]);

  async function createHub() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/seeded-hubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          center_lat: Number(lat),
          center_lng: Number(lng),
          radius_miles: clampSeededRadius(radius),
          location_hint: hint.trim() || null,
          place_kind: placeKind,
          description: description.trim() || null,
        }),
      });
      const json = await readApiJson<{ error?: string; hub?: SeededHubListItem }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to plant hub");
      toast.success(`Planted ${json.hub?.title ?? title}`);
      setPlanting(false);
      if (json.hub) applyHub(json.hub);
      await loadSeeded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to plant hub");
    } finally {
      setBusy(false);
    }
  }

  async function saveCoverage() {
    if (!selectedId) {
      setError("Pick a seeded hub first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/seeded-hubs/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          center_lat: Number(lat),
          center_lng: Number(lng),
          radius_miles: clampSeededRadius(radius),
          location_hint: hint.trim() || null,
          place_kind: placeKind,
        }),
      });
      const json = await readApiJson<{ error?: string; hub?: SeededHubListItem }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to update coverage");
      const saved = json.hub;
      toast.success(
        saved
          ? `Coverage saved · ${saved.radius_miles} mi ${saved.place_kind === "neighborhood" ? "neighborhood" : "city"}`
          : "Coverage saved",
      );
      if (saved) applyHub(saved);
      await loadSeeded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update coverage");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedHub() {
    if (!selectedHub) {
      setError("Pick a seeded hub first.");
      return;
    }
    const groups = selectedHub.group_count;
    const posts = selectedHub.comment_count;
    const members = selectedHub.unique_participant_count;
    const hasContent = groups > 0 || posts > 0 || members > 0;
    const confirmed = window.confirm(
      hasContent
        ? `Permanently delete ${selectedHub.title}?\n\nThis also deletes ${groups} nested group${groups === 1 ? "" : "s"}, ${posts} post${posts === 1 ? "" : "s"}, and ${members} member${members === 1 ? "" : "s"} in this hub. This cannot be undone.`
        : `Permanently delete ${selectedHub.title}?\n\nThis city hub has no nested groups yet. This cannot be undone.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/seeded-hubs/${selectedHub.id}`, { method: "DELETE" });
      const json = await readApiJson<{ error?: string; deleted?: { title?: string } }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to delete seeded hub");
      toast.success(`Deleted ${json.deleted?.title ?? selectedHub.title}`);
      setSelectedId("");
      setTitle("");
      setHint("");
      setDescription("");
      setLat("");
      setLng("");
      setPlaceKind("city");
      setRadius(30);
      setNearby([]);
      setSelectedSources({});
      await loadSeeded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete seeded hub");
    } finally {
      setBusy(false);
    }
  }

  function selectAllSeededHubs() {
    setSelectedSeeded(Object.fromEntries(seededHubs.map((hub) => [hub.id, true])));
  }

  function toggleAllSeededHubs() {
    if (allSeededSelected) setSelectedSeeded({});
    else selectAllSeededHubs();
  }

  async function setSelectedStoreVisible(next: boolean) {
    const ids = selectedSeededIds.length > 0
      ? selectedSeededIds
      : next
        ? []
        : seededHubs.filter((hub) => hub.seeded_visible).map((hub) => hub.id);
    if (ids.length === 0) {
      setError(next ? "Select at least one seeded hub." : "No planted hubs are visible on store apps.");
      return;
    }
    const confirmed = window.confirm(
      next
        ? `Show ${ids.length} seeded hub${ids.length === 1 ? "" : "s"} on store / production apps?\n\nOnly the checked hub${ids.length === 1 ? "" : "s"} will appear. Others stay hidden. Preview/Metro already see them.`
        : `Hide ${ids.length} seeded hub${ids.length === 1 ? "" : "s"} from store / production apps?\n\nPreview/Metro builds still see them.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setTogglingVisibility(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/seeded-hubs/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, seeded_visible: next }),
      });
      const json = await readApiJson<{
        error?: string;
        hubs?: SeededHubListItem[];
        launch?: CityHubsLaunchState;
      }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to update store visibility");
      if (json.hubs) setSeededHubs(json.hubs);
      if (json.launch) setLaunch(json.launch);
      toast.success(
        next
          ? `${ids.length} seeded hub${ids.length === 1 ? "" : "s"} visible on store apps`
          : `${ids.length} seeded hub${ids.length === 1 ? "" : "s"} hidden from store apps`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update store visibility");
    } finally {
      setTogglingVisibility(false);
      setBusy(false);
    }
  }

  async function convertSelected() {
    if (!selectedId) {
      setError("Pick a seeded hub first.");
      return;
    }
    if (selectedSourceIds.length === 0) {
      setError("Select at least one user hub to convert.");
      return;
    }
    const confirmed = window.confirm(
      `Turn ${selectedSourceIds.length} hub${selectedSourceIds.length === 1 ? "" : "s"} into groups inside ${title || "this seeded hub"}? Posts and members move with them. This cannot be undone from here.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/seeded-hubs/${selectedId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceIds: selectedSourceIds }),
      });
      const json = await readApiJson<{
        error?: string;
        converted_count?: number;
        error_count?: number;
        errors?: Array<{ error?: string }>;
      }>(res);
      if (!res.ok) throw new Error(json.error || "Failed to convert hubs");
      const converted = Number(json.converted_count ?? 0);
      const failed = Number(json.error_count ?? 0);
      if (converted) toast.success(`Converted ${converted} hub${converted === 1 ? "" : "s"} into groups`);
      if (failed) {
        const first = json.errors?.[0]?.error as string | undefined;
        toast.error(`${failed} failed${first ? `: ${first}` : ""}`);
      }
      setSelectedSources({});
      await Promise.all([loadNearby(), loadAllUserHubs(), loadSeeded()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert hubs");
    } finally {
      setBusy(false);
    }
  }

  function toggleAllVisible() {
    const ids = filteredHubs.map((hub) => hub.id);
    const allOn = ids.length > 0 && ids.every((id) => selectedSources[id]);
    if (allOn) {
      setSelectedSources((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      return;
    }
    setSelectedSources((prev) => ({
      ...prev,
      ...Object.fromEntries(ids.map((id) => [id, true])),
    }));
  }

  const visibleSelected = filteredHubs.filter((hub) => selectedSources[hub.id]).length;
  const allVisibleSelected = filteredHubs.length > 0 && visibleSelected === filteredHubs.length;

  const coverageFields = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="w-[7.5rem] text-[11px] font-medium text-zinc-400">
        Latitude
        <input className={`${inputCls} mt-1`} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="25.7617" />
      </label>
      <label className="w-[7.5rem] text-[11px] font-medium text-zinc-400">
        Longitude
        <input className={`${inputCls} mt-1`} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-80.1918" />
      </label>
      <label className="min-w-[10rem] flex-1 text-[11px] font-medium text-zinc-400">
        Display place
        <input className={`${inputCls} mt-1`} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Miami, FL" />
      </label>
      <div className="min-w-[16rem] flex-[2]">
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-zinc-400">
          <span>Radius</span>
          <span className="tabular-nums text-zinc-200">
            {radius} mi · {placeKind === "neighborhood" ? "neighborhood" : "city"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCoverageRadius(radius - 1)}
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
            onChange={(e) => setCoverageRadius(Number(e.target.value))}
            className={`${inputCls} h-8 w-[4.5rem] py-1 text-center tabular-nums`}
            aria-label="Coverage radius in miles"
          />
          <button
            type="button"
            onClick={() => setCoverageRadius(radius + 1)}
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
            onChange={(e) => setCoverageRadius(Number(e.target.value))}
            className="min-w-0 flex-1 accent-emerald-400"
          />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {SEEDED_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applySize(preset.id)}
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
    </div>
  );

  const mapPane = (
    <div className="relative min-h-[16rem] overflow-hidden bg-zinc-950 lg:min-h-0 lg:flex-1">
      <CoverageMap
        lat={coordsReady ? latNum : null}
        lng={coordsReady ? lngNum : null}
        radiusMiles={radius}
        placeKind={placeKind}
        hubs={seededHubs}
        selectedHubId={planting ? null : selectedId || null}
        onSelectHub={(id) => {
          const hub = seededHubs.find((item) => item.id === id);
          if (hub) applyHub(hub);
        }}
        onCenterChange={
          planting || selectedId
            ? (nextLat, nextLng) => {
                setLat(String(Math.round(nextLat * 1e5) / 1e5));
                setLng(String(Math.round(nextLng * 1e5) / 1e5));
              }
            : undefined
        }
      />
      {coordsReady ? (
        <a
          href={mapsUrl(latNum, lngNum)}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-3 right-3 z-[500] rounded-lg bg-zinc-950/85 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-zinc-800 hover:bg-zinc-900"
        >
          Google Maps
        </a>
      ) : null}
    </div>
  );

  return (
    <div className="-m-4 flex h-[calc(100dvh-4.75rem)] min-h-0 flex-col overflow-hidden sm:-m-6 sm:h-[calc(100dvh-5rem)] lg:-m-8">
      {error && (
        <div className="shrink-0 border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 sm:px-5">
          {error}
        </div>
      )}

      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 max-w-3xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
              Store visibility
            </p>
            <p className="mt-1 text-sm text-zinc-200">
              {storeVisibleCount > 0
                ? `${storeVisibleCount} planted hub${storeVisibleCount === 1 ? "" : "s"} visible on store / production apps. Check hubs, then hide or show only those.`
                : "Check one or more planted hubs, then show them on store / production apps. Unchecked hubs stay hidden."}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Preview and Metro builds always see planted hubs.
              {launch ? ` · ${launch.seeded_count} planted` : ""}
              {storeVisibleCount > 0 ? ` · ${storeVisibleCount} on store` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {storeVisibleCount > 0 && selectedSeededIds.length === 0 ? (
              <button
                type="button"
                onClick={() => void setSelectedStoreVisible(false)}
                disabled={busy || togglingVisibility}
                className="rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {togglingVisibility ? "Hiding…" : "Hide all from store apps"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void setSelectedStoreVisible(selectedHiddenCount > 0 || selectedVisibleCount === 0)}
                disabled={
                  busy
                  || togglingVisibility
                  || selectedSeededIds.length === 0
                }
                className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                  selectedHiddenCount > 0 || selectedVisibleCount === 0
                    ? "bg-sky-400 text-zinc-950 hover:bg-sky-300"
                    : "border border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25"
                }`}
              >
                {togglingVisibility
                  ? selectedHiddenCount > 0 || selectedVisibleCount === 0
                    ? "Showing…"
                    : "Hiding…"
                  : selectedSeededIds.length === 0
                    ? "Select hubs to show"
                    : selectedHiddenCount > 0 || selectedVisibleCount === 0
                      ? `Show ${selectedSeededIds.length} on store apps`
                      : `Hide ${selectedSeededIds.length} from store apps`}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex max-h-52 w-full shrink-0 flex-col border-b border-zinc-800 bg-zinc-900 lg:max-h-none lg:w-[17.5rem] lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-zinc-800 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Seeded</p>
                <p className="text-sm font-semibold text-zinc-50">
                  {seededHubs.length} planted
                  <span
                    className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      storeVisibleCount > 0
                        ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/25"
                        : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700"
                    }`}
                  >
                    {storeVisibleCount > 0 ? `${storeVisibleCount} on store` : "Store off"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={startPlant}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                New
              </button>
            </div>
            <input
              className={`${inputCls} mt-3`}
              value={seededSearch}
              onChange={(e) => setSeededSearch(e.target.value)}
              placeholder="Filter planted hubs"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAllSeededHubs}
                disabled={seededHubs.length === 0}
                className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                {allSeededSelected ? "Clear" : "Select all"}
              </button>
              <button
                type="button"
                onClick={() => void setSelectedStoreVisible(true)}
                disabled={busy || togglingVisibility || selectedSeededIds.length === 0}
                className="rounded-lg bg-sky-400 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-sky-300 disabled:opacity-40"
              >
                {togglingVisibility ? "Showing…" : selectedSeededIds.length ? `Show ${selectedSeededIds.length} on store` : "Show on store"}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingSeeded ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">Loading…</p>
            ) : visibleSeeded.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-zinc-300">
                  {seededHubs.length === 0 ? "No seeded hubs yet" : "No matches"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {seededHubs.length === 0 ? "Plant a city or neighborhood to start merging pins." : "Try a different name."}
                </p>
              </div>
            ) : (
              visibleSeeded.map((hub) => {
                const active = !planting && selectedId === hub.id;
                const checked = Boolean(selectedSeeded[hub.id]);
                return (
                  <div
                    key={hub.id}
                    className={`flex w-full items-start gap-2 border-b border-zinc-800/70 px-3 py-2.5 text-left transition ${
                      active ? "bg-emerald-500/10" : "hover:bg-zinc-950"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 rounded border-zinc-600 bg-zinc-900 text-sky-400 focus:ring-sky-500/30"
                      checked={checked}
                      onChange={() =>
                        setSelectedSeeded((prev) => ({ ...prev, [hub.id]: !prev[hub.id] }))
                      }
                      aria-label={`Select ${hub.title}`}
                    />
                    <button
                      type="button"
                      onClick={() => applyHub(hub)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm font-semibold ${active ? "text-emerald-100" : "text-zinc-100"}`}>
                          {hub.title}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {hub.seeded_visible ? (
                            <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200 ring-1 ring-sky-500/25">
                              Store
                            </span>
                          ) : null}
                          <KindBadge kind={hub.place_kind} />
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                        {hub.location_hint || "No place hint"}
                      </p>
                      <p className="mt-1 text-[11px] tabular-nums text-zinc-600">
                        {hub.radius_miles} mi · {hub.group_count} groups · {hub.unique_participant_count} members
                      </p>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-950">
          {planting ? (
            <div className="grid min-h-0 flex-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <div className="overflow-y-auto border-b border-zinc-800 p-5 lg:border-b-0 lg:border-r">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Plant</p>
                    <h1 className="mt-1 text-lg font-semibold text-zinc-50">New seeded hub</h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlanting(false)}
                    className="text-xs font-semibold text-zinc-500 hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  Hidden from store clients until you check it and show it. Set the pin, then plant.
                </p>
                <div className="mt-5 space-y-3">
                  <label className="block text-xs font-medium text-zinc-400">
                    Hub name
                    <input
                      ref={nameInputRef}
                      className={`${inputCls} mt-1.5`}
                      value={title}
                      onChange={(e) => setTitle(sanitizeHubNameInput(e.target.value))}
                      placeholder="miami"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={24}
                    />
                  </label>
                  <p className="-mt-1 text-[11px] text-zinc-500">{HUB_NAME_HINT}</p>
                  {nameStatus.error ? (
                    <p className="-mt-2 text-[11px] font-medium text-rose-300">{nameStatus.error}</p>
                  ) : title && nameStatus.available ? (
                    <p className="-mt-2 text-[11px] font-medium text-emerald-400">{title} is available</p>
                  ) : null}
                  <label className="block text-xs font-medium text-zinc-400">
                    Description
                    <textarea
                      className={`${inputCls} mt-1.5 min-h-[72px] resize-y`}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional. A short sentence is generated if empty."
                    />
                  </label>
                  {coverageFields}
                  <button
                    type="button"
                    onClick={() => void createHub()}
                    disabled={busy || !coordsReady || nameStatus.available !== true}
                    className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? "Planting…" : "Plant hub"}
                  </button>
                </div>
              </div>
              {mapPane}
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {selectedHub ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <h1 className="truncate text-lg font-semibold text-zinc-50">{selectedHub.title}</h1>
                          <KindBadge kind={placeKind} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {hint || "No place hint"} · {radius} mi · {selectedHub.group_count} groups already nested
                          {coverageDirty ? " · unsaved coverage" : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <h1 className="text-lg font-semibold text-zinc-50">Merge user pins</h1>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Pick a planted hub on the left or on the map, or plant one first.
                        </p>
                      </>
                    )}
                  </div>
                  {selectedId ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void deleteSelectedHub()}
                        disabled={busy}
                        className="rounded-xl border border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
                      >
                        {busy ? "Working…" : "Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveCoverage()}
                        disabled={busy || !coordsReady || !coverageDirty}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
                      >
                        {busy ? "Working…" : coverageDirty ? "Save coverage" : "Saved"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {selectedId || coordsReady ? <div className="mt-3">{coverageFields}</div> : null}
              </div>

              <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,34%)]">
                <div className="flex min-h-0 min-w-0 flex-col border-b border-zinc-800 lg:border-b-0 lg:border-r">
                  <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-2 sm:px-5">
                    <div className="flex rounded-lg bg-zinc-900 p-0.5 ring-1 ring-zinc-800">
                      <button
                        type="button"
                        onClick={() => setListMode("all")}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                          listMode === "all" ? "bg-emerald-500/20 text-emerald-100" : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        All pins
                      </button>
                      <button
                        type="button"
                        onClick={() => setListMode("range")}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                          listMode === "range" ? "bg-emerald-500/20 text-emerald-100" : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        In coverage
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      {listMode === "all"
                        ? loadingAll
                          ? "Loading…"
                          : `${filteredHubs.length} pins${coordsReady ? ` · ${inCoverageCount} in coverage` : ""}`
                        : loadingNearby
                          ? "Updating…"
                          : `${filteredHubs.length} in range`}
                    </p>
                    <input
                      className={`${inputCls} ml-auto h-8 max-w-[13rem] py-1.5 text-xs`}
                      value={nearbyQuery}
                      onChange={(e) => setNearbyQuery(e.target.value)}
                      placeholder="Filter pins"
                    />
                    <select
                      className={`${inputCls} h-8 w-auto py-1.5 text-xs`}
                      value={nearbySort}
                      onChange={(e) => setNearbySort(e.target.value as NearbySort)}
                    >
                      <option value="distance">Nearest</option>
                      <option value="members">Most members</option>
                      <option value="posts">Most posts</option>
                      <option value="title">A–Z</option>
                    </select>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto">
                    {listMode === "range" && !coordsReady ? (
                      <div className="flex h-full items-center justify-center px-6 text-center">
                        <div>
                          <p className="text-base font-medium text-zinc-200">No coverage yet</p>
                          <p className="mt-1 max-w-sm text-sm text-zinc-500">
                            Select a planted hub, or switch to All pins to browse every user pin.
                          </p>
                        </div>
                      </div>
                    ) : filteredHubs.length === 0 ? (
                      <div className="flex h-full items-center justify-center px-6 text-center">
                        <div>
                          <p className="text-base font-medium text-zinc-200">
                            {listMode === "all"
                              ? loadingAll
                                ? "Loading user hubs…"
                                : "No user-created hubs left"
                              : loadingNearby
                                ? "Looking for hubs…"
                                : "No user hubs in this radius"}
                          </p>
                          <p className="mt-1 max-w-sm text-sm text-zinc-500">
                            {listMode === "all"
                              ? "Converted pins stay hidden. New user hubs will show up here."
                              : "Widen coverage, or open All pins to assign hubs outside this radius."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          <tr>
                            <th className="w-10 px-4 py-2">
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleAllVisible}
                                className="h-4 w-4 accent-emerald-400"
                                aria-label="Select all visible hubs"
                              />
                            </th>
                            <th className="px-3 py-2">Hub</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2 text-right">Mi</th>
                            <th className="px-3 py-2 text-right">People</th>
                            <th className="px-3 py-2 text-right">Posts</th>
                            <th className="px-3 py-2">Steward</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/80">
                          {filteredHubs.map((hub) => {
                            const checked = Boolean(selectedSources[hub.id]);
                            return (
                              <tr
                                key={hub.id}
                                onClick={() =>
                                  setSelectedSources((prev) => ({ ...prev, [hub.id]: !prev[hub.id] }))
                                }
                                className={`cursor-pointer ${checked ? "bg-emerald-500/10" : "hover:bg-zinc-900/70"}`}
                              >
                                <td className="px-4 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setSelectedSources((prev) => ({ ...prev, [hub.id]: e.target.checked }));
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 accent-emerald-400"
                                  />
                                </td>
                                <td className="max-w-[13rem] px-3 py-2.5">
                                  <p className="truncate font-semibold text-zinc-100">{hub.title}</p>
                                  <p className="truncate text-[11px] text-zinc-500">{hub.location_hint || "No hint"}</p>
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <LifecyclePill status={hub.lifecycle_status} />
                                    {listMode === "all" && coordsReady && hub.in_range === false ? (
                                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-500/25">
                                        Out
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                                  {hub.distance_miles == null ? "—" : hub.distance_miles}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                                  {hub.unique_participant_count}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{hub.comment_count}</td>
                                <td className="px-3 py-2.5 text-zinc-400">
                                  <p className="truncate text-xs">{personLabel(hub.creator)}</p>
                                  <p className="text-[11px] text-zinc-600">{formatRelativeTime(hub.created_at)}</p>
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <Link
                                    href={`/dashboard/discussions/${hub.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                                  >
                                    Open
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
                {mapPane}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-900 px-4 py-3 sm:px-5">
                <div className="min-w-0 text-sm text-zinc-400">
                  {selectedId ? (
                    <p>
                      Destination{" "}
                      <span className="font-semibold text-zinc-100">{title || selectedHub?.title}</span>
                      {selectedSourceIds.length > 0 ? (
                        <>
                          {" "}
                          · <span className="font-semibold text-zinc-100">{selectedSourceIds.length}</span> hubs ·{" "}
                          <span className="tabular-nums text-zinc-200">{selectedMembers}</span> members ·{" "}
                          <span className="tabular-nums text-zinc-200">{selectedPosts}</span> posts
                        </>
                      ) : (
                        <span className="text-zinc-500"> · select pins in the table to nest as groups</span>
                      )}
                    </p>
                  ) : (
                    <p>Select a planted hub, then check the user pins to move into it.</p>
                  )}
                  {storeVisibleCount > 0 ? (
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {storeVisibleCount} planted hub{storeVisibleCount === 1 ? "" : "s"} visible on store apps. Leftover pins can still be nested by hand.
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-amber-200/80">
                      Store apps hide planted hubs until you check them and press Show on store.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    disabled={filteredHubs.length === 0}
                    className="rounded-xl border border-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    {allVisibleSelected ? "Clear visible" : "Select visible"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void convertSelected()}
                    disabled={busy || !selectedId || selectedSourceIds.length === 0}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? "Converting…" : `Convert to groups${selectedSourceIds.length ? ` (${selectedSourceIds.length})` : ""}`}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
