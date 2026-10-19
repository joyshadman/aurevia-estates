import { getVersion, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Imported only by the lazily loaded map canvases, so the library and its CSS
// never reach a page that shows no interactive map (spec 0011, AC-8). The worker
// is copied into `public/` on install (scripts/copy-maplibre-worker.mjs).
setWorkerUrl(`/maplibre/worker-${getVersion()}.mjs`);

export const styleTimeoutMs = 8000;

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
