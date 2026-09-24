"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchLocationGuardrails, setLocationGuardrails } from "@/app/dashboard/settings/actions";

function formatUpdated(value: string | null) {
  if (!value) return "Not changed yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LocationGuardrailsToggle() {
  const [enabled, setEnabled] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await fetchLocationGuardrails();
      setEnabled(state.enabled);
      setUpdatedAt(state.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load location guardrails");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    setError(null);
    setEnabled(next);
    try {
      const state = await setLocationGuardrails(next);
      setEnabled(state.enabled);
      setUpdatedAt(state.updatedAt);
    } catch (err) {
      setEnabled(!next);
      setError(err instanceof Error ? err.message : "Could not update location guardrails");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-50">Require real nearby location</p>
          <p className="mt-1 text-sm text-zinc-400">
            {enabled
              ? "On. Posts, groups, and claims must pass the location checks."
              : "Off. People can post and join from anywhere."}
          </p>
          <p className="mt-3 text-xs text-zinc-500">Updated {formatUpdated(updatedAt)}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Location guardrails"
          disabled={loading || saving}
          onClick={() => void toggle()}
          className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${
            enabled ? "bg-emerald-500" : "bg-zinc-700"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
              enabled ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>

      {loading ? <p className="mt-4 text-xs text-zinc-500">Loading current setting…</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
