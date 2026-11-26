const CACHE='sierradirecta-shell-v2-sin-ia';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/manifest.webmanifest','/icon-192.png','/icon-512.png']))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/')));return;}
 if(u.pathname.startsWith('/assets/')||u.pathname.startsWith('/fonts/')||u.pathname.startsWith('/icon-'))event.respondWith(caches.open(CACHE).then(async c=>{const old=await c.match(event.request);if(old)return old;const res=await fetch(event.request);if(res.ok)await c.put(event.request,res.clone());return res;}));
});
