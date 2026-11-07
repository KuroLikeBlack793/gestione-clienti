const CACHE_NAME = "consegne-dark-v2";
const ASSETS = [
    "./",
    "./index.html",
    "./css/style.css",
    "./js/app.js",
    "./manifest.json"
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener("fetch", (e) => {
    e.respondWith(
        caches.match(e.request).then((res) => res || fetch(e.request))
    );
});