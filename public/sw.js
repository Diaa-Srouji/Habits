// Offline support. `npm run build` (tools/sw-precache.mjs) fills in BUILD and FILES with this build's real
// file names, so the whole app is saved on the first visit and every new build gets a fresh cache.
// Network-first: the newest files when online, the saved copy when offline or when the network is too slow (WAIT ms).
// sync.js loads Firebase from gstatic.com, so those modules are saved too (found by reading the built files).
const BUILD='__BUILD__',FILES=[/*__FILES__*/],C='habits-'+BUILD,HOSTS=['fonts.googleapis.com','fonts.gstatic.com'],WAIT=3000;
const FB='https://www.gstatic.com/firebasejs/';
const cacheable=u=>u.origin===location.origin||HOSTS.includes(u.hostname)||u.href.startsWith(FB);

// One Firebase module plus every module it imports from the same place
async function grab(c,url,seen){
  if(seen.has(url))return;seen.add(url);
  try{const res=await fetch(url);if(!res.ok)return;await c.put(url,res.clone());
    const deps=[...(await res.text()).matchAll(/(?:from|import)\s*["']([^"']+\.js)["']/g)].map(m=>new URL(m[1],url).href).filter(u=>u.startsWith(FB));
    await Promise.all(deps.map(d=>grab(c,d,seen)))}catch(e){}}

async function install(){
  const c=await caches.open(C);
  // One missing file must not stop the install, so each file is added on its own.
  await Promise.all(FILES.map(f=>c.add(f).catch(()=>{})));
  const seen=new Set();
  for(const f of FILES.filter(f=>f.endsWith('.js'))){
    const r=await c.match(f);if(!r)continue;
    const urls=(await r.text()).match(/https:\/\/www\.gstatic\.com\/firebasejs\/[\w.\-\/]+\.js/g)||[];
    await Promise.all(urls.map(u=>grab(c,u,seen)))}}

self.addEventListener('install',e=>e.waitUntil(install().then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('habits-')&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||!cacheable(u))return;
  const nav=r.mode==='navigate',look=()=>caches.match(r,{ignoreSearch:nav});
  const net=fetch(r).then(res=>{if(res.ok||res.type==='opaque'){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res});
  const saved=()=>look().then(m=>m||(nav?caches.match('index.html'):Response.error()));
  const slow=new Promise(ok=>setTimeout(()=>look().then(m=>m&&ok(m)),WAIT));   // weak signal: use the saved copy after WAIT ms
  e.waitUntil(net.catch(()=>{}));   // the fresh copy still lands in the cache
  e.respondWith(Promise.race([net.catch(saved),slow]))});
