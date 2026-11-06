import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // "@/..." is src, as shadcn/ui expects (see components.json).
  resolve: { alias: { "@": decodeURIComponent(new URL("./src", import.meta.url).pathname) } },
  // Relative asset paths so the built app loads from file:// inside Electron.
  base: "./",
  server: { port: 5173, strictPort: true },
});
