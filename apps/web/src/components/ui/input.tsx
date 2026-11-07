import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-[42px] min-w-0 rounded-lg border border-input bg-card px-3 text-[14.5px] text-foreground transition-[border-color,box-shadow] placeholder:text-faint",
        "hover:border-[color-mix(in_oklab,var(--color-primary)_35%,var(--color-input))]",
        "focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_22%,transparent)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
