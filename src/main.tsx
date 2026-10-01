import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { installChunkErrorGuard } from "@/lib/chunkErrorGuard";
import { initWebVitals } from "@/lib/monitoring";

// Install before render so a stale lazy chunk failing during the initial
// route mount is caught too.
installChunkErrorGuard();

// Field Core Web Vitals (LCP/INP/CLS). No-op without VITE_RUM_ENDPOINT,
// console-only in dev. See src/lib/monitoring.ts + docs/ops/monitoring.md.
initWebVitals();

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error('Root element not found!');
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
