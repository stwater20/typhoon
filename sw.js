const CACHE_NAME = 'typhoon-calc-v9';
const APP_SHELL = [
  './', './index.html', './privacy.html', './manifest.json', './icon-192.png', './icon-512.png',
  './assets/css/style.css', './assets/js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function putInCache(req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; // 廣告、字型、Nominatim、GitHub 按鈕都直接走網路

  // 頁面與程式碼走網路優先，確保改版後馬上生效；離線才用快取
  if (req.mode === 'navigate' || /\.(html|js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req).then((res) => putInCache(req, res)).catch(() =>
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => putInCache(req, res)).catch(() => cached);
      return cached || network;
    })
  );
});
