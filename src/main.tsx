import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { installChunkErrorGuard } from "@/lib/chunkErrorGuard";

// Install before render so a stale lazy chunk failing during the initial
// route mount is caught too.
installChunkErrorGuard();

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
