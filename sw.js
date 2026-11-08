/* 备考台 · Service Worker
   目标：
   1) 让手机浏览器认得出「可以安装」（Android Chrome 需要 SW）
   2) 第二次打开不再重新下载 8MB 页面（隧道带宽小，首开要 30 秒）
   3) 新版本发布后不用手动清缓存：先问一个几字节的 build.txt，版本变了才重下页面
   策略：页面走「缓存优先 + 版本校验」，静态资源走 cache-first（图、图标基本不变）。 */
const BUILD = 'mw79h1xm';
const VER = 'beikao-' + BUILD;
const CORE = ['./', './index.html', './manifest.json', './build.txt', './assets/icon-180.png', './assets/icon-512.png'];

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

function fresh(req) {
  return fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(VER).then((c) => c.put(req, copy)).catch(() => {});
    return res;
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      /* 大模型接口 /v1 不拦 */
  if (url.pathname.indexOf('/v1/') === 0) return;
  if (url.pathname.endsWith('/build.txt')) return;  /* 版本探测永远走网络 */

  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  if (isDoc) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (!hit) return fresh(req).catch(() => caches.match('./index.html'));
      /* 有缓存：先确认线上是不是新版本（build.txt 只有几十字节） */
      try {
        const res = await fetch('./build.txt', { cache: 'no-store' });
        if (res && res.ok) {
          const v = (await res.text()).trim();
          if (v && v !== BUILD) return fresh(req);   /* 线上更新了，直接给新版 */
        }
      } catch (err) { /* 离线：继续用缓存 */ }
      return hit;
    })());
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
