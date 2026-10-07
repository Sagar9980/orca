import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

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
      className="pop"
      role="dialog"
      aria-label={label}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}
