import { createRoot } from "react-dom/client";
import App from "./App";
import { esAppNativa } from "./lib/api";
import "./index.css";

if (esAppNativa()) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  }
  if ("caches" in window) {
    window.caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => /workbox|pwa|vite|sw/i.test(k))
            .map((k) => window.caches.delete(k)),
        ),
      )
      .catch(() => {});
  }
}

if ((esAppNativa() || import.meta.env.VITE_ROUTER !== "history") && !window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);
