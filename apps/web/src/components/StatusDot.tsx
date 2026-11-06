import type { RunStatus } from "@orca/shared";
import { cn } from "@/lib/utils";

const DOT: Record<RunStatus, string> = {
  running: "bg-primary animate-fade",
  planning: "shadow-[inset_0_0_0_1.5px_var(--color-primary)]",
  needs_human: "bg-warning",
  failed: "bg-destructive",
  paused: "bg-muted-foreground",
  done: "shadow-[inset_0_0_0_1.5px_var(--color-success)]",
};

/** A run's status as a small dot, in the sidebar, run lists and on project icons. */
export function StatusDot({ status, className }: { status: RunStatus; className?: string }) {
  return <i aria-hidden="true" className={cn("block size-[7px] shrink-0 rounded-full", DOT[status], className)} />;
}
