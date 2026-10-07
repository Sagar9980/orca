import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../lib/hooks";

/** Shows `text` instantly on first render, then types out each new value. */
export function Typewriter({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const first = useRef(true);
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      setShown(text);
      return;
    }
    let i = 0;
    setShown("");
    const timer = setInterval(() => {
      i += 2;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, 22);
    return () => clearInterval(timer);
  }, [text, reduce]);

  return <>{shown}</>;
}
