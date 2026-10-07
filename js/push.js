/* Batch P (259): order notifications when the app is closed (Web Push).
 * Permission is asked only after an order exists, and only when the customer taps "Turn on". */
const pushState = {key: null, keyTried: false, subscribed: false, busy: false, error: "", checked: false};
const PUSH_DISMISS_KEY = "oracy_push_dismissed";
function pushCopy(en, ar) { return state.lang === "ar" ? ar : en; }
/* Batch E: notifications switched off for the restaurant = never ask, never subscribe. */
function pushAllowed() { return typeof featureOn !== "function" || featureOn("push"); }
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
/** Ask the browser, subscribe, tell the server. order = {id, token} or null (a signed-in customer). Throws a plain message. */
async function pushSubscribe(order) {
  const key = await pushPublicKey();
  if (!key) throw new Error(pushCopy("Notifications are not available right now.", "الإشعارات غير متاحة حالياً."));
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied"
    ? pushBlockedText() : pushCopy("Notifications were not turned on.", "لم يتم تفعيل الإشعارات."));
  const registration = await pushRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && subscription.options?.applicationServerKey &&
      btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== key) {
    await subscription.unsubscribe();   // made for an older key
    subscription = null;
  }
  subscription ||= await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: pushKeyBytes(key)});
  await pushSave(subscription, order);
  return subscription;
}
function pushBlockedText() {
  return pushCopy("Notifications are blocked for this site in your browser settings.", "الإشعارات محظورة لهذا الموقع في إعدادات المتصفح.");
}
/** The customer tapped "Turn on" under an order. This never agrees to offers: that is its own switch. */
async function pushEnable(orderId, token) {
  if (pushState.busy || !pushSupported() || !pushAllowed()) return;
  pushState.busy = true; pushState.error = "";
  pushRefreshCards();
  try {
    await pushSubscribe(orderId ? {id: orderId, token: token || null} : null);
    if (orderId) pushFollowed.add(orderId);
    pushState.subscribed = true;
    toast(pushCopy("Notifications are on for your orders.", "تم تفعيل الإشعارات لطلباتك."), 3000);
  } catch (error) {
    pushState.error = error?.hint === "module_off" && typeof moduleOffText === "function"
      ? moduleOffText(error.message) : String(error?.message || error);
  } finally {
    pushState.busy = false;
    pushRefreshCards();
  }
}
/** Already allowed on this device: quietly tie it to this order too (guests) and keep the language current. */
async function pushFollowOrder(orderId, token) {
  if (!pushAllowed() || !pushSupported() || Notification.permission !== "granted" || !orderId) return;
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
  // Batch 388: at a table the order comes to the guest; the card is not shown there (every screen draws it from here).
  if (typeof tableActive === "function" && tableActive()) return "";
  if (!pushAllowed()) return `<div data-push-card="1" hidden></div>`;
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
    return `<div class="push-card push-on" data-push-card="1"><span>${pushCopy("Notifications are on for this order.", "الإشعارات مفعّلة لهذا الطلب.")}</span>${pushOffersMarkup("card")}</div>`;
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
  if (["track", "confirmation", "account"].includes(state.screen) && typeof renderKeepScroll === "function") renderKeepScroll();
}
/** Called after every draw: the confirmation screen gets the card under its message. */
function pushAfterRender() {
  if (pushOffers.screen !== state.screen) {   // Batch PC: a screen with the offers switch asks the server again
    pushOffers.screen = state.screen;
    if (["track", "confirmation", "account"].includes(state.screen)) pushOffersLoad();
  }
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
    else if (event.data?.type === "oracy-open-offer") pushOpenOffer(event.data);
    else if (event.data?.type === "oracy-manage-offers") pushOffersManage();
  });
}
/* Opened from a notification: an order goes straight to the Orders screen, an offer to what it is about. */
function pushOpenFromLink() {
  try {
    const query = new URLSearchParams(location.search);
    const offer = query.has("go") ? {go: query.get("go"), id: query.get("id"), c: query.get("c")} : null;
    const manage = query.get("offers") === "manage";
    if (query.get("orders") !== "1" && !offer && !manage) return;
    history.replaceState(history.state, "", location.pathname);
    if (offer) { pushOpenOffer(offer); return; }
    if (manage) { pushOffersManage(); return; }
    state.orderTab = "active";
    if (typeof go === "function") go("track");
  } catch (_) {}
}
if (typeof window !== "undefined") window.addEventListener("load", () => setTimeout(pushOpenFromLink, 400));
/* Signing out: this device stops following the account (it can be turned on again for an order). */
async function pushDetach() {
  pushState.subscribed = false;
  pushFollowed.clear();
  pushOffers.on = false; pushOffers.error = "";   // Batch PC: the server forgets the agreement with the device
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

/* Batch PC (301): "Offers and news". A separate agreement, OFF until the customer switches it on here.
 * Only the switch itself ever agrees; the server's answer is the only thing that shows the switch as on. */
const pushOffers = {on: false, busy: false, error: "", screen: "", opened: new Set()};
const PUSH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function pushSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (registration && await registration.pushManager.getSubscription()) || null;
}
/** on: null reads, true agrees, false withdraws. The subscription's own secret proves this device asks. */
async function pushOffersRpc(subscription, on) {
  const keys = (typeof subscription.toJSON === "function" && subscription.toJSON().keys) || {};
  const answer = await customerOrderRpc("oracy_customer_push_offers_v1",
    {p_endpoint: subscription.endpoint, p_auth: keys.auth || null, p_on: on});
  const known = answer?.ok === true && answer.known === true;
  return {known, on: known && answer.on === true};
}
/** Read the server's state (never changes it). A failed read keeps what is shown. */
async function pushOffersLoad() {
  if (!pushAllowed() || pushOffers.busy) return;
  let on = pushOffers.on;
  try {
    const subscription = await pushSubscription();
    on = subscription ? (await pushOffersRpc(subscription, null)).on : false;
  } catch (_) {}
  if (pushOffers.busy || on === pushOffers.on) return;   // a tap in the meantime wins
  pushOffers.on = on;
  pushOffersRefresh();
}
/** The customer moved the switch. Shown at once, put back with a plain message if the server did not take it. */
async function pushOffersSet(wanted) {
  wanted = wanted === true;
  if (pushOffers.busy || !pushAllowed()) { pushOffersRefresh(); return; }
  const before = pushOffers.on;
  pushOffers.busy = true; pushOffers.error = ""; pushOffers.on = wanted;
  pushOffersRefresh();
  try {
    let subscription = await pushSubscription();
    if (wanted && !subscription) {
      // Account screen, device not set up yet: the usual permission question first (signed-in customers only).
      if (!state.isLoggedIn) throw new Error(pushOffersOrderFirstText());
      subscription = await pushSubscribe(null);
      pushState.subscribed = true;
    }
    if (subscription) {
      let answer = await pushOffersRpc(subscription, wanted);
      if (wanted && !answer.known) {
        // The server does not have this device (any more): save it again, then agree.
        if (!state.isLoggedIn) throw new Error(pushOffersOrderFirstText());
        await pushSave(subscription, null);
        answer = await pushOffersRpc(subscription, true);
      }
      if (answer.on !== wanted) throw new Error(pushCopy("This could not be changed. Please try again.", "تعذّر تغيير هذا الإعداد. يرجى المحاولة مرة أخرى."));
    }
  } catch (error) {
    pushOffers.on = before;
    pushOffers.error = error?.hint === "module_off" && typeof moduleOffText === "function"
      ? moduleOffText(error.message) : String(error?.message || error);
  } finally {
    pushOffers.busy = false;
    pushOffersRefresh();
  }
}
function pushOffersOrderFirstText() {
  return pushCopy("Turn on notifications for an order first, then switch on offers.", "فعّل إشعارات أحد طلباتك أولاً ثم فعّل العروض.");
}
/** The switch. place: "card" (under an order), "account" (signed-in Account screen), "sheet" (opened from "Stop offers"). */
function pushOffersMarkup(place) {
  if (!pushAllowed()) return "";
  const account = place === "account", sheet = place === "sheet";
  let usable = false, note = "";
  if (!pushSupported()) {
    // iPhone / iPad: push works only for an app added to the Home Screen.
    if (!sheet && (!account || !pushIsIos() || pushStandalone())) return "";
    note = account ? pushCopy("On iPhone: tap Share, then “Add to Home Screen”, and open the app from there.",
      "على الآيفون: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية» وافتح التطبيق من هناك.") : "";
  } else {
    if (account) pushCheck();
    if (Notification.permission === "granted" && pushState.subscribed) usable = true;
    else if (Notification.permission === "denied") { if (place === "card") return ""; note = pushBlockedText(); }
    else if (account && pushState.key) usable = true;      // switching on asks the browser first
    else if (!sheet) return "";                            // the server has no push: nothing to offer
  }
  if (!usable && !note) note = pushCopy("Offers are off on this device.", "العروض متوقفة على هذا الجهاز.");
  const copy = `<strong>${pushCopy("Offers and news", "العروض والأخبار")}</strong>
      <span>${usable ? pushCopy("Occasional offers from this restaurant. Never more than one a day. You can turn this off at any time.",
        "عروض من هذا المطعم بين حين وآخر. لا تزيد عن عرض واحد في اليوم. يمكنك إيقافها في أي وقت.") : note}</span>
      ${usable && pushOffers.error ? `<span class="push-error" role="alert">${escapeHtml(pushOffers.error)}</span>` : ""}`;
  const control = usable ? `<input type="checkbox" role="switch" class="push-switch" ${pushOffers.on ? "checked" : ""} ${pushOffers.busy ? "disabled" : ""}
      onchange="pushOffersSet(this.checked)">` : "";
  const tag = usable ? "label" : "div";
  if (account) return `<${tag} class="account-list-item push-offers" data-push-offers="account">
      <div class="account-list-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"></path><path d="M15 9a4 4 0 0 1 0 6"></path><path d="M18 6a8 8 0 0 1 0 12"></path></svg></div>
      <div class="account-list-copy">${copy}</div>${control}</${tag}>`;
  return `<${tag} class="push-offers" data-push-offers="${sheet ? "sheet" : "card"}">${control}<div class="push-offers-copy">${copy}</div></${tag}>`;
}
/** Redraw only the switches (order card, Account row, sheet): no screen jump while the customer taps. */
function pushOffersRefresh() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-push-offers]").forEach((old) => {
    const focused = old.contains(document.activeElement);
    const holder = document.createElement("template");
    holder.innerHTML = pushOffersMarkup(old.getAttribute("data-push-offers"));
    const next = holder.content.firstElementChild;
    if (!next) { old.remove(); return; }
    old.replaceWith(next);
    if (focused) next.querySelector("input")?.focus();
  });
}
/** "Stop offers" on a notification: bring the customer to the switch (two taps at most to stop). */
async function pushOffersManage() {
  if (!pushAllowed() || typeof document === "undefined" || typeof go !== "function") return;
  pushState.checked = false;
  await pushCheck();
  await pushOffersLoad();
  if (state.isLoggedIn) go("account"); else { state.orderTab = "active"; go("track"); }
  const row = document.querySelector("#app [data-push-offers]");
  if (row) { if (typeof row.scrollIntoView === "function") row.scrollIntoView({block: "center"}); return; }
  pushOffersSheetClose();
  (document.querySelector(".phone") || document.body).insertAdjacentHTML("beforeend",
    `<div class="push-sheet" id="pushOffersSheet" role="dialog" aria-label="${pushCopy("Offers and news", "العروض والأخبار")}">${pushOffersMarkup("sheet")}
      <button type="button" class="link" onclick="pushOffersSheetClose()">${pushCopy("Close", "إغلاق")}</button></div>`);
}
function pushOffersSheetClose() { document.getElementById("pushOffersSheet")?.remove(); }
/** Only these four words and real ids are ever used from an offer notification or link. */
function pushOfferTarget(data) {
  const text = (value) => (typeof value === "string" ? value : "");
  let kind = ["menu", "offers", "category", "item"].includes(text(data?.go)) ? data.go : "menu";
  const id = (kind === "category" || kind === "item") && PUSH_UUID.test(text(data?.id)) ? data.id : null;
  if ((kind === "category" || kind === "item") && !id) kind = "menu";
  return {kind, id, campaign: PUSH_UUID.test(text(data?.c)) ? data.c.toLowerCase() : null};
}
function pushMenuLoaded() {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      if (typeof menuReady !== "function" || menuReady() || ++tries > 32) resolve();   // 8 s at most
      else setTimeout(check, 250);
    };
    check();
  });
}
/** Opened from an offer: the same places, by the same rules, as a home banner. Anything gone → the menu. */
async function pushOpenOffer(data) {
  const target = pushOfferTarget(data);
  pushOfferOpened(target.campaign);
  await pushMenuLoaded();
  if (typeof go !== "function") return;
  if (target.kind === "item" && canOrderItem(itemById(target.id))) openItem(target.id);
  else if (target.kind === "category" && CATEGORIES.some(c => c.id === target.id) &&
    ITEMS.some(i => i.category === target.id && canOrderItem(i))) go("listing", {categoryId: target.id, subcategoryId: ""});
  else if (target.kind === "offers" && ITEMS.some(i => i.offer && canOrderItem(i))) go("offers");
  else go("menu");
}
/** Tell the restaurant its offer was opened: once per offer, never shown, never waited for. */
async function pushOfferOpened(campaign) {
  if (!campaign || pushOffers.opened.has(campaign) || !pushAllowed()) return;
  pushOffers.opened.add(campaign);
  try {
    const subscription = await pushSubscription();
    if (!subscription) return;
    const keys = (typeof subscription.toJSON === "function" && subscription.toJSON().keys) || {};
    await customerOrderRpc("oracy_customer_push_opened_v1",
      {p_campaign_id: campaign, p_endpoint: subscription.endpoint, p_auth: keys.auth || null});
  } catch (_) { /* a count for the restaurant only */ }
}
