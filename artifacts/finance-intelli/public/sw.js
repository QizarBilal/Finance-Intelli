const CACHE = "finance-intelli-shell-v2";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["./", "./manifest.webmanifest", "./favicon.svg"])));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.includes("/api/") || url.searchParams.has("token")) return;
  event.respondWith(fetch(request).then(response => {
    const copy = response.clone();
    if (response.ok && url.origin === self.location.origin) caches.open(CACHE).then(cache => cache.put(request, copy));
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match("./"))));
});
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || "You have a new update." }; }
  const title = typeof data.title === "string" ? data.title : "Finance Intelli";
  const body = typeof data.body === "string" ? data.body : "You have a new account update.";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/studio";
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/favicon.svg", badge: "/favicon.svg", tag: "finance-intelli-update", data: { url } }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = typeof event.notification.data?.url === "string" && event.notification.data.url.startsWith("/") ? event.notification.data.url : "/studio";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const matching = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (matching) return matching.navigate(target).then(() => matching.focus());
    return self.clients.openWindow(target);
  }));
});
