/* Batch P (259): order notifications when the app is closed (Web Push).
 * Permission is asked only after an order exists, and only when the customer taps "Turn on". */
const pushState = {key: null, keyTried: false, subscribed: false, busy: false, error: "", checked: false};
const PUSH_DISMISS_KEY = "oracy_push_dismissed";
function pushCopy(en, ar) { return state.lang === "ar" ? ar : en; }
function pushSupported() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator &&
    typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
}
function pushIsIos() {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function pushStandalone() {
  return (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
}
function pushDismissed() { try { return localStorage.getItem(PUSH_DISMISS_KEY) === "1"; } catch (_) { return false; } }
function pushDismiss() {
  try { localStorage.setItem(PUSH_DISMISS_KEY, "1"); } catch (_) {}
  pushRefreshCards();
}
function pushKeyBytes(text) {
  const s = text.replace(/-/g, "+").replace(/_/g, "/"), bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
/** The server's public signing key. Null means the server has no push yet: the feature stays hidden. */
async function pushPublicKey() {
  if (pushState.key || pushState.keyTried) return pushState.key;
  pushState.keyTried = true;
  const headers = {apikey: MENU_CONFIG.publicKey, "Content-Type": "application/json"};
  try {
    let response = await fetch(`${MENU_CONFIG.url}/rest/v1/rpc/oracy_push_public_key_v1`, {method: "POST", headers, body: "{}", credentials: "omit", cache: "no-store"});
    let key = response.ok ? await response.json() : null;
    if (response.ok && !key) {
      // First use ever: the server makes its keys now.
      response = await fetch(`${MENU_CONFIG.url}/functions/v1/order-push`, {method: "POST", headers, body: JSON.stringify({ensure_keys: true}), credentials: "omit"});
      key = response.ok ? (await response.json())?.public_key : null;
    }
    if (typeof key === "string" && /^[A-Za-z0-9_-]{86,88}$/.test(key)) pushState.key = key;
  } catch (_) { /* no push on this visit */ }
  return pushState.key;
}
async function pushRegistration() {
  const registration = await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  return registration;
}
async function pushSave(subscription, order) {
  const json = subscription.toJSON();
  await customerOrderRpc("oracy_customer_push_subscribe_v1", {
    p_restaurant_id: MENU_CONFIG.restaurantId,
    p_subscription: {endpoint: json.endpoint, keys: {p256dh: json.keys?.p256dh, auth: json.keys?.auth}},
    p_lang: state.lang === "ar" ? "ar" : "en",
    p_order_id: order?.id || null, p_tracking_token: order?.token || null,
  });
}
/** The customer tapped "Turn on": ask the browser, subscribe, tell the server. */
async function pushEnable(orderId, token) {
  if (pushState.busy || !pushSupported()) return;
  pushState.busy = true; pushState.error = "";
  pushRefreshCards();
  try {
    const key = await pushPublicKey();
    if (!key) throw new Error(pushCopy("Notifications are not available right now.", "الإشعارات غير متاحة حالياً."));
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error(permission === "denied"
      ? pushCopy("Notifications are blocked for this site in your browser settings.", "الإشعارات محظورة لهذا الموقع في إعدادات المتصفح.")
      : pushCopy("Notifications were not turned on.", "لم يتم تفعيل الإشعارات."));
    const registration = await pushRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && subscription.options?.applicationServerKey &&
        btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== key) {
      await subscription.unsubscribe();   // made for an older key
      subscription = null;
    }
    subscription ||= await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: pushKeyBytes(key)});
    await pushSave(subscription, orderId ? {id: orderId, token: token || null} : null);
    if (orderId) pushFollowed.add(orderId);
    pushState.subscribed = true;
    toast(pushCopy("Notifications are on for your orders.", "تم تفعيل الإشعارات لطلباتك."), 3000);
  } catch (error) {
    pushState.error = String(error?.message || error);
  } finally {
    pushState.busy = false;
    pushRefreshCards();
  }
}
/** Already allowed on this device: quietly tie it to this order too (guests) and keep the language current. */
async function pushFollowOrder(orderId, token) {
  if (!pushSupported() || Notification.permission !== "granted" || !orderId) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration && await registration.pushManager.getSubscription();
    if (!subscription) return;
    await pushSave(subscription, {id: orderId, token: token || null});
    pushState.subscribed = true;
  } catch (_) { /* the Orders screen still shows the status */ }
}
async function pushCheck() {
  if (pushState.checked) return;
  pushState.checked = true;
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration && await registration.pushManager.getSubscription();
    pushState.subscribed = !!subscription && Notification.permission === "granted";
  } catch (_) {}
  await pushPublicKey();
  pushRefreshCards();
}
/** The small card under an open order. order = {id, token}. */
function pushCardMarkup(order) {
  // Only server-issued ids ever reach the button's handler.
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!order?.id || !uuid.test(order.id) || (order.token && !uuid.test(order.token))) return "";
  const args = `'${order.id}','${order.token || ""}'`;
  if (!pushSupported()) {
    // iPhone / iPad: push works only for an app added to the Home Screen.
    if (!pushIsIos() || pushStandalone() || pushDismissed()) return "";
    return `<div class="push-card" data-push-card="1">
      <strong>${pushCopy("Get a notification when your order is ready", "احصل على إشعار عند جاهزية طلبك")}</strong>
      <span>${pushCopy("On iPhone: tap Share, then “Add to Home Screen”, and open the app from there.",
        "على الآيفون: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية» وافتح التطبيق من هناك.")}</span>
      <button type="button" class="link" onclick="pushDismiss()">${pushCopy("Not now", "ليس الآن")}</button></div>`;
  }
  pushCheck();
  if (!pushState.key) return `<div data-push-card="1" hidden></div>`;
  if (Notification.permission === "granted" && pushState.subscribed) {
    pushFollowOrderOnce(order.id, order.token);
    return `<div class="push-card push-on" data-push-card="1"><span>${pushCopy("Notifications are on for this order.", "الإشعارات مفعّلة لهذا الطلب.")}</span></div>`;
  }
  if (Notification.permission === "denied" || (pushDismissed() && !pushState.error)) return `<div data-push-card="1" hidden></div>`;
  return `<div class="push-card" data-push-card="1">
    <strong>${pushCopy("Get a notification when your order is ready", "احصل على إشعار عند جاهزية طلبك")}</strong>
    ${pushState.error ? `<span class="push-error" role="alert">${escapeHtml(pushState.error)}</span>` : ""}
    <div class="push-actions"><button type="button" class="btn btn-primary" ${pushState.busy ? "disabled" : ""} onclick="pushEnable(${args})">
      ${pushState.busy ? pushCopy("Turning on…", "جارٍ التفعيل…") : pushCopy("Turn on", "تفعيل")}</button>
    <button type="button" class="link" onclick="pushDismiss()">${pushCopy("Not now", "ليس الآن")}</button></div></div>`;
}
const pushFollowed = new Set();
function pushFollowOrderOnce(id, token) {
  if (pushFollowed.has(id)) return;
  pushFollowed.add(id);
  pushFollowOrder(id, token);
}
function pushRefreshCards() {
  if (typeof document === "undefined") return;
  if (["track", "confirmation"].includes(state.screen) && typeof renderKeepScroll === "function") renderKeepScroll();
}
/** Called after every draw: the confirmation screen gets the card under its message. */
function pushAfterRender() {
  if (state.screen !== "confirmation" || !state.order?.backendId || typeof document === "undefined") return;
  const box = document.querySelector(".confirmation-screen .success");
  if (!box || box.querySelector("[data-push-card]")) return;
  box.insertAdjacentHTML("beforeend", pushCardMarkup({id: state.order.backendId, token: state.order.trackingToken}));
}
/* The service worker is registered on every visit (it also makes the app installable). */
if (pushSupported()) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "oracy-open-orders" && typeof go === "function") { state.orderTab = "active"; go("track"); }
  });
}
/* Opened from a notification: straight to the Orders screen. */
function pushOpenFromLink() {
  try {
    if (new URLSearchParams(location.search).get("orders") !== "1") return;
    history.replaceState(history.state, "", location.pathname);
    state.orderTab = "active";
    if (typeof go === "function") go("track");
  } catch (_) {}
}
if (typeof window !== "undefined") window.addEventListener("load", () => setTimeout(pushOpenFromLink, 400));
/* Signing out: this device stops following the account (it can be turned on again for an order). */
async function pushDetach() {
  pushState.subscribed = false;
  pushFollowed.clear();
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration && await registration.pushManager.getSubscription();
    if (!subscription) return;
    // Gate 2 (migration 271): the subscription's own secret proves this device asks.
    const keys = (typeof subscription.toJSON === "function" && subscription.toJSON().keys) || {};
    try {
      await customerOrderRpc("oracy_customer_push_unsubscribe_v1", {p_endpoint: subscription.endpoint, p_auth: keys.auth || null});
    } catch (_) { /* the server row goes on the next failed push; the device still forgets */ }
    await subscription.unsubscribe();
  } catch (_) { /* the device simply keeps its last state */ }
}
