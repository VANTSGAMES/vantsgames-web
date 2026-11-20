import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Tier 1 Google Maps Platform Demo Key Quota Defense
(window as any).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
};
const _origConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (args.some((a) => typeof a === "string" && a.includes("OverQuotaMapError"))) {
    window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
  }
  _origConsoleError(...args);
};

if (import.meta.env.VITE_ROUTER !== "history" && !window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);
