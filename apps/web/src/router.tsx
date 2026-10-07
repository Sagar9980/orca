import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

// A minimal history-based router: the app has a handful of flat pages.

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener("popstate", notify);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => window.location.pathname + window.location.search;

export function navigate(to: string, { replace = false } = {}) {
  if (to === snapshot()) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", to);
  window.scrollTo(0, 0);
  notify();
}

export function useLocation() {
  const href = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(href, window.location.origin);
  return { path: url.pathname.replace(/\/+$/, "") || "/", query: url.searchParams };
}

/** Removes query params (e.g. one-time ?token= or ?error=) without adding a history entry. */
export function clearQuery(...keys: string[]) {
  const url = new URL(window.location.href);
  keys.forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(null, "", url.pathname + url.search);
  notify();
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      {...rest}
      href={to}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}
