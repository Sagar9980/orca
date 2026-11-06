import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { desktop } from "./lib/desktop";
import "./index.css";

// The desktop app hides the system title bar, so the page draws one in Orca's colors. The window is dragged by it,
// and the traffic lights (macOS) or window buttons (Windows, Linux) sit on it. See --tb in index.css.
if (desktop) document.documentElement.classList.add("is-desktop");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {desktop && (
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-50 grid h-tb place-items-center border-b border-border bg-panel text-[12.5px] leading-none font-semibold text-muted-foreground select-none [-webkit-app-region:drag]"
      >
        Orca
      </div>
    )}
    <App />
  </StrictMode>,
);
