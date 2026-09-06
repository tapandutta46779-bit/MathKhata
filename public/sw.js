const CACHE_PREFIX = 'mathkhata-public-beta-';
const CACHE_NAME = `${CACHE_PREFIX}v7`;
const OFFLINE_READY_PATH = './offline-ready.json';
const CORE_ASSETS = [
  './offline-assets.json',
  './manifest.webmanifest',
  './privacy.html',
  './feedback.html',
  './public-beta.css',
  './icons/mathkhata.svg',
  './icons/mathkhata-192.png',
  './icons/mathkhata-512.png',
  ...[
    'KaTeX_AMS-Regular.woff2',
    'KaTeX_Caligraphic-Bold.woff2',
    'KaTeX_Caligraphic-Regular.woff2',
    'KaTeX_Fraktur-Bold.woff2',
    'KaTeX_Fraktur-Regular.woff2',
    'KaTeX_Main-Bold.woff2',
    'KaTeX_Main-BoldItalic.woff2',
    'KaTeX_Main-Italic.woff2',
    'KaTeX_Main-Regular.woff2',
    'KaTeX_Math-BoldItalic.woff2',
    'KaTeX_Math-Italic.woff2',
    'KaTeX_SansSerif-Bold.woff2',
    'KaTeX_SansSerif-Italic.woff2',
    'KaTeX_SansSerif-Regular.woff2',
    'KaTeX_Script-Regular.woff2',
    'KaTeX_Size1-Regular.woff2',
    'KaTeX_Size2-Regular.woff2',
    'KaTeX_Size3-Regular.woff2',
    'KaTeX_Size4-Regular.woff2',
    'KaTeX_Typewriter-Regular.woff2',
  ].map((name) => `./fonts/${name}`),
];

async function precacheBuild() {
  const cache = await caches.open(CACHE_NAME);
  const indexUrl = new URL('./index.html', self.registration.scope);
  const response = await fetch(indexUrl, { cache: 'reload' });
  if (!response.ok) throw new Error(`Cannot cache Math Notebook shell: ${response.status}`);
  const html = await response.text();
  await cache.put(indexUrl, new Response(html, { headers: response.headers }));
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map((match) => new URL(match[1], indexUrl).href)
    .filter((url) => new URL(url).origin === indexUrl.origin);
  const manifestResponse = await fetch(new URL('./offline-assets.json', indexUrl), { cache: 'reload' });
  if (!manifestResponse.ok) throw new Error(`Cannot cache Math Notebook asset manifest: ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  const buildAssets = Array.isArray(manifest.assets)
    ? manifest.assets.map((asset) => new URL(asset, indexUrl).href)
    : [];
  await cache.addAll([...new Set([
    ...CORE_ASSETS.map((asset) => new URL(asset, indexUrl).href),
    ...assetUrls,
    ...buildAssets,
  ])]);
  await cache.put(
    new URL(OFFLINE_READY_PATH, indexUrl),
    new Response(JSON.stringify({ ready: true, cachedAt: Date.now() }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheBuild().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
  // API responses must remain network-only, including readiness and errors.
  if (requestUrl.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        // Public information pages must never replace the cached notebook shell.
        // Only the app entry routes are eligible for the index cache.
        const path = requestUrl.pathname.replace(/\/+$/, '') || '/';
        if (response.ok && !/no-store|private/i.test(response.headers.get('cache-control') || '') && (path === '/' || path === '/index.html')) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL('./index.html', self.registration.scope), response.clone());
        }
        return response;
      } catch (error) {
        const fallback = await caches.match(new URL('./index.html', self.registration.scope), { ignoreVary: true });
        if (fallback) return fallback;
        throw error;
      }
    }
    const cached = await caches.match(event.request, { ignoreVary: true });
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && !/no-store|private/i.test(response.headers.get('cache-control') || '')) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
