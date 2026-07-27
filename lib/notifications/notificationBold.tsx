"use client";

import type { ReactNode } from "react";

/** Matches mobile inbox `renderBoldedText` — `**segment**` renders bold. */
export function renderBoldedMarkup(text: string, boldClassName = "font-bold text-zinc-50"): ReactNode {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);
  return segments.map((segment, i) => {
    if (segment.startsWith("**") && segment.endsWith("**") && segment.length > 4) {
      return (
        <span key={i} className={boldClassName}>
          {segment.slice(2, -2)}
        </span>
      );
    }
    return <span key={i}>{segment}</span>;
  });
}
