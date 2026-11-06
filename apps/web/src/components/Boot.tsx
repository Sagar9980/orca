import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A centered message while something loads, or when there's nothing to show. Links in it are accent-colored. */
export function Boot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid min-h-[60vh] place-items-center content-center gap-3 text-center font-mono text-muted-foreground [&_a]:text-primary [&_a]:underline",
        className,
      )}
    >
      {children}
    </div>
  );
}
