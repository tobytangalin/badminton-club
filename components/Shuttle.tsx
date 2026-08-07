import { cn } from "@/lib/cn";

export function Shuttle({
  size = 14,
  filled = true,
  ghost = false,
}: {
  size?: number;
  filled?: boolean;
  /** Show empty shuttles as faint outlines instead of hiding them. */
  ghost?: boolean;
}) {
  return (
    <span
      className={cn("inline-block", !filled && (ghost ? "opacity-30" : "opacity-0"))}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny local icon */}
      <img
        src="/shuttlecock.png"
        alt=""
        width={size}
        height={size}
        className="inline-block align-[-2px]"
      />
    </span>
  );
}

/** A shuttle that can be fully filled, empty, or half-filled. */
export function FractionalShuttle({
  size = 14,
  fill,
}: {
  size?: number;
  /** 0 = empty, 1 = full, 0.5 = half. */
  fill: number;
}) {
  if (fill >= 1) return <Shuttle size={size} filled />;
  if (fill < 0.5) return <Shuttle size={size} filled={false} />;

  return (
    <span
      className="relative inline-block overflow-hidden align-[-2px]"
      style={{ width: size / 2, height: size }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny local icon */}
      <img
        src="/shuttlecock.png"
        alt=""
        width={size}
        height={size}
        className="block"
        style={{ maxWidth: "none" }}
      />
    </span>
  );
}
