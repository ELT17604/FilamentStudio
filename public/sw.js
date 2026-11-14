const cacheName = 'filament-studio-v10';
const paths = [
  './',
  './app.js',
  './ui.js',
  './inventory-store.js',
  './sync.js',
  './model.js',
  './guide.js',
  './material-data.js',
  './style.css',
  './app.webmanifest',
  './icon-192.png',
  './icon-512.png',
];
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      for (const path of paths) {
        const response = await fetch(path, { cache: 'reload' });
        if (!response.ok || response.redirected) throw Error('无法缓存应用');
        await cache.put(path, response);
      }
    })(),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('filament-studio-') && k !== cacheName)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
// Cache the application shell only. Account data always goes through the API.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (event.request.mode === 'navigate' && url.pathname === '/')
    event.respondWith(
      fetch(event.request).catch(
        async () => (await (await caches.open(cacheName)).match('./')) || Response.error(),
      ),
    );
  else if (paths.some((p) => new URL(p, location.href).pathname === url.pathname))
    event.respondWith(
      caches
        .open(cacheName)
        .then((c) => c.match(event.request))
        .then((r) => r || fetch(event.request)),
    );
});
