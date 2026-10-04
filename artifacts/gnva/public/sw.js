const CACHE='gnva-shell-v1';
const ASSETS=['/offline.html','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')) return;
  if(req.mode==='navigate') event.respondWith(fetch(req).catch(()=>caches.match('/offline.html')));
  else if(ASSETS.includes(url.pathname)) event.respondWith(caches.match(req).then(r=>r||fetch(req)));
});
self.addEventListener('push',event=>{
  let data={title:'GNVA',body:'Une nouvelle notification vous attend.',url:'/notifications'};
  try{if(event.data)data={...data,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/icons/icon-192.png',badge:'/icons/icon-48.png',data:{url:'/notifications'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    const client=clients.find(c=>c.url.startsWith(self.location.origin));
    if(client){client.navigate('/notifications');return client.focus();}
    return self.clients.openWindow('/notifications');
  }));
});