"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export function InfoTooltip({
  label,
  align = "center",
}: {
  label: string;
  align?: "center" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="group relative inline-flex items-center">
      <button
        type="button"
        aria-label="More info"
        onClick={() => setOpen((o) => !o)}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-300 text-[10px] font-bold text-white hover:bg-teal-600"
      >
        !
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full z-10 mt-1.5 w-60 rounded-lg bg-slate-800 px-3 py-2 text-xs leading-snug text-white shadow-lg",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "right" && "right-0",
          !open && "hidden group-hover:block"
        )}
      >
        {label}
      </span>
    </span>
  );
}
