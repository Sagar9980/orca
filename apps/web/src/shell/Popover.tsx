import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "../components/icons";
import { cn } from "../lib/utils";

interface Props {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  label: string;
  children: ReactNode;
}

const GAP = 6;
const EDGE = 12;

/** A small floating panel under (or above) its anchor. Closes on Escape or a click outside. */
export function Popover({ anchor, onClose, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = ref.current;
      if (!a || !el) return;
      const { offsetWidth: w, offsetHeight: h } = el;
      const left = Math.min(Math.max(EDGE, a.left), window.innerWidth - w - EDGE);
      const below = a.bottom + GAP;
      const top = below + h > window.innerHeight - EDGE ? Math.max(EDGE, a.top - h - GAP) : below;
      setPos({ left, top });
    };
    place();
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const anchorEl = anchor.current;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchorEl?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
      anchorEl?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    // Move focus into the panel so keyboard users land on its first control.
    ref.current?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-30 max-h-[min(440px,calc(100vh-24px))] w-[330px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-[14px] border border-border-strong bg-popover p-1.5 text-popover-foreground shadow-[0_24px_50px_-16px_rgba(0,0,0,0.55)]"
      role="dialog"
      aria-label={label}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ---------- Menus inside a popover ----------

export function Menu({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col", className)} {...props} />;
}

/** The small caps title of a menu, with an optional Back button before it. */
export function MenuHead({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5 font-mono text-[10.5px] leading-none font-medium tracking-[0.12em] text-faint uppercase">
      {children}
    </div>
  );
}

export function MenuBack(props: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-[3px] py-0.5 pr-1.5 font-sans text-xs font-medium tracking-normal text-muted-foreground normal-case [&_svg]:size-3"
      {...props}
    />
  );
}

interface MenuItemProps extends Omit<ComponentProps<"button">, "children" | "name"> {
  icon: ReactNode;
  name: ReactNode;
  sub?: ReactNode;
  /** Shows a check mark at the end. */
  checked?: boolean;
  /** Something else at the end, e.g. a chevron. */
  end?: ReactNode;
  mono?: boolean;
}

export function MenuItem({ icon, name, sub, checked, end, mono, className, ...props }: MenuItemProps) {
  return (
    <button
      type="button"
      className={cn(
        "grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left hover:not-disabled:bg-card focus-visible:bg-card",
        className,
      )}
      {...props}
    >
      <span className="grid place-items-center text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className={cn("truncate", mono ? "font-mono text-[12.5px]" : "text-[13.5px]")}>{name}</span>
        {sub && <span className="truncate font-mono text-[11px] leading-[1.35] text-faint">{sub}</span>}
      </span>
      {checked ? (
        <span className="grid place-items-center text-primary [&_svg]:size-3.5">
          <CheckIcon />
        </span>
      ) : end ? (
        <span className="grid place-items-center text-faint [&_svg]:size-3">{end}</span>
      ) : (
        <span />
      )}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="mx-1 my-1.5 h-px bg-border" role="separator" />;
}

/** A line of explanation; `quiet` for the fine print at the bottom of a menu. */
export function MenuNote({ quiet, children }: { quiet?: boolean; children: ReactNode }) {
  return (
    <p className={cn("px-2.5 pt-1.5 pb-2 leading-normal", quiet ? "text-xs text-faint" : "text-[12.5px] text-muted-foreground")}>
      {children}
    </p>
  );
}
