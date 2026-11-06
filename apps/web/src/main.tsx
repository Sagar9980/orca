import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { desktop } from "./lib/desktop";
import "./index.css";
import "./auth/auth.css";
import "./shell/shell.css";

// The desktop app hides the system title bar, so the page draws one in Orca's colors (see .titlebar).
if (desktop) document.documentElement.classList.add("is-desktop");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {desktop && (
      <div className="titlebar" aria-hidden="true">
        Orca
      </div>
    )}
    <App />
  </StrictMode>,
);
