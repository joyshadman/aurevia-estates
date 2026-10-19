// MapLibre 6 looks for its web worker beside its own bundle, which no longer
// holds once Next.js bundles it. Copy the installed worker into `public/` under
// its version, so `setWorkerUrl` (components/maps/load-maplibre.ts) can find it
// and an upgrade never serves a stale worker (spec 0011).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8"));
mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", `public/maplibre/worker-${version}.mjs`);
