"use client";

import { useEffect } from "react";

const MOBILE_QUERY = "(max-width: 1023px)";

function headerLabels(table: HTMLTableElement): string[] {
  return Array.from(table.querySelectorAll("thead th")).map((cell) =>
    (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

function stackTable(table: HTMLTableElement, mobile: boolean) {
  if (!mobile || table.offsetParent === null) {
    table.classList.remove("mobile-stack");
    return;
  }

  const headers = headerLabels(table);
  if (headers.length < 2) {
    table.classList.remove("mobile-stack");
    return;
  }

  table.querySelectorAll("tbody tr").forEach((row) => {
    const cells = Array.from(row.children).filter(
      (cell): cell is HTMLTableCellElement => cell.tagName === "TD",
    );
    const spans = cells.some((cell) => cell.colSpan > 1);
    if (spans || cells.length !== headers.length) {
      cells.forEach((cell) => cell.removeAttribute("data-label"));
      return;
    }
    cells.forEach((cell, index) => {
      const label = headers[index] ?? "";
      if (label) cell.setAttribute("data-label", label);
      else cell.removeAttribute("data-label");
    });
  });

  table.classList.add("mobile-stack");
}

export function MobileTableStack() {
  useEffect(() => {
    const root = document.querySelector(".dashboard-tech main");
    if (!root) return;

    const media = window.matchMedia(MOBILE_QUERY);
    let frame = 0;

    const run = () => {
      const mobile = media.matches;
      root.querySelectorAll("table").forEach((table) => stackTable(table, mobile));
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(run);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    media.addEventListener("change", schedule);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", schedule);
    };
  }, []);

  return null;
}
