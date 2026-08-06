"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  label?: string;
}

const sizes = {
  sm: "text-sm",
  md: "text-xl",
  lg: "text-2xl",
};

export function StarRating({
  value,
  onChange,
  size = "md",
  disabled,
  label,
}: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div
      className={cn("flex items-center gap-0.5", sizes[size])}
      role="radiogroup"
      aria-label={label ?? "Rating"}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= active;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled || !onChange}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            onMouseEnter={() => onChange && setHover(star)}
            onMouseLeave={() => onChange && setHover(0)}
            onClick={() => onChange?.(star)}
            className={cn(
              "transition-transform active:scale-90 disabled:cursor-default",
              onChange && !disabled ? "cursor-pointer hover:scale-110" : ""
            )}
          >
            <span
              className={filled ? "text-amber-400" : "text-slate-300"}
              aria-hidden
            >
              ★
            </span>
          </button>
        );
      })}
    </div>
  );
}
