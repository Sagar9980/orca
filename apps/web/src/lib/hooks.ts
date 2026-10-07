import { useCallback, useEffect, useState } from "react";

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, Electron sandbox); the pref just won't stick.
  }
}

export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

type Theme = "light" | "dark";

/** Follows the OS until the user picks a theme, then remembers the choice. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(() => {
    const saved = readPref("orca-theme");
    return saved === "light" || saved === "dark" ? saved : null;
  });

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const isDark = current ? current === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
      const next: Theme = isDark ? "light" : "dark";
      writePref("orca-theme", next);
      return next;
    });
  }, []);

  return toggle;
}

/** Re-renders every `ms` while `active` is true and returns the current time. */
export function useNow(ms: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms, active]);
  return now;
}
