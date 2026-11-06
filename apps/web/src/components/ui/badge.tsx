import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { ToneClass } from "@/lib/tones";

/** A small mono caps label in a status color, e.g. "Working" or "Verified". */
export function Badge({ tone, className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone: ToneClass }) {
  return (
    <span
      className={cn(
        tone,
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-(--tone)/14 px-[7px] py-1 font-mono text-[9.5px] leading-none font-medium tracking-[0.09em] text-(--tone) uppercase",
        className,
      )}
      {...props}
    />
  );
}
