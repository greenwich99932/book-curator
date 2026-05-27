// BookCurator Service Worker
// 캐싱 전략:
// - UI 자산 (HTML, 아이콘, manifest): Cache-first (오프라인에서도 UI 로드)
// - API 호출 (Gemini): 캐싱하지 않음 (실시간 결과 필요)

const CACHE_VERSION = 'bookcurator-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// 설치 시 핵심 자산 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 활성화 시 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// fetch 가로채기
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API 호출은 캐싱하지 않고 네트워크로 직행
  if (url.hostname.includes('generativelanguage.googleapis.com') ||
      url.hostname.includes('googleapis.com')) {
    return;  // 기본 fetch 동작 사용
  }

  // GET 요청만 캐싱
  if (event.request.method !== 'GET') return;

  // UI 자산: Cache-first, 네트워크 폴백
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 백그라운드 업데이트 (Stale-while-revalidate)
        fetch(event.request).then((fresh) => {
          if (fresh.ok) {
            caches.open(CACHE_VERSION).then((cache) =>
              cache.put(event.request, fresh.clone())
            );
          }
        }).catch(() => {});
        return cached;
      }
      // 캐시 없으면 네트워크
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) =>
            cache.put(event.request, clone)
          );
        }
        return response;
      }).catch(() => {
        // 오프라인이고 캐시도 없으면 fallback
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('오프라인 상태입니다', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});
