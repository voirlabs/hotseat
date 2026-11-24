import type { PublicPersona } from "@/lib/personas/schema";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-20 w-20 text-2xl",
  lg: "h-32 w-32 text-4xl sm:h-40 sm:w-40",
} as const;

export function PersonaAvatar({
  persona,
  size = "md",
  speaking = false,
  className,
}: {
  persona: PublicPersona;
  size?: keyof typeof SIZES;
  speaking?: boolean;
  className?: string;
}) {
  const { initials, from } = persona.avatar;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-medium text-white",
        SIZES[size],
        speaking && "speaking",
        className,
      )}
      // One flat tone of the persona's colour, deep enough for white initials.
      style={{ background: `color-mix(in oklab, ${from} 72%, #080809)` }}
    >
      {initials}
    </div>
  );
}
