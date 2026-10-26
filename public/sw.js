// Offline support. `npm run build` (tools/sw-precache.mjs) fills in BUILD and FILES with this build's real
// file names, so the whole app is saved on the first visit and every new build gets a fresh cache.
// Network-first: the newest files when online, the saved copy when offline.
const BUILD='__BUILD__',FILES=[/*__FILES__*/],C='habits-'+BUILD,HOSTS=['fonts.googleapis.com','fonts.gstatic.com'];
// One missing file must not stop the install, so each file is added on its own.
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>Promise.all(FILES.map(f=>c.add(f).catch(()=>{})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||!(u.origin===location.origin||HOSTS.includes(u.hostname)))return;
  e.respondWith(fetch(r).then(res=>{if(res.ok||res.type==='opaque'){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})
    .catch(()=>caches.match(r,{ignoreSearch:r.mode==='navigate'}).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):Response.error()))))});
