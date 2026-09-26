"use client";

import { useState, useRef, useEffect } from "react";

export type Tab = {
  id: string;
  label: string;
  count?: number;
  color?: "emerald" | "amber" | "rose" | "blue" | "violet";
};

type TabsProps = {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  variant?: "pills" | "underline" | "segmented";
  size?: "sm" | "md";
  className?: string;
  children?: (activeTab: string) => React.ReactNode;
};

const colorMap: Record<string, { active: string; inactive: string; pill: string; indicator: string; count: string }> = {
  emerald: {
    active: "text-emerald-300",
    inactive: "text-zinc-500 hover:text-zinc-200",
    pill: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    indicator: "bg-emerald-500",
    count: "bg-emerald-500/20 text-emerald-300",
  },
  amber: {
    active: "text-amber-300",
    inactive: "text-zinc-500 hover:text-zinc-200",
    pill: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    indicator: "bg-amber-500",
    count: "bg-amber-500/20 text-amber-300",
  },
  rose: {
    active: "text-rose-300",
    inactive: "text-zinc-500 hover:text-zinc-200",
    pill: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    indicator: "bg-rose-500",
    count: "bg-rose-500/20 text-rose-300",
  },
  blue: {
    active: "text-blue-300",
    inactive: "text-zinc-500 hover:text-zinc-200",
    pill: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
    indicator: "bg-blue-500",
    count: "bg-blue-500/20 text-blue-300",
  },
  violet: {
    active: "text-violet-300",
    inactive: "text-zinc-500 hover:text-zinc-200",
    pill: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    indicator: "bg-violet-500",
    count: "bg-violet-500/20 text-violet-300",
  },
};

export function Tabs({
  tabs,
  defaultTab,
  onChange,
  variant = "pills",
  size = "md",
  className = "",
  children,
}: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? "");
  const [sliderStyle, setSliderStyle] = useState({ width: 0, left: 0 });
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const idx = tabs.findIndex((t) => t.id === activeTab);
    const el = tabsRef.current[idx];
    if (el && (variant === "underline" || variant === "segmented")) {
      setSliderStyle({ width: el.offsetWidth, left: el.offsetLeft });
    }
  }, [activeTab, tabs, variant]);

  function handleTabClick(tabId: string) {
    setActiveTab(tabId);
    onChange?.(tabId);
  }

  const activeColor = tabs.find((t) => t.id === activeTab)?.color;
  const colors = colorMap[activeColor ?? "emerald"] ?? colorMap.emerald;

  return (
    <div className={className}>
      <div className={variant === "segmented" ? "max-w-full overflow-x-auto" : undefined}>
      <div
        className={
          variant === "segmented"
            ? "relative inline-flex min-w-full rounded-2xl bg-zinc-800 p-1"
            : "relative flex flex-wrap items-center gap-1"
        }
      >
        {variant === "underline" && (
          <div
            className="absolute bottom-0 h-0.5 rounded-full transition-all duration-300 ease-out"
            style={{ width: sliderStyle.width, left: sliderStyle.left }}
          >
            <div className={`h-full w-full rounded-full ${colors.indicator}`} />
          </div>
        )}

        {variant === "segmented" && (
          <div
            className={`absolute rounded-xl bg-zinc-700 shadow-sm transition-all duration-300 ease-out ${size === "sm" ? "h-[calc(100%-8px)]" : "h-[calc(100%-8px)]"}`}
            style={{
              width: sliderStyle.width ? sliderStyle.width - 4 : 0,
              left: sliderStyle.left ? sliderStyle.left + 2 : 2,
              top: 4,
            }}
          />
        )}

        {tabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const base = size === "sm" ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm sm:min-h-0 sm:py-2";

          let classes =
            "relative z-10 flex shrink-0 items-center gap-2 whitespace-nowrap font-medium transition-all duration-200 rounded-xl select-none";

          if (variant === "pills") {
            classes += isActive
              ? ` ${colors.pill} ring-1`
              : ` ${colors.inactive}`;
          } else if (variant === "underline") {
            classes += isActive
              ? ` ${colors.active}`
              : ` ${colors.inactive}`;
            classes += " rounded-none border-b-2 border-transparent";
          } else if (variant === "segmented") {
            classes += isActive
              ? " text-zinc-50"
              : " text-zinc-400 hover:text-zinc-200";
          }

          return (
            <button
              key={tab.id}
              ref={(el) => { tabsRef.current[idx] = el; }}
              onClick={() => handleTabClick(tab.id)}
              className={`${base} ${classes}`}
              role="tab"
              aria-selected={isActive}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${
                    isActive
                      ? tab.color
                        ? colorMap[tab.color].count
                        : "bg-zinc-700 text-zinc-200"
                      : "bg-zinc-700 text-zinc-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      </div>

      {children && <div className="mt-6">{children(activeTab)}</div>}
    </div>
  );
}
