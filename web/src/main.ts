import "./styles.css";
import { start } from "./app";

void start(document.getElementById("app")!);

// Offline use (public/sw.js). Only in the built site, so the dev server always serves fresh files.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("./sw.js").catch(() => undefined));
}
