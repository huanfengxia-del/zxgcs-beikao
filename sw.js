/* 备考台 · Service Worker
   目标：
   1) 让手机浏览器认得出「可以安装」（Android Chrome 需要 SW）
   2) 第二次打开不再重新下载 8MB 页面（隧道带宽小，首开要 30 秒）
   策略：页面走 network-first（保证更新），静态资源走 cache-first（图、图标基本不变）。 */
const VER = 'beikao-v1';
const CORE = ['./', './index.html', './manifest.json', './assets/icon-180.png', './assets/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VER).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      /* 大模型接口 /v1 不拦 */
  if (url.pathname.indexOf('/v1/') === 0) return;

  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VER).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VER).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
