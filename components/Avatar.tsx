import { cn } from "@/lib/cn";

interface AvatarProps {
  src?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "size-8 text-xs",
  md: "size-11 text-base",
  lg: "size-16 text-2xl",
};

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  const initials = (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote avatars are already optimized
      <img
        src={src}
        alt={name ?? "avatar"}
        referrerPolicy="no-referrer"
        className={cn("rounded-full bg-slate-200 object-cover", sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-teal-600 font-semibold text-white",
        sizes[size],
        className
      )}
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}
