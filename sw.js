/* ORACY customer app — service worker (Batch P).
 * Its only jobs: show an order notification and open the Orders screen when it is tapped.
 * It caches nothing, so customers always get the current app. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "Order update";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body.slice(0, 300) : "",
    tag: typeof data.tag === "string" ? data.tag.slice(0, 80) : "order",
    renotify: true,
    icon: "assets/icons/icon-192.png",
    badge: "assets/icons/badge-96.png",
    data: {url: "./?orders=1"},   // always this app's own Orders screen, whatever the message says
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const page of pages) {
      if (page.url.startsWith(self.registration.scope)) {
        page.postMessage({type: "oracy-open-orders"});
        return page.focus();
      }
    }
    return self.clients.openWindow(new URL("./?orders=1", self.registration.scope).href);
  })());
});
