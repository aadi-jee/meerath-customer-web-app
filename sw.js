/* ORACY customer app — service worker (Batch P, Batch PC, Release A).
 * Its only jobs: show an order, offer or coupon notification and open the right screen when it is tapped.
 * It caches nothing, so customers always get the current app. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/* Batch PC: an offer. Every field of the message is untrusted: only the four words and real ids are kept,
 * and the address to open is always built here, never taken from the message. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function offerTarget(data) {
  const text = (value) => (typeof value === "string" ? value : "");
  let go = ["menu", "offers", "category", "item"].includes(text(data.go)) ? data.go : "menu";
  const id = (go === "category" || go === "item") && UUID.test(text(data.id)) ? data.id.toLowerCase() : null;
  if ((go === "category" || go === "item") && !id) go = "menu";
  return {go, id, c: UUID.test(text(data.c)) ? data.c.toLowerCase() : null};
}
function offerUrl(target) {
  return `./?go=${target.go}${target.id ? `&id=${target.id}` : ""}${target.c ? `&c=${target.c}` : ""}`;
}
/* Release A (order-push v8): "your coupon ends soon". The address is fixed here: the Rewards hub. */
const WALLET_URL = "./?wallet=1";
function couponMessage(data) {
  return data.kind === "coupon" || (typeof data.tag === "string" && /^coupon-/.test(data.tag));
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  if (!data || typeof data !== "object") data = {};
  const body = typeof data.body === "string" ? data.body.slice(0, 300) : "";
  if (data.kind === "offer") {
    const stop = typeof data.stop === "string" && data.stop.trim() ? data.stop.trim().slice(0, 30) : "Stop offers";
    event.waitUntil(self.registration.showNotification(
      typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "Offer", {
        body,
        tag: typeof data.tag === "string" && /^offer-/.test(data.tag) && UUID.test(data.tag.slice(6)) ? data.tag.toLowerCase() : "offer",
        renotify: false,
        icon: "assets/icons/icon-192.png",
        badge: "assets/icons/badge-96.png",
        actions: [{action: "stop", title: stop}],
        data: {kind: "offer", ...offerTarget(data)},
      }));
    return;
  }
  if (couponMessage(data)) {
    event.waitUntil(self.registration.showNotification(
      typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "Your coupon", {
        body,
        tag: typeof data.tag === "string" && /^coupon-/.test(data.tag) && UUID.test(data.tag.slice(7)) ? data.tag.toLowerCase() : "coupon",
        renotify: false,
        icon: "assets/icons/icon-192.png",
        badge: "assets/icons/badge-96.png",
        data: {kind: "coupon", url: WALLET_URL},   // never the message's own address
      }));
    return;
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "Order update";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: typeof data.tag === "string" ? data.tag.slice(0, 80) : "order",
    renotify: true,
    icon: "assets/icons/icon-192.png",
    badge: "assets/icons/badge-96.png",
    data: {url: "./?orders=1"},   // always this app's own Orders screen, whatever the message says
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const shown = event.notification.data || {};
  let message = {type: "oracy-open-orders"}, url = "./?orders=1";
  if (shown.kind === "coupon") { message = {type: "oracy-open-wallet"}; url = WALLET_URL; }
  else if (shown.kind === "offer") {
    if (event.action === "stop") { message = {type: "oracy-manage-offers"}; url = "./?offers=manage"; }
    else {
      const target = offerTarget(shown);   // checked again: nothing but the four words and ids leaves here
      message = {type: "oracy-open-offer", ...target};
      url = offerUrl(target);
    }
  }
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const page of pages) {
      if (page.url.startsWith(self.registration.scope)) {
        page.postMessage(message);
        return page.focus();
      }
    }
    return self.clients.openWindow(new URL(url, self.registration.scope).href);
  })());
});
