const C='kc-v1';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html'])))});
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  const u=e.request.url;if(e.request.method!=='GET'||!(u.startsWith(self.location.origin)||u.startsWith('https://cdn.jsdelivr.net/')))return;
  e.respondWith(fetch(e.request).then(r=>{const k=r.clone();caches.open(C).then(c=>c.put(e.request,k));return r})
    .catch(()=>caches.match(e.request).then(m=>m||caches.match('./index.html'))));
});
