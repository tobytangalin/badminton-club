"use client";

import { cn } from "@/lib/cn";

export function InfoTooltip({
  label,
  align = "center",
  open,
  onToggle,
}: {
  label: string;
  align?: "center" | "right" | "left";
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="group relative inline-flex items-center">
      <button
        type="button"
        aria-label="More info"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white",
          open ? "bg-teal-600" : "bg-slate-300 hover:bg-teal-600"
        )}
      >
        ?
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full z-10 mt-1.5 w-60 rounded-lg bg-slate-800 px-3 py-2 text-left text-xs leading-snug text-white shadow-lg",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "right" && "right-0",
          align === "left" && "left-0",
          open ? "block" : "hidden group-hover:block"
        )}
      >
        {label}
      </span>
    </span>
  );
}
