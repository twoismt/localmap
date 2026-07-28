// Offline-first service worker: pre-cache the whole app shell so the map,
// data and planner work with no network at all.
const CACHE = "bkk-map-v3";
const RANGES = ["0-255","256-511","512-767","768-1023","1024-1279","1280-1535","7680-7935","8192-8447","8448-8703"];
const GLYPHS = [];
for (const font of ["DejaVu Sans", "DejaVu Sans Bold"])
  for (const r of RANGES) GLYPHS.push("./glyphs/" + encodeURIComponent(font) + "/" + r + ".pbf");
const ASSETS = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest",
  "./vendor/maplibre-gl.js", "./vendor/maplibre-gl.css",
  "./data/places.js", "./data/transit.js", "./data/basemap.js", "./data/themes.js",
  "./js/geo.js", "./js/planner.js", "./js/app.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  ...GLYPHS
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => hit))
  );
});
