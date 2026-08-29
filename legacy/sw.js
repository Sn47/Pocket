const C='pocket-v4';
const P=[
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@fontsource-variable/space-grotesk@5.1.1/index.css',
  'https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.1.1/index.css'
];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(C).then(c=>c.addAll(P)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(res=>{
      const cl=res.clone();caches.open(C).then(c=>c.put(e.request,cl));
      return res;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
    if(res.ok&&(e.request.url.startsWith(self.location.origin)||e.request.url.includes('jsdelivr'))){
      const cl=res.clone();caches.open(C).then(c=>c.put(e.request,cl));
    }
    return res;
  }).catch(()=>caches.match('./index.html'))));
});
