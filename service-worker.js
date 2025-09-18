const C = 'v1';
const ASSETS = [
'/',
'/index.html',
'/css/style.css',
'/js/app.js',
'/manifest.webmanifest'
];
self.addEventListener('install', e => {
e.waitUntil(caches.open(C).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => {
e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==C).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', e => {
e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});