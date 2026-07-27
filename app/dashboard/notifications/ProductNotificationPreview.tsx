"use client";

import { renderBoldedMarkup } from "@/lib/notifications/notificationBold";
import { stripBoldMarkup } from "@/lib/notifications/notificationMarkup";
import type { ProductNotificationCopy } from "@/lib/notifications/defaultProductNotificationCopy";

function truncateBody(body: string, max = 90): string {
  const t = body.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function ProductNotificationPreview({
  type,
  copy,
  compact = false,
}: {
  type: string;
  copy: ProductNotificationCopy;
  compact?: boolean;
}) {
  const showSubtitle = copy.body != null && copy.body.trim().length > 0;
  const subtitle = showSubtitle ? `"${truncateBody(copy.body!)}"` : null;
  const pushBody = stripBoldMarkup(copy.title);
  const isSystem = type === "system" || type === "welcome" || type === "new_user_welcome";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">In-app inbox</p>
        <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">
              {isSystem ? "S" : "AR"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-zinc-200">{renderBoldedMarkup(copy.title)}</p>
              {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
              <p className="mt-1 text-[11px] text-zinc-600">Just now</p>
            </div>
            <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" title="Unread" />
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Push banner</p>
        <div className="rounded-2xl border border-zinc-700 bg-zinc-800/80 px-4 py-3">
          <p className="text-xs font-semibold text-zinc-300">Sterling</p>
          <p className="mt-0.5 text-sm text-zinc-100">{pushBody}</p>
          {copy.body && !isSystem && (
            <p className="mt-1 text-xs text-zinc-500">{stripBoldMarkup(copy.body).slice(0, 80)}</p>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-600">
          Push uses plain text (bold markup stripped). Most social types show @actor + action instead of the stored title.
        </p>
      </div>
    </div>
  );
}
