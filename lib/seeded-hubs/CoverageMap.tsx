"use client";

import { useEffect, useRef, useState } from "react";
import type { Circle, CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import type { SeededHubListItem, SeededPlaceKind } from "@/lib/seeded-hubs/types";
import "leaflet/dist/leaflet.css";

const METERS_PER_MILE = 1609.344;

type Props = {
  lat: number | null;
  lng: number | null;
  radiusMiles: number;
  placeKind?: SeededPlaceKind | null;
  hubs?: SeededHubListItem[];
  selectedHubId?: string | null;
  onCenterChange?: (lat: number, lng: number) => void;
  onSelectHub?: (id: string) => void;
};

function coverageColors(kind: SeededPlaceKind | null | undefined, dim = false) {
  const neighborhood = kind === "neighborhood";
  const accent = neighborhood ? "#38bdf8" : "#34d399";
  return {
    stroke: accent,
    fill: dim
      ? neighborhood
        ? "rgba(56, 189, 248, 0.10)"
        : "rgba(52, 211, 153, 0.10)"
      : neighborhood
        ? "rgba(56, 189, 248, 0.16)"
        : "rgba(52, 211, 153, 0.16)",
    opacity: dim ? 0.45 : 0.85,
  };
}

function isFiniteCoord(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hubTooltipHtml(title: string, hint: string) {
  return `<div class="font-semibold">${escapeHtml(title)}</div><div class="opacity-70">${escapeHtml(hint)}</div>`;
}

function hubHint(hub: Pick<SeededHubListItem, "radius_miles" | "place_kind" | "location_hint" | "seeded_visible">) {
  return [
    `${hub.radius_miles} mi ${hub.place_kind === "neighborhood" ? "neighborhood" : "city"}`,
    hub.location_hint,
    hub.seeded_visible ? "on store" : "hidden from store",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CoverageMap({
  lat,
  lng,
  radiusMiles,
  placeKind,
  hubs = [],
  selectedHubId,
  onCenterChange,
  onSelectHub,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const othersRef = useRef<LayerGroup | null>(null);
  const onCenterChangeRef = useRef(onCenterChange);
  const onSelectHubRef = useRef(onSelectHub);
  const [ready, setReady] = useState(false);

  onCenterChangeRef.current = onCenterChange;
  onSelectHubRef.current = onSelectHub;

  const hasCenter = lat != null && lng != null && isFiniteCoord(lat, lng);
  const hasCenterRef = useRef(hasCenter);
  hasCenterRef.current = hasCenter;
  const hasFitAllBoundsRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;

    void import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = mod.default;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([39.5, -98.35], 4);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      othersRef.current = L.layerGroup().addTo(map);

      map.on("click", (event) => {
        onCenterChangeRef.current?.(event.latlng.lat, event.latlng.lng);
      });

      mapRef.current = map;
      setReady(true);
      requestAnimationFrame(() => {
        if (mapRef.current === map) map.invalidateSize();
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      circleRef.current = null;
      markerRef.current = null;
      othersRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el || !ready) return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    map.invalidateSize();
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    const group = othersRef.current;
    if (!map || !group || !ready) return;

    void import("leaflet").then((mod) => {
      const current = mapRef.current;
      const layers = othersRef.current;
      if (!current || !layers) return;
      const L = mod.default;
      layers.clearLayers();

      const others = hubs.filter(
        (hub) =>
          hub.id !== selectedHubId &&
          isFiniteCoord(hub.center_lat, hub.center_lng),
      );

      for (const hub of others) {
        const colors = coverageColors(hub.place_kind, true);
        const meters = Math.max(hub.radius_miles, 0.25) * METERS_PER_MILE;
        const center: [number, number] = [hub.center_lat, hub.center_lng];

        const circle = L.circle(center, {
          radius: meters,
          color: colors.stroke,
          weight: 1.5,
          fillColor: colors.fill,
          fillOpacity: 1,
          opacity: colors.opacity,
          interactive: false,
        });

        const marker = L.circleMarker(center, {
          radius: 8,
          color: "#fafafa",
          weight: 2,
          fillColor: colors.stroke,
          fillOpacity: 1,
          opacity: 0.9,
          bubblingMouseEvents: false,
        });

        marker.bindTooltip(hubTooltipHtml(hub.title, hubHint(hub)), {
          permanent: true,
          direction: "top",
          offset: [0, -10],
          className: "seeded-hub-label",
          opacity: 1,
          interactive: true,
        });

        const select = (event: { originalEvent?: Event }) => {
          if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
          onSelectHubRef.current?.(hub.id);
        };
        marker.on("click", select);
        marker.getTooltip()?.on("click", select);

        layers.addLayer(circle);
        layers.addLayer(marker);
      }

      // Only auto-fit to every hub once, on first load — refitting every time
      // the hub list changes (e.g. after planting a new one) would yank the
      // admin's current pan/zoom back out to a world view.
      if (!hasCenterRef.current && others.length > 0 && !hasFitAllBoundsRef.current) {
        current.fitBounds(L.featureGroup(layers.getLayers()).getBounds(), {
          padding: [36, 36],
          maxZoom: 11,
          animate: false,
        });
        hasFitAllBoundsRef.current = true;
      }
    });
  }, [ready, hubs, selectedHubId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    void import("leaflet").then((mod) => {
      const current = mapRef.current;
      if (!current) return;
      const L = mod.default;
      if (!hasCenter || lat == null || lng == null) {
        circleRef.current?.remove();
        markerRef.current?.remove();
        circleRef.current = null;
        markerRef.current = null;
        return;
      }

      const colors = coverageColors(placeKind);
      const meters = Math.max(radiusMiles, 0.25) * METERS_PER_MILE;
      const center: [number, number] = [lat, lng];

      if (!circleRef.current) {
        circleRef.current = L.circle(center, {
          radius: meters,
          color: colors.stroke,
          weight: 2,
          fillColor: colors.fill,
          fillOpacity: 1,
          opacity: 0.85,
          interactive: false,
        }).addTo(current);
      } else {
        circleRef.current.setLatLng(center);
        circleRef.current.setRadius(meters);
        circleRef.current.setStyle({
          color: colors.stroke,
          fillColor: colors.fill,
        });
      }

      const selected = hubs.find((hub) => hub.id === selectedHubId);
      const tooltipHtml = hubTooltipHtml(
        selected?.title ?? "New hub",
        selected ? hubHint({ ...selected, radius_miles: radiusMiles, place_kind: placeKind ?? selected.place_kind }) : `${radiusMiles} mi`,
      );

      if (!markerRef.current) {
        markerRef.current = L.circleMarker(center, {
          radius: 8,
          color: "#fafafa",
          weight: 2,
          fillColor: colors.stroke,
          fillOpacity: 1,
        }).addTo(current);
        markerRef.current.bindTooltip(tooltipHtml, {
          permanent: true,
          direction: "top",
          offset: [0, -10],
          className: "seeded-hub-label",
          opacity: 1,
        });
      } else {
        markerRef.current.setLatLng(center);
        markerRef.current.setStyle({ fillColor: colors.stroke });
        markerRef.current.setTooltipContent(tooltipHtml);
      }
      markerRef.current.bringToFront();

      current.fitBounds(circleRef.current.getBounds(), {
        padding: [32, 32],
        maxZoom: 14,
        animate: false,
      });
    });
  }, [ready, lat, lng, radiusMiles, placeKind, hasCenter, hubs, selectedHubId]);

  const otherCount = hubs.filter((hub) => hub.id !== selectedHubId).length;

  return (
    <>
      <div
        ref={containerRef}
        className="coverage-map absolute inset-0 z-0 h-full w-full [&_.leaflet-tile-pane]:brightness-[0.85] [&_.leaflet-tile-pane]:hue-rotate-180 [&_.leaflet-tile-pane]:invert"
      />
      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-xl bg-zinc-950/85 px-3 py-2 text-xs text-zinc-200 ring-1 ring-zinc-800 backdrop-blur">
        {hasCenter ? (
          <>
            <p className="font-semibold tabular-nums">
              {lat!.toFixed(4)}, {lng!.toFixed(4)}
            </p>
            <p className="mt-0.5 text-zinc-400">
              {radiusMiles} mile radius
              {otherCount > 0 ? ` · ${otherCount} other planted` : ""}
            </p>
          </>
        ) : hubs.length > 0 ? (
          <>
            <p className="font-semibold text-zinc-100">
              {hubs.length} planted hub{hubs.length === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 text-zinc-400">Click a hub to edit coverage</p>
          </>
        ) : (
          <p className="text-zinc-300">Click the map to set the center</p>
        )}
      </div>
    </>
  );
}
